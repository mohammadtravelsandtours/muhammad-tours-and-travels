import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { NormalizedHotelOffer, SearchChannel } from '@mohammad-travels/types';
import { PrismaService } from '../../prisma/prisma.service';
import { HotelSupplierRegistry } from './hotel-supplier-registry.service';

export interface RunHotelSearchInput {
  city: string;
  checkInDate: string;
  checkOutDate: string;
  adults: number;
  children?: number;
  rooms?: number;
  currency: string;
  channel: SearchChannel;
  requestedByUserId?: string;
}

const SEARCH_TTL_MINUTES = 30;
const SUPPLIER_TIMEOUT_MS = 8000; // fixed — hotel suppliers have no `suppliers` DB row to hold a per-supplier timeout (see HotelSupplierRegistry's doc comment)

class HotelSupplierTimeoutError extends Error {}

/**
 * Hotel counterpart of FlightSearchOrchestratorService, deliberately
 * narrower: never invents a property — it looks up real, already-seeded
 * HotelProperty rows matching the requested city and calls every
 * registered adapter once PER property (see HotelSearchRequest's doc
 * comment in hotels.ts). An unseeded city returns zero properties and
 * therefore zero offers, never a fabricated one. No markup engine (Phase
 * 6 scope decision, noted in docs/ROADMAP.md): every HotelOffer persists
 * with markupAmount 0, totalFare = baseFare + taxes + fees.
 */
@Injectable()
export class HotelSearchOrchestratorService {
  private readonly logger = new Logger(HotelSearchOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: HotelSupplierRegistry,
  ) {}

  async search(input: RunHotelSearchInput) {
    this.validate(input);

    const checkIn = new Date(`${input.checkInDate}T00:00:00.000Z`);
    const checkOut = new Date(`${input.checkOutDate}T00:00:00.000Z`);
    const rooms = input.rooms ?? 1;

    const search = await this.prisma.hotelSearch.create({
      data: {
        channel: input.channel,
        requestedByUserId: input.requestedByUserId ?? null,
        city: input.city,
        checkInDate: checkIn,
        checkOutDate: checkOut,
        adults: input.adults,
        children: input.children ?? 0,
        rooms,
        currency: input.currency,
        expiresAt: new Date(Date.now() + SEARCH_TTL_MINUTES * 60_000),
      },
    });

    const properties = await this.prisma.hotelProperty.findMany({
      where: { city: { equals: input.city, mode: 'insensitive' } },
      orderBy: { name: 'asc' },
    });

    const adapters = this.registry.getAll();
    if (properties.length === 0) {
      this.logger.log(`No seeded hotel properties for city "${input.city}" — returning zero offers rather than fabricating any.`);
    }
    if (adapters.length === 0) {
      this.logger.warn('No hotel supplier adapters registered — search will return zero offers.');
    }

    const persisted = [];
    for (const adapter of adapters) {
      const runStats = { latencyMsTotal: 0, offerCount: 0, calls: 0, errors: [] as string[] };
      for (const property of properties) {
        const startedAt = Date.now();
        try {
          const offers = await withTimeout(
            adapter.searchHotels({
              property: { id: property.id, name: property.name, city: property.city, country: property.country, starRating: property.starRating ?? undefined },
              checkInDate: input.checkInDate,
              checkOutDate: input.checkOutDate,
              adults: input.adults,
              children: input.children,
              rooms,
              currency: input.currency,
            }),
            SUPPLIER_TIMEOUT_MS,
          );
          runStats.latencyMsTotal += Date.now() - startedAt;
          runStats.calls += 1;
          runStats.offerCount += offers.length;
          for (const offer of offers) {
            persisted.push(await this.persistOffer(search.id, property.id, offer));
          }
        } catch (err) {
          const isTimeout = err instanceof HotelSupplierTimeoutError;
          const message = err instanceof Error ? err.message : String(err);
          runStats.latencyMsTotal += Date.now() - startedAt;
          runStats.calls += 1;
          runStats.errors.push(`${property.name}: ${isTimeout ? 'timeout' : message}`);
          this.logger.warn(`Hotel supplier ${adapter.supplierCode} contributed no offers for property ${property.name} (${isTimeout ? 'timeout' : 'error'}): ${message}`);
        }
      }

      await this.prisma.hotelSearchSupplierRun.create({
        data: {
          searchId: search.id,
          supplierCode: adapter.supplierCode,
          status: runStats.errors.length === 0 ? 'SUCCESS' : runStats.offerCount > 0 ? 'PARTIAL' : 'ERROR',
          latencyMs: runStats.calls > 0 ? Math.round(runStats.latencyMsTotal / runStats.calls) : null,
          offerCount: runStats.offerCount,
          errorMessage: runStats.errors.length > 0 ? runStats.errors.join('; ').slice(0, 500) : null,
        },
      });
    }

    persisted.sort((a, b) => Number(a.totalFare) - Number(b.totalFare));
    return { searchId: search.id, offers: persisted };
  }

  private async persistOffer(searchId: string, propertyId: string, offer: NormalizedHotelOffer) {
    const totalFare = round2(offer.baseFare + offer.taxes + offer.fees);
    return this.prisma.hotelOffer.create({
      data: {
        searchId,
        propertyId,
        supplierCode: offer.supplierCode,
        supplierOfferId: offer.supplierOfferId,
        isMock: offer.isMock,
        roomType: offer.roomType,
        board: offer.board,
        refundable: offer.refundable,
        nights: offer.nights,
        baseFare: offer.baseFare,
        taxes: offer.taxes,
        fees: offer.fees,
        markupAmount: 0,
        totalFare,
        currency: offer.currency,
      },
      include: { property: true },
    });
  }

  private validate(input: RunHotelSearchInput): void {
    if (!input.city || input.city.trim().length < 2) {
      throw new BadRequestException('city is required');
    }
    const checkIn = new Date(`${input.checkInDate}T00:00:00.000Z`);
    const checkOut = new Date(`${input.checkOutDate}T00:00:00.000Z`);
    if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime())) {
      throw new BadRequestException('checkInDate/checkOutDate must be valid ISO dates');
    }
    if (checkOut <= checkIn) {
      throw new BadRequestException('checkOutDate must be after checkInDate');
    }
    if ((input.rooms ?? 1) < 1 || (input.rooms ?? 1) > 9) {
      throw new BadRequestException('rooms must be between 1 and 9');
    }
    if (input.adults < 1 || input.adults > 20) {
      throw new BadRequestException('adults must be between 1 and 20');
    }
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new HotelSupplierTimeoutError(`Hotel supplier call exceeded its ${ms}ms timeout`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
