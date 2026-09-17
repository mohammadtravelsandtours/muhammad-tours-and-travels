import { Injectable } from '@nestjs/common';
import { NormalizedFlightOffer, SearchChannel } from '@mohammad-travels/types';
import { PrismaService } from '../../prisma/prisma.service';
import { PricingService } from './pricing.service';
import { computeFingerprint } from './fingerprint';
import { buildTransitVisaWarning } from './transit-visa-warning';

export interface RawSupplierOffer {
  supplierId: string;
  offer: NormalizedFlightOffer;
}

export interface PersistOffersInput {
  searchId: string;
  offers: RawSupplierOffer[];
  channel: SearchChannel;
  agencyId?: string;
  nationality?: string;
}

/**
 * Turns raw adapter output into priced, persisted FlightOffer rows —
 * the "normalize → dedupe → price → markup → rank" middle of the search
 * pipeline. Adapter-facing shapes (NormalizedFlightOffer) never reach
 * the controller directly; only what's persisted here does, so every
 * offer a client sees has a stable database id it can reprice/book
 * against later.
 */
@Injectable()
export class FlightNormalizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
  ) {}

  async persistOffers(input: PersistOffersInput) {
    const cheapestByFingerprint = this.dedupe(input.offers);

    const persisted = [];
    for (const { supplierId, offer, fingerprint } of cheapestByFingerprint) {
      const route = `${offer.segments[0].origin}-${offer.segments[offer.segments.length - 1].destination}`;
      const { markupAmount } = await this.pricing.computeMarkup(offer.baseFare, {
        supplierId,
        airlineCode: offer.validatingCarrier,
        route,
        cabin: offer.cabin,
        fareFamily: offer.fareFamily,
        agencyId: input.agencyId,
      });
      const totalFare = round2(offer.baseFare + offer.taxes + offer.fees + markupAmount);
      const transitVisaWarning = buildTransitVisaWarning(offer, input.nationality);

      const row = await this.prisma.flightOffer.create({
        data: {
          searchId: input.searchId,
          supplierId,
          supplierOfferId: offer.supplierOfferId,
          fingerprint,
          isMock: offer.isMock,
          validatingCarrier: offer.validatingCarrier,
          cabin: offer.cabin,
          fareFamily: offer.fareFamily,
          stops: offer.stops,
          totalDurationMinutes: offer.totalDurationMinutes,
          baseFare: offer.baseFare,
          taxes: offer.taxes,
          fees: offer.fees,
          markupAmount,
          totalFare,
          currency: offer.currency,
          refundable: offer.refundable,
          changeable: offer.changeable,
          baggageCheckedKg: offer.baggage.checkedKg ?? null,
          baggageCarryOnKg: offer.baggage.carryOnKg ?? null,
          baggageNote: offer.baggage.note ?? null,
          seatsAvailable: offer.seatsAvailable,
          ticketingDeadline: offer.ticketingDeadline ? new Date(offer.ticketingDeadline) : null,
          fareRules: offer.fareRules ?? undefined,
          transitVisaWarning: transitVisaWarning ?? undefined,
          segments: {
            create: offer.segments.map((s) => ({
              sequence: s.sequence,
              marketingCarrier: s.marketingCarrier,
              operatingCarrier: s.operatingCarrier,
              flightNumber: s.flightNumber,
              origin: s.origin,
              destination: s.destination,
              departureAt: new Date(s.departureAt),
              arrivalAt: new Date(s.arrivalAt),
              durationMinutes: s.durationMinutes,
              aircraft: s.aircraft ?? null,
              bookingClass: s.bookingClass,
            })),
          },
        },
        include: { segments: { orderBy: { sequence: 'asc' } } },
      });
      persisted.push(row);
    }

    // Rank: cheapest total fare first, shortest duration breaks ties.
    persisted.sort(
      (a, b) => Number(a.totalFare) - Number(b.totalFare) || a.totalDurationMinutes - b.totalDurationMinutes,
    );
    return persisted;
  }

  /**
   * Identical itinerary/cabin/fare-family across suppliers is the same
   * product to a traveler — keep only the cheapest instance. Comparing
   * on baseFare+taxes+fees (pre-markup) is deliberate: markup is applied
   * per-offer afterward and shouldn't influence which supplier "wins"
   * the dedup, since two suppliers' identical seats shouldn't be ranked
   * by an unrelated pricing-rule accident.
   */
  private dedupe(offers: RawSupplierOffer[]): Array<RawSupplierOffer & { fingerprint: string }> {
    const byFingerprint = new Map<string, RawSupplierOffer & { fingerprint: string }>();
    for (const entry of offers) {
      const fingerprint = computeFingerprint(entry.offer);
      const existing = byFingerprint.get(fingerprint);
      const total = entry.offer.baseFare + entry.offer.taxes + entry.offer.fees;
      const existingTotal = existing ? existing.offer.baseFare + existing.offer.taxes + existing.offer.fees : Infinity;
      if (!existing || total < existingTotal) {
        byFingerprint.set(fingerprint, { ...entry, fingerprint });
      }
    }
    return [...byFingerprint.values()];
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
