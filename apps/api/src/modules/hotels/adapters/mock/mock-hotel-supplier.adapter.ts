import {
  CancelHotelBookingRequest,
  CancelHotelBookingResult,
  CreateHotelBookingRequest,
  CreateHotelBookingResult,
  HotelBoardType,
  HotelRepriceRequest,
  HotelRepriceResult,
  HotelSearchRequest,
  HotelSupplierAdapter,
  NormalizedHotelOffer,
} from '@mohammad-travels/types';
import { pick, randomAlphaNumeric, seededRandom } from '../../../suppliers/adapters/mock/deterministic-random';
import { MockHotelAdapterProfile } from './mock-hotel-adapter-profile';

/**
 * Shared engine behind every MOCK_HOTEL_* adapter — mirrors
 * MockFlightSupplierAdapter's shape and discipline exactly (see its own
 * doc comment): stateless, self-describing base64url offer ids, seeded
 * RNG for stable-per-search pricing, and the same
 * failureRateEnvVar/MOCK_REPRICE_DRIFT_PCT hooks for exercising
 * partial-failure and price-change-confirmation handling on demand.
 *
 * Deliberately never invents a property: searchHotels only ever prices
 * the ONE real, already-seeded HotelProperty it's given in the request
 * (request.property) — see hotels.ts's doc comment on HotelSearchRequest.
 */
interface MockHotelOfferPayload {
  supplierCode: string;
  propertyId: string;
  checkInDate: string;
  checkOutDate: string;
  currency: string;
  roomIndex: 0 | 1;
}

export class MockHotelSupplierAdapter implements HotelSupplierAdapter {
  readonly supplierCode: string;

  constructor(private readonly profile: MockHotelAdapterProfile) {
    this.supplierCode = profile.supplierCode;
  }

  async searchHotels(request: HotelSearchRequest): Promise<NormalizedHotelOffer[]> {
    await this.simulateLatency();
    this.maybeFail('searchHotels');

    return [0, 1].map((roomIndex) => this.buildOffer(request, roomIndex as 0 | 1));
  }

  async repriceHotel(request: HotelRepriceRequest): Promise<HotelRepriceResult> {
    await this.simulateLatency();
    this.maybeFail('repriceHotel');

    const payload = this.decodeOfferId(request.supplierOfferId);
    if (!payload) {
      return { supplierOfferId: request.supplierOfferId, stillAvailable: false, priceChanged: false };
    }

    const rebuilt = this.buildOffer(
      {
        property: { id: payload.propertyId, name: '', city: '', country: '' },
        checkInDate: payload.checkInDate,
        checkOutDate: payload.checkOutDate,
        adults: 1,
        currency: payload.currency,
      },
      payload.roomIndex,
    );

    // Same deterministic-by-default / MOCK_REPRICE_DRIFT_PCT-driven drift
    // as the flight adapter, so the mandatory-reprice-before-booking path
    // (HotelsService.createBooking) can be exercised the same way.
    const driftPct = Number(process.env.MOCK_REPRICE_DRIFT_PCT ?? '0') || 0;
    const previousTotal = round2(rebuilt.baseFare + rebuilt.taxes + rebuilt.fees) * request.rooms;
    const pricedNightly = driftPct === 0 ? rebuilt.baseFare : round2(rebuilt.baseFare * (1 + driftPct));
    const newTotal = round2((pricedNightly + rebuilt.taxes + rebuilt.fees) * request.rooms);

    return {
      supplierOfferId: request.supplierOfferId,
      stillAvailable: true,
      priceChanged: newTotal !== previousTotal,
      previousTotal,
      newTotal,
      currency: rebuilt.currency,
    };
  }

  async createBooking(request: CreateHotelBookingRequest): Promise<CreateHotelBookingResult> {
    await this.simulateLatency();
    this.maybeFail('createBooking');

    const payload = this.decodeOfferId(request.supplierOfferId);
    if (!payload) {
      throw new Error(`[MOCK] ${this.supplierCode}: cannot create a booking against an offer id it did not issue (${request.supplierOfferId})`);
    }

    const rng = seededRandom(`${this.supplierCode}|hotelbooking|${request.supplierOfferId}|${Date.now()}|${Math.random()}`);
    const reference = `${this.shortCode()}${randomAlphaNumeric(rng, 6)}`;

    return { supplierBookingReference: reference, status: 'CONFIRMED' };
  }

  async cancelBooking(_request: CancelHotelBookingRequest): Promise<CancelHotelBookingResult> {
    await this.simulateLatency();
    this.maybeFail('cancelBooking');
    return { status: 'CANCELLED' };
  }

  private buildOffer(request: HotelSearchRequest, roomIndex: 0 | 1): NormalizedHotelOffer {
    const nights = Math.max(1, this.diffNights(request.checkInDate, request.checkOutDate));
    const rng = seededRandom(`${this.supplierCode}|${request.property.id}|${request.checkInDate}|${request.checkOutDate}|${roomIndex}`);

    const starMultiplier = 1 + (request.property.starRating ?? 3) * 0.15;
    const nightlyBase = this.profile.baseNightlyRate * starMultiplier * (roomIndex === 0 ? 1 : 1.6);
    const biasedNightly = nightlyBase * (1 + this.profile.markupBiasPct);
    const baseFare = round2(biasedNightly * nights);
    const taxes = round2(baseFare * 0.08);
    const fees = round2(this.profile.feeFlat * nights);

    const payload: MockHotelOfferPayload = {
      supplierCode: this.supplierCode,
      propertyId: request.property.id,
      checkInDate: request.checkInDate,
      checkOutDate: request.checkOutDate,
      currency: request.currency,
      roomIndex,
    };

    return {
      supplierCode: this.supplierCode,
      supplierOfferId: this.encodeOfferId(payload),
      isMock: true,
      propertyId: request.property.id,
      roomType: this.profile.roomTypes[roomIndex],
      board: pick(rng, this.profile.boardOptions) as HotelBoardType,
      refundable: roomIndex === 1, // the upgraded room is refundable; the cheaper one is not — a believable, not-arbitrary distinction for the demo
      nights,
      baseFare,
      taxes,
      fees,
      currency: request.currency,
    };
  }

  private diffNights(checkInDate: string, checkOutDate: string): number {
    const inMs = new Date(`${checkInDate}T00:00:00.000Z`).getTime();
    const outMs = new Date(`${checkOutDate}T00:00:00.000Z`).getTime();
    return Math.round((outMs - inMs) / (24 * 60 * 60 * 1000));
  }

  private shortCode(): string {
    return this.supplierCode.replace('MOCK_HOTEL_', 'MH');
  }

  private encodeOfferId(payload: MockHotelOfferPayload): string {
    const json = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    return `${this.supplierCode}.${json}`;
  }

  private decodeOfferId(offerId: string): MockHotelOfferPayload | null {
    const [code, json] = offerId.split('.', 2);
    if (code !== this.supplierCode || !json) return null;
    try {
      const payload = JSON.parse(Buffer.from(json, 'base64url').toString('utf8')) as MockHotelOfferPayload;
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
      throw new Error(`[MOCK] ${this.supplierCode} simulated failure during ${operation} (rate=${rate}, controlled by ${this.profile.failureRateEnvVar})`);
    }
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
