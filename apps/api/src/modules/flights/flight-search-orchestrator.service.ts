import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { FlightSearchRequest, FlightSupplierAdapter, NormalizedFlightOffer, SearchChannel } from '@mohammad-travels/types';
import { PrismaService } from '../../prisma/prisma.service';
import { SupplierRegistry } from '../suppliers/supplier-registry.service';
import { FlightNormalizationService } from './flight-normalization.service';

export interface RunSearchInput {
  request: FlightSearchRequest;
  channel: SearchChannel;
  requestedByUserId?: string;
  /** Present only for a B2B-channel search tied to a specific agency — used for AGENCY-scoped markup rules. */
  agencyId?: string;
}

const SEARCH_TTL_MINUTES = 30; // offers/prices are treated as stale after this — the booking flow's mandatory reprice re-checks anyway

class SupplierTimeoutError extends Error {}

/**
 * Step 6 of docs/SUPPLIER-INTEGRATION.md's search pipeline: validate →
 * create the search record → fan out to every active supplier
 * CONCURRENTLY, each with its own timeout, each independently caught —
 * one supplier failing or timing out must never fail the whole search
 * (see runOneSupplier) → hand the raw results to FlightNormalizationService
 * for dedupe/pricing/persistence.
 */
@Injectable()
export class FlightSearchOrchestratorService {
  private readonly logger = new Logger(FlightSearchOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly supplierRegistry: SupplierRegistry,
    private readonly normalization: FlightNormalizationService,
  ) {}

  async search(input: RunSearchInput) {
    await this.validateRequest(input.request);

    const search = await this.prisma.flightSearch.create({
      data: {
        channel: input.channel,
        requestedByUserId: input.requestedByUserId ?? null,
        tripType: input.request.tripType,
        cabin: input.request.cabin,
        adults: input.request.adults,
        children: input.request.children ?? 0,
        infants: input.request.infants ?? 0,
        nationality: input.request.nationality ?? null,
        currency: input.request.currency,
        status: 'PENDING',
        expiresAt: new Date(Date.now() + SEARCH_TTL_MINUTES * 60_000),
        segments: {
          create: input.request.segments.map((s, i) => ({
            sequence: i,
            origin: s.origin.toUpperCase(),
            destination: s.destination.toUpperCase(),
            departureDate: new Date(`${s.departureDate}T00:00:00.000Z`),
          })),
        },
      },
    });

    const activeSuppliers = await this.supplierRegistry.getActiveAdapters();
    if (activeSuppliers.length === 0) {
      this.logger.warn('No active supplier adapters found (registered in code AND active in the database) — search will return zero offers.');
    }

    const settled = await Promise.allSettled(
      activeSuppliers.map(({ supplier, adapter }) => this.runOneSupplier(search.id, supplier, adapter, input.request)),
    );

    const rawOffers: Array<{ supplierId: string; offer: NormalizedFlightOffer }> = [];
    for (const result of settled) {
      // runOneSupplier catches everything itself and always resolves
      // (never rejects) — this branch is defensive, not load-bearing.
      if (result.status === 'fulfilled') rawOffers.push(...result.value);
    }

    const offers = await this.normalization.persistOffers({
      searchId: search.id,
      offers: rawOffers,
      channel: input.channel,
      agencyId: input.agencyId,
      nationality: input.request.nationality,
    });

    await this.prisma.flightSearch.update({ where: { id: search.id }, data: { status: 'COMPLETED' } });

    return { searchId: search.id, offers };
  }

  /**
   * Every failure mode (timeout, thrown error, rejected promise) is
   * caught HERE, recorded as a SearchSupplierRun row, and turned into an
   * empty result — never a rejection that would propagate up and cancel
   * the other suppliers' still-in-flight calls or fail the whole search.
   */
  private async runOneSupplier(
    searchId: string,
    supplier: { id: string; code: string; timeoutMs: number },
    adapter: FlightSupplierAdapter,
    request: FlightSearchRequest,
  ): Promise<Array<{ supplierId: string; offer: NormalizedFlightOffer }>> {
    const startedAt = Date.now();
    try {
      const offers = await withTimeout(adapter.searchFlights(request), supplier.timeoutMs);
      const latencyMs = Date.now() - startedAt;
      await this.prisma.searchSupplierRun.create({
        data: { searchId, supplierId: supplier.id, status: 'SUCCESS', latencyMs, offerCount: offers.length },
      });
      await this.recordSupplierHealth(supplier.id, { success: true, latencyMs });
      return offers.map((offer) => ({ supplierId: supplier.id, offer }));
    } catch (err) {
      const isTimeout = err instanceof SupplierTimeoutError;
      const message = err instanceof Error ? err.message : String(err);
      const latencyMs = Date.now() - startedAt;
      await this.prisma.searchSupplierRun.create({
        data: { searchId, supplierId: supplier.id, status: isTimeout ? 'TIMEOUT' : 'ERROR', latencyMs, offerCount: 0, errorMessage: message.slice(0, 500) },
      });
      await this.recordSupplierHealth(supplier.id, { success: false, latencyMs, isTimeout, errorMessage: message.slice(0, 500) });
      this.logger.warn(`Supplier ${supplier.code} contributed no offers (${isTimeout ? 'timeout' : 'error'}): ${message}`);
      return [];
    }
  }

  /**
   * Rolls each search run into a single current-status row per supplier
   * (SupplierHealth — see its schema.prisma comment) so an admin health
   * dashboard has something to read without scanning SearchSupplierRun
   * history itself. A heuristic, not a precise SLA measurement: 3+
   * consecutive failures reads as OFFLINE, 1-2 as DEGRADED, a timeout is
   * reported as TIMEOUT specifically since that's actionable
   * information (raise the timeout vs. fix an auth error) that a flat
   * "ERROR" status would lose.
   */
  private async recordSupplierHealth(
    supplierId: string,
    outcome: { success: true; latencyMs: number } | { success: false; latencyMs: number; isTimeout: boolean; errorMessage: string },
  ): Promise<void> {
    try {
      const existing = await this.prisma.supplierHealth.findUnique({ where: { supplierId } });
      const previousAvg = existing?.avgResponseMs ?? null;
      const avgResponseMs = previousAvg === null ? outcome.latencyMs : Math.round(previousAvg * 0.7 + outcome.latencyMs * 0.3);

      if (outcome.success) {
        await this.prisma.supplierHealth.upsert({
          where: { supplierId },
          create: { supplierId, status: 'ONLINE', lastSuccessAt: new Date(), avgResponseMs, consecutiveErrors: 0 },
          update: { status: 'ONLINE', lastSuccessAt: new Date(), avgResponseMs, consecutiveErrors: 0 },
        });
        return;
      }

      const consecutiveErrors = (existing?.consecutiveErrors ?? 0) + 1;
      const status = outcome.isTimeout ? 'TIMEOUT' : consecutiveErrors >= 3 ? 'OFFLINE' : 'DEGRADED';
      await this.prisma.supplierHealth.upsert({
        where: { supplierId },
        create: { supplierId, status, lastErrorAt: new Date(), lastErrorMessage: outcome.errorMessage, avgResponseMs, consecutiveErrors },
        update: { status, lastErrorAt: new Date(), lastErrorMessage: outcome.errorMessage, avgResponseMs, consecutiveErrors },
      });
    } catch (err) {
      // Health tracking is observability, never load-bearing — a failure
      // here must never affect the search that's actually in flight.
      this.logger.warn(`Failed to record supplier health for ${supplierId}: ${(err as Error).message}`);
    }
  }

  private async validateRequest(request: FlightSearchRequest): Promise<void> {
    const expectedSegments = request.tripType === 'ONE_WAY' ? 1 : request.tripType === 'ROUND_TRIP' ? 2 : null;
    if (expectedSegments !== null && request.segments.length !== expectedSegments) {
      throw new BadRequestException(`${request.tripType} requires exactly ${expectedSegments} segment(s)`);
    }
    if (request.tripType === 'MULTI_CITY' && request.segments.length < 2) {
      throw new BadRequestException('MULTI_CITY requires at least 2 segments');
    }

    for (const segment of request.segments) {
      if (segment.origin.toUpperCase() === segment.destination.toUpperCase()) {
        throw new BadRequestException(`A segment's origin and destination cannot both be "${segment.origin}"`);
      }
    }

    if ((request.infants ?? 0) > request.adults) {
      throw new BadRequestException('Each infant must be accompanied by an adult');
    }
    const totalPax = request.adults + (request.children ?? 0) + (request.infants ?? 0);
    if (totalPax > 9) {
      throw new BadRequestException('A single search supports at most 9 travelers');
    }

    const codes = [...new Set(request.segments.flatMap((s) => [s.origin.toUpperCase(), s.destination.toUpperCase()]))];
    const known = await this.prisma.airport.findMany({
      where: { iataCode: { in: codes } },
      select: { iataCode: true },
    });
    const knownCodes = new Set(known.map((a) => a.iataCode));
    const unknown = codes.filter((c) => !knownCodes.has(c));
    if (unknown.length > 0) {
      throw new BadRequestException(`Unknown airport code(s): ${unknown.join(', ')}`);
    }
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new SupplierTimeoutError(`Supplier call exceeded its ${ms}ms timeout`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}
