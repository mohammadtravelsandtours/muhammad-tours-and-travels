import {
  CancelBookingRequest,
  CancelBookingResult,
  CreateBookingRequest,
  CreateBookingResult,
  FlightSearchRequest,
  FlightSearchSegmentInput,
  FlightSupplierAdapter,
  IssueTicketRequest,
  IssueTicketResult,
  NormalizedFlightOffer,
  NormalizedFlightSegment,
  RefundBookingRequest,
  RefundBookingResult,
  RepriceRequest,
  RepriceResult,
} from '@mohammad-travels/types';
import { CABIN_MULTIPLIER, MockAdapterProfile } from './mock-adapter-profile';
import { pick, randomAlphaNumeric, randomInt, seededRandom } from './deterministic-random';

/**
 * Shared engine behind every MOCK_SUPPLIER_* adapter. What makes each
 * supplier feel different (price level, carriers, baggage policy, stop
 * pattern, latency) lives entirely in the MockAdapterProfile it's built
 * with — see docs/SUPPLIER-INTEGRATION.md § Mock suppliers. Nothing here
 * is a real fare model; it exists to give the search orchestrator (Step
 * 6) genuinely varied, genuinely comparable data to aggregate, dedupe,
 * and rank, and to give it real hooks (`failureRateEnvVar`,
 * `MOCK_REPRICE_DRIFT_PCT`) for exercising partial-failure and
 * price-change-confirmation handling on demand.
 *
 * Deliberately stateless: a `supplierOfferId` is a self-describing,
 * base64url-encoded payload (route/date/cabin/pax/fare-index), so
 * repriceFlight/createBooking can reconstruct the same offer without any
 * shared database — persistence into FlightOffer happens one layer up,
 * once results come back from the registry (Step 6/7).
 */
const HUB_POOL = ['DXB', 'DOH', 'AUH', 'SIN', 'BKK', 'KUL', 'IST', 'CAN', 'HKG', 'CMB'] as const;

const BOOKING_CLASS_BY_CABIN_AND_FARE_INDEX: Record<string, [string, string]> = {
  ECONOMY: ['Q', 'Y'],
  PREMIUM_ECONOMY: ['S', 'W'],
  BUSINESS: ['D', 'J'],
  FIRST: ['A', 'F'],
};

interface MockOfferPayload {
  supplierCode: string;
  legs: FlightSearchSegmentInput[];
  cabin: FlightSearchRequest['cabin'];
  currency: string;
  adults: number;
  children: number;
  infants: number;
  fareIndex: 0 | 1;
}

export class MockFlightSupplierAdapter implements FlightSupplierAdapter {
  readonly supplierCode: string;

  constructor(private readonly profile: MockAdapterProfile) {
    this.supplierCode = profile.supplierCode;
  }

  async searchFlights(request: FlightSearchRequest): Promise<NormalizedFlightOffer[]> {
    await this.simulateLatency();
    this.maybeFail('searchFlights');

    const offers: NormalizedFlightOffer[] = [];
    for (const fareIndex of [0, 1] as const) {
      offers.push(this.buildOffer(request, fareIndex));
    }
    return offers;
  }

  async repriceFlight(request: RepriceRequest): Promise<RepriceResult> {
    await this.simulateLatency();
    this.maybeFail('repriceFlight');

    const payload = this.decodeOfferId(request.supplierOfferId);
    if (!payload) {
      return { supplierOfferId: request.supplierOfferId, stillAvailable: false, priceChanged: false };
    }

    const rebuilt = this.buildOffer(
      {
        tripType: payload.legs.length > 1 ? 'ROUND_TRIP' : 'ONE_WAY',
        cabin: payload.cabin,
        segments: payload.legs,
        adults: payload.adults,
        children: payload.children,
        infants: payload.infants,
        currency: payload.currency,
      },
      payload.fareIndex,
    );

    // Deterministic by default (same search → same price), but a
    // developer can set MOCK_REPRICE_DRIFT_PCT (e.g. "0.05") to make
    // reprice return a higher price than the original search, to
    // exercise the mandatory price-change-confirmation flow.
    const driftPct = Number(process.env.MOCK_REPRICE_DRIFT_PCT ?? '0') || 0;
    const previousTotal = round2(rebuilt.baseFare + rebuilt.taxes + rebuilt.fees);
    const pricedOffer =
      driftPct === 0
        ? rebuilt
        : { ...rebuilt, baseFare: round2(rebuilt.baseFare * (1 + driftPct)) };
    const newTotal = round2(pricedOffer.baseFare + pricedOffer.taxes + pricedOffer.fees);

    return {
      supplierOfferId: request.supplierOfferId,
      stillAvailable: true,
      offer: pricedOffer,
      priceChanged: newTotal !== previousTotal,
      previousTotal,
      newTotal,
      currency: pricedOffer.currency,
    };
  }

  async createBooking(request: CreateBookingRequest): Promise<CreateBookingResult> {
    await this.simulateLatency();
    this.maybeFail('createBooking');

    const payload = this.decodeOfferId(request.supplierOfferId);
    if (!payload) {
      throw new Error(
        `[MOCK] ${this.supplierCode}: cannot create a booking against an offer id it did not issue (${request.supplierOfferId})`,
      );
    }

    const rng = seededRandom(`${this.supplierCode}|booking|${request.supplierOfferId}|${Date.now()}|${Math.random()}`);
    const reference = `${this.shortCode()}${randomAlphaNumeric(rng, 6)}`;

    return {
      supplierBookingReference: reference,
      status: 'CONFIRMED',
      raw: { mock: true, supplierOfferId: request.supplierOfferId, passengerCount: request.passengers.length },
    };
  }

  async issueTicket(request: IssueTicketRequest): Promise<IssueTicketResult> {
    await this.simulateLatency();
    this.maybeFail('issueTicket');

    const rng = seededRandom(`${this.supplierCode}|ticket|${request.supplierBookingReference}|${Date.now()}|${Math.random()}`);
    const ticketNumber = `${randomInt(rng, 100, 999)}-${randomAlphaNumeric(rng, 10)}`;
    return { ticketNumbers: [ticketNumber], status: 'ISSUED' };
  }

  async cancelBooking(_request: CancelBookingRequest): Promise<CancelBookingResult> {
    await this.simulateLatency();
    this.maybeFail('cancelBooking');
    return { status: 'CANCELLED' };
  }

  async refundBooking(_request: RefundBookingRequest): Promise<RefundBookingResult> {
    await this.simulateLatency();
    this.maybeFail('refundBooking');
    // A real supplier would return the settled refund amount; the mock
    // doesn't track a paid amount anywhere upstream yet (Payment/Refund
    // rows don't exist until the booking flow lands in a later step), so
    // it reports the outcome only and leaves amount/currency for the
    // caller (RefundService) to fill in from its own records.
    return { status: 'REFUNDED' };
  }

  // ── Internals ─────────────────────────────────────────────────────

  private buildOffer(request: FlightSearchRequest, fareIndex: 0 | 1): NormalizedFlightOffer {
    // Routing (which flights, how many stops, timings) is seeded WITHOUT
    // fareIndex, so both fare families on the same search share the same
    // physical flights — exactly like a real airline selling Y and Q on
    // the same departure. Only fareIndex-dependent factors below (the
    // price multiplier, booking class, refundability) may differ between
    // the two offers this method returns for one search.
    const routingSeed = [
      this.supplierCode,
      request.cabin,
      ...request.segments.map((s) => `${s.origin}-${s.destination}-${s.departureDate}`),
    ].join('|');
    const routingRng = seededRandom(routingSeed);
    const pricingRng = seededRandom(`${routingSeed}|fare${fareIndex}`);

    const bookingClass = BOOKING_CLASS_BY_CABIN_AND_FARE_INDEX[request.cabin][fareIndex];
    const segments: NormalizedFlightSegment[] = [];
    let sequence = 0;
    let totalDurationMinutes = 0;
    for (const leg of request.segments) {
      const legSegments = this.buildLegSegments(leg, routingRng, sequence, bookingClass);
      segments.push(...legSegments);
      sequence += legSegments.length;
      // Sum each leg's own flight+layover time (first departure to last
      // arrival WITHIN that leg) rather than first-segment-to-last-segment
      // across the whole offer — for a round trip/multi-city itinerary,
      // the latter would include the days spent on the ground between
      // legs as if they were flight time, wildly inflating the duration
      // (and, downstream, the duration-based fare).
      totalDurationMinutes += Math.round(
        (new Date(legSegments[legSegments.length - 1].arrivalAt).getTime() -
          new Date(legSegments[0].departureAt).getTime()) /
          60000,
      );
    }
    const stops = segments.length - request.segments.length;

    const paxWeight = Math.max(request.adults + (request.children ?? 0) * 0.75 + (request.infants ?? 0) * 0.1, 1);
    const cabinMultiplier = CABIN_MULTIPLIER[request.cabin];
    const fareFamilyMultiplier = fareIndex === 0 ? 1 : 1.35; // the flexible fare family costs more
    const baseFare = round2(
      this.profile.baseFarePerHourUsd *
        (totalDurationMinutes / 60) *
        cabinMultiplier *
        fareFamilyMultiplier *
        (1 + this.profile.markupBiasPct) *
        paxWeight,
    );
    const taxes = round2(baseFare * 0.11);
    const fees = this.profile.feeFlat;

    const refundable = fareIndex === 1;
    const changeable = fareIndex === 1;
    const fareFamily = this.profile.fareFamilies[fareIndex];

    const firstDepartureAt = new Date(segments[0].departureAt);
    const ticketingDeadline = new Date(
      firstDepartureAt.getTime() - randomInt(pricingRng, 24, 72) * 3600_000,
    ).toISOString();

    const payload: MockOfferPayload = {
      supplierCode: this.supplierCode,
      legs: request.segments,
      cabin: request.cabin,
      currency: request.currency,
      adults: request.adults,
      children: request.children ?? 0,
      infants: request.infants ?? 0,
      fareIndex,
    };

    return {
      supplierCode: this.supplierCode,
      supplierOfferId: this.encodeOfferId(payload),
      isMock: true,
      validatingCarrier: segments[0].marketingCarrier,
      cabin: request.cabin,
      fareFamily,
      stops,
      totalDurationMinutes,
      baseFare,
      taxes,
      fees,
      // Suppliers quote in their own settlement currency; converting to
      // the traveler's requested display currency is the pricing/markup
      // layer's job (Step 7+), not this adapter's.
      currency: this.profile.currency,
      refundable,
      changeable,
      baggage: { ...this.profile.baggage },
      seatsAvailable: randomInt(pricingRng, 1, 9),
      ticketingDeadline,
      fareRules: {
        changeFee: changeable ? 0 : this.profile.feeFlat * 2,
        refundFee: refundable ? this.profile.feeFlat : null,
        note: 'Mock fare rules for demo purposes — not a real fare basis.',
      },
      segments,
    };
  }

  private buildLegSegments(
    leg: FlightSearchSegmentInput,
    rng: () => number,
    startSequence: number,
    bookingClass: string,
  ): NormalizedFlightSegment[] {
    const isOneStop = this.decideStop(rng);

    const departureBase = new Date(`${leg.departureDate}T00:00:00.000Z`);
    departureBase.setUTCHours(randomInt(rng, 5, 22), pick(rng, [0, 15, 30, 45]), 0, 0);

    const carrier = pick(rng, this.profile.carriers);
    const aircraft = pick(rng, this.profile.aircraft);

    if (!isOneStop) {
      const durationMinutes = randomInt(rng, 90, 480);
      const departureAt = departureBase;
      const arrivalAt = new Date(departureAt.getTime() + durationMinutes * 60000);
      return [
        {
          sequence: startSequence,
          marketingCarrier: carrier,
          operatingCarrier: carrier,
          flightNumber: `${carrier}${randomInt(rng, 100, 999)}`,
          origin: leg.origin,
          destination: leg.destination,
          departureAt: departureAt.toISOString(),
          arrivalAt: arrivalAt.toISOString(),
          durationMinutes,
          aircraft,
          bookingClass,
        },
      ];
    }

    const connection = pick(
      rng,
      HUB_POOL.filter((h) => h !== leg.origin && h !== leg.destination),
    );
    const firstDuration = randomInt(rng, 60, 300);
    const layoverMinutes = randomInt(rng, 45, 180);
    const secondDuration = randomInt(rng, 60, 300);

    const firstDepartureAt = departureBase;
    const firstArrivalAt = new Date(firstDepartureAt.getTime() + firstDuration * 60000);
    const secondDepartureAt = new Date(firstArrivalAt.getTime() + layoverMinutes * 60000);
    const secondArrivalAt = new Date(secondDepartureAt.getTime() + secondDuration * 60000);

    return [
      {
        sequence: startSequence,
        marketingCarrier: carrier,
        operatingCarrier: carrier,
        flightNumber: `${carrier}${randomInt(rng, 100, 999)}`,
        origin: leg.origin,
        destination: connection,
        departureAt: firstDepartureAt.toISOString(),
        arrivalAt: firstArrivalAt.toISOString(),
        durationMinutes: firstDuration,
        aircraft,
        bookingClass,
      },
      {
        sequence: startSequence + 1,
        marketingCarrier: carrier,
        operatingCarrier: carrier,
        flightNumber: `${carrier}${randomInt(rng, 100, 999)}`,
        origin: connection,
        destination: leg.destination,
        departureAt: secondDepartureAt.toISOString(),
        arrivalAt: secondArrivalAt.toISOString(),
        durationMinutes: secondDuration,
        aircraft: pick(rng, this.profile.aircraft),
        bookingClass,
      },
    ];
  }

  private decideStop(rng: () => number): boolean {
    switch (this.profile.stopBias) {
      case 'NONSTOP':
        return rng() < 0.15;
      case 'ONE_STOP':
        return rng() < 0.85;
      case 'MIXED':
      default:
        return rng() < 0.5;
    }
  }

  private shortCode(): string {
    return this.supplierCode.replace('MOCK_SUPPLIER_', 'MS');
  }

  private encodeOfferId(payload: MockOfferPayload): string {
    const json = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    return `${this.supplierCode}.${json}`;
  }

  private decodeOfferId(offerId: string): MockOfferPayload | null {
    const [code, json] = offerId.split('.', 2);
    if (code !== this.supplierCode || !json) return null;
    try {
      const payload = JSON.parse(Buffer.from(json, 'base64url').toString('utf8')) as MockOfferPayload;
      if (payload.supplierCode !== this.supplierCode) return null;
      return payload;
    } catch {
      return null;
    }
  }

  private async simulateLatency(): Promise<void> {
    const [min, max] = this.profile.latencyMsRange;
    const ms = min + Math.random() * (max - min);
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private maybeFail(operation: string): void {
    const rate = Number(process.env[this.profile.failureRateEnvVar] ?? '0') || 0;
    if (rate > 0 && Math.random() < rate) {
      throw new Error(
        `[MOCK] ${this.supplierCode} simulated failure during ${operation} (rate=${rate}, controlled by ${this.profile.failureRateEnvVar})`,
      );
    }
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
