import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CancelBookingRequest,
  CancelBookingResult,
  CreateBookingRequest,
  CreateBookingResult,
  FlightSearchRequest,
  FlightSupplierAdapter,
  NormalizedFlightOffer,
  RepriceRequest,
  RepriceResult,
} from '@mohammad-travels/types';
import { RedisService } from '../../../../redis/redis.service';

/**
 * REAL (non-mock) supplier — Amadeus for Developers "Self-Service" REST
 * APIs (Flight Offers Search v2, Flight Offers Price v1, Flight Create
 * Orders v1, Flight Order Management v1). Called directly via the
 * platform's own `fetch` (Node 20+, no SDK dependency needed — Amadeus's
 * REST contract is stable and documented enough that a raw client is a
 * legitimate choice here rather than a shortcut).
 *
 * DISABLED BY DEFAULT: this adapter is registered in code (so it shows
 * up in SupplierRegistry and admin health/analytics), but its DB row
 * (`AMADEUS_GDS`, see database/seeds/data/suppliers.ts) seeds with
 * `active: false` — SupplierRegistry.getActiveAdapters() only calls
 * adapters that are BOTH registered in code AND active in the database
 * (see supplier-registry.service.ts's doc comment), so this never gets
 * called in a fresh environment even with credentials set, until an
 * operator deliberately flips it active via the admin Suppliers screen.
 * With no AMADEUS_API_KEY/AMADEUS_API_SECRET configured, every method
 * throws a clear "not configured" error, which the search orchestrator
 * already treats as a single failed supplier run (SearchSupplierRun
 * status ERROR) — never as a reason to fail the whole search (see
 * FlightSearchOrchestratorService.runOneSupplier).
 *
 * NOT EXERCISED AGAINST A LIVE AMADEUS ACCOUNT in this build — this
 * sandbox has no network access to verify a real token/search/price/
 * book/cancel round trip. The request/response mapping below was
 * written against Amadeus's published API reference and is believed
 * correct, but "believed correct" is not "verified live" — test against
 * a real (test-environment) Amadeus account before enabling in any
 * shared environment.
 *
 * Known real limitations of this adapter, stated plainly rather than
 * hidden:
 *  - `issueTicket`/`refundBooking` are deliberately NOT implemented
 *    (omitted, per FlightSupplierAdapter's `?` optionality) — Amadeus
 *    Self-Service's test tier auto-confirms an order at booking time
 *    with no separate ticketing call, and GDS ticket refunds normally
 *    go through BSP/ARC settlement, not a REST endpoint this tier
 *    exposes. A production NDC integration would need airline-specific
 *    content beyond this adapter's scope.
 *  - Repricing requires Amadeus's own full raw offer object, not just
 *    an id (its API doesn't support id-based re-lookup) — this adapter
 *    caches each search result's raw offer in Redis, keyed by its own
 *    `supplierOfferId`, for 25 minutes (roughly this platform's search
 *    lifetime elsewhere). A reprice/booking attempt after that window,
 *    or against a different process/instance whose Redis has evicted
 *    the key, correctly reports `stillAvailable: false` rather than
 *    guessing — the same "search may have expired" outcome the frontend
 *    already handles for mock suppliers.
 */
@Injectable()
export class AmadeusFlightSupplierAdapter implements FlightSupplierAdapter {
  readonly supplierCode = 'AMADEUS_GDS';
  private readonly logger = new Logger(AmadeusFlightSupplierAdapter.name);
  private readonly OFFER_CACHE_TTL_SECONDS = 25 * 60;

  private cachedToken: { accessToken: string; expiresAt: number } | null = null;
  private tokenRequestInFlight: Promise<string> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  private get settings(): { apiKey: string; apiSecret: string; baseUrl: string } | undefined {
    return this.config.get('integrations.amadeus');
  }

  isConfigured(): boolean {
    return !!this.settings;
  }

  async searchFlights(request: FlightSearchRequest): Promise<NormalizedFlightOffer[]> {
    const settings = this.requireSettings();
    const token = await this.getAccessToken(settings);

    const originDestinations = request.segments.map((segment, index) => ({
      id: String(index + 1),
      originLocationCode: segment.origin,
      destinationLocationCode: segment.destination,
      departureDateTimeRange: { date: segment.departureDate },
    }));

    const travelers: Array<{ id: string; travelerType: 'ADULT' | 'CHILD' | 'HELD_INFANT' }> = [];
    let travelerId = 1;
    for (let i = 0; i < request.adults; i++) travelers.push({ id: String(travelerId++), travelerType: 'ADULT' });
    for (let i = 0; i < (request.children ?? 0); i++) travelers.push({ id: String(travelerId++), travelerType: 'CHILD' });
    for (let i = 0; i < (request.infants ?? 0); i++) travelers.push({ id: String(travelerId++), travelerType: 'HELD_INFANT' });

    const body = {
      currencyCode: request.currency,
      originDestinations,
      travelers,
      sources: ['GDS'],
      searchCriteria: {
        maxFlightOffers: 20,
        flightFilters: {
          cabinRestrictions: [
            {
              cabin: request.cabin,
              coverage: 'ALL_SEGMENTS' as const,
              originDestinationIds: originDestinations.map((od) => od.id),
            },
          ],
        },
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = await this.call<{ data: any[] }>(settings, token, 'POST', '/v2/shopping/flight-offers', body);
    const offers = json.data ?? [];

    // Cache each raw offer so repriceFlight/createBooking can retrieve
    // the exact object Amadeus requires later — see class doc comment.
    await Promise.all(
      offers.map((offer) => this.redis.client.set(this.offerCacheKey(offer.id), JSON.stringify(offer), 'EX', this.OFFER_CACHE_TTL_SECONDS)),
    );

    return offers.map((offer) => this.normalizeOffer(offer));
  }

  async repriceFlight(request: RepriceRequest): Promise<RepriceResult> {
    const settings = this.requireSettings();
    const raw = await this.getCachedOffer(request.supplierOfferId);
    if (!raw) {
      // Not an error — the offer simply isn't in cache anymore (expired,
      // or a different process instance). Mirrors how a mock supplier's
      // expired FlightSearch is surfaced to the traveler.
      return { supplierOfferId: request.supplierOfferId, stillAvailable: false, priceChanged: false };
    }

    const previousTotal = Number(raw.price?.grandTotal ?? raw.price?.total);
    const token = await this.getAccessToken(settings);

    try {
      const json = await this.call<{ data: { flightOffers: unknown[] } }>(
        settings,
        token,
        'POST',
        '/v1/shopping/flight-offers/pricing',
        { data: { type: 'flight-offers-pricing', flightOffers: [raw] } },
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const priced = json.data.flightOffers[0] as any;
      if (!priced) return { supplierOfferId: request.supplierOfferId, stillAvailable: false, priceChanged: false };

      // The priced offer (not the original search offer) is what
      // Amadeus requires for the actual booking call — replace the cache
      // entry so createBooking picks this one up.
      await this.redis.client.set(this.offerCacheKey(request.supplierOfferId), JSON.stringify(priced), 'EX', this.OFFER_CACHE_TTL_SECONDS);

      const newTotal = Number(priced.price?.grandTotal ?? priced.price?.total);
      return {
        supplierOfferId: request.supplierOfferId,
        stillAvailable: true,
        offer: this.normalizeOffer(priced),
        priceChanged: Math.abs(newTotal - previousTotal) > 0.001,
        previousTotal,
        newTotal,
        currency: priced.price?.currency ?? raw.price?.currency,
      };
    } catch (err) {
      this.logger.warn(`Amadeus reprice failed for ${request.supplierOfferId}: ${(err as Error).message}`);
      return { supplierOfferId: request.supplierOfferId, stillAvailable: false, priceChanged: false };
    }
  }

  async createBooking(request: CreateBookingRequest): Promise<CreateBookingResult> {
    const settings = this.requireSettings();
    const raw = await this.getCachedOffer(request.supplierOfferId);
    if (!raw) {
      throw new Error(
        `Amadeus offer ${request.supplierOfferId} is no longer cached — it must be repriced (POST .../reprice) again immediately before booking`,
      );
    }
    const token = await this.getAccessToken(settings);

    const travelers = request.passengers.map((p) => ({
      id: String(index + 1),
      dateOfBirth: p.dateOfBirth,
      name: { firstName: p.firstName.toUpperCase(), lastName: p.lastName.toUpperCase() },
      contact: {
        emailAddress: request.contactEmail,
        phones: [normalizePhoneForAmadeus(request.contactPhone)],
      },
      documents: p.passportNumber
        ? [
            {
              documentType: 'PASSPORT',
              number: p.passportNumber,
              expiryDate: p.passportExpiry,
              issuanceCountry: p.passportIssuingCountry,
              nationality: p.nationality,
              holder: true,
            },
          ]
        : undefined,
    }));

    try {
      const json = await this.call<{ data: { id: string; associatedRecords?: Array<{ reference: string }> } }>(
        settings,
        token,
        'POST',
        '/v1/booking/flight-orders',
        { data: { type: 'flight-order', flightOffers: [raw], travelers } },
      );
      const pnr = json.data.associatedRecords?.[0]?.reference ?? json.data.id;
      return { supplierBookingReference: pnr, status: 'CONFIRMED', raw: json.data as unknown as Record<string, unknown> };
    } catch (err) {
      this.logger.error(`Amadeus createBooking failed: ${(err as Error).message}`);
      return { supplierBookingReference: '', status: 'FAILED' };
    }
  }

  async cancelBooking(request: CancelBookingRequest): Promise<CancelBookingResult> {
    const settings = this.requireSettings();
    const token = await this.getAccessToken(settings);
    try {
      await this.call(settings, token, 'DELETE', `/v1/booking/flight-orders/${encodeURIComponent(request.supplierBookingReference)}`);
      return { status: 'CANCELLED' };
    } catch (err) {
      this.logger.warn(`Amadeus cancelBooking failed for ${request.supplierBookingReference}: ${(err as Error).message}`);
      return { status: 'FAILED' };
    }
  }

  // ── internals ──────────────────────────────────────────────────────

  private requireSettings(): { apiKey: string; apiSecret: string; baseUrl: string } {
    const settings = this.settings;
    if (!settings) {
      throw new Error('Amadeus is not configured (AMADEUS_API_KEY/AMADEUS_API_SECRET unset) — this supplier is disabled');
    }
    return settings;
  }

  private offerCacheKey(supplierOfferId: string): string {
    return `amadeus:offer:${supplierOfferId}`;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async getCachedOffer(supplierOfferId: string): Promise<any | null> {
    const raw = await this.redis.client.get(this.offerCacheKey(supplierOfferId));
    return raw ? JSON.parse(raw) : null;
  }

  /**
   * OAuth2 client-credentials token, cached in-memory per process with a
   * 60-second early-refresh margin. A concurrent second caller while a
   * fetch is already in flight awaits the same promise rather than
   * firing a duplicate token request (Amadeus's test tier rate-limits
   * the token endpoint tightly).
   */
  private async getAccessToken(settings: { apiKey: string; apiSecret: string; baseUrl: string }): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && this.cachedToken.expiresAt > now) return this.cachedToken.accessToken;
    if (this.tokenRequestInFlight) return this.tokenRequestInFlight;

    this.tokenRequestInFlight = (async () => {
      const res = await fetch(`${settings.baseUrl}/v1/security/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: settings.apiKey,
          client_secret: settings.apiSecret,
        }).toString(),
      });
      if (!res.ok) {
        throw new Error(`Amadeus OAuth2 token request failed: HTTP ${res.status}`);
      }
      const json = (await res.json()) as { access_token: string; expires_in: number };
      this.cachedToken = { accessToken: json.access_token, expiresAt: now + Math.max(0, json.expires_in - 60) * 1000 };
      return json.access_token;
    })();

    try {
      return await this.tokenRequestInFlight;
    } finally {
      this.tokenRequestInFlight = null;
    }
  }

  private async call<T = unknown>(
    settings: { baseUrl: string },
    token: string,
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await fetch(`${settings.baseUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204) return undefined as T;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = json?.errors?.[0]?.detail || json?.errors?.[0]?.title || `HTTP ${res.status}`;
      throw new Error(`Amadeus ${method} ${path} failed: ${detail}`);
    }
    return json as T;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private normalizeOffer(offer: any): NormalizedFlightOffer {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const segments = (offer.itineraries ?? []).flatMap((itinerary: any, itinIndex: number) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (itinerary.segments ?? []).map((seg: any, segIndex: number) => ({
        sequence: itinIndex * 100 + segIndex,
        marketingCarrier: seg.carrierCode,
        operatingCarrier: seg.operating?.carrierCode ?? seg.carrierCode,
        flightNumber: seg.number,
        origin: seg.departure?.iataCode,
        destination: seg.arrival?.iataCode,
        departureAt: seg.departure?.at,
        arrivalAt: seg.arrival?.at,
        durationMinutes: parseIsoDurationToMinutes(seg.duration),
        aircraft: seg.aircraft?.code,
        bookingClass: offer.travelerPricings?.[0]?.fareDetailsBySegment?.find((f: { segmentId: string }) => f.segmentId === seg.id)
          ?.class,
      })),
    );

    const totalDurationMinutes = (offer.itineraries ?? []).reduce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sum: number, it: any) => sum + parseIsoDurationToMinutes(it.duration),
      0,
    );
    const stops = Math.max(0, segments.length - (offer.itineraries?.length ?? 1));
    const fareDetail = offer.travelerPricings?.[0]?.fareDetailsBySegment?.[0];

    return {
      supplierCode: this.supplierCode,
      supplierOfferId: offer.id,
      isMock: false,
      validatingCarrier: offer.validatingAirlineCodes?.[0] ?? segments[0]?.marketingCarrier ?? 'XX',
      cabin: fareDetail?.cabin ?? 'ECONOMY',
      fareFamily: fareDetail?.brandedFare ?? 'STANDARD',
      stops,
      totalDurationMinutes,
      baseFare: Number(offer.price?.base ?? 0),
      taxes: Number(offer.price?.grandTotal ?? 0) - Number(offer.price?.base ?? 0),
      fees: 0,
      currency: offer.price?.currency,
      refundable: false, // Amadeus fare-rules detail requires a separate call this adapter doesn't make yet — never guess "refundable"
      changeable: false,
      baggage: { note: 'Baggage allowance not yet retrieved from Amadeus for this offer — confirm with the airline before booking.' },
      seatsAvailable: offer.numberOfBookableSeats ?? 0,
      ticketingDeadline: offer.lastTicketingDate,
      fareRules: undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      segments: segments as any,
    };
  }
}

/** Parses an ISO 8601 duration like "PT5H30M" into whole minutes. Amadeus returns durations in this format for both segments and itineraries. */
function parseIsoDurationToMinutes(iso?: string): number {
  if (!iso) return 0;
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?$/.exec(iso);
  if (!match) return 0;
  const hours = match[1] ? parseInt(match[1], 10) : 0;
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  return hours * 60 + minutes;
}


function normalizePhoneForAmadeus(phone: string): {
  deviceType: 'MOBILE';
  countryCallingCode: string;
  number: string;
} {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) {
    throw new Error('Passenger contact phone must contain 7–15 digits');
  }

  // The normalized platform contact number is expected in international
  // form. Preserve the country code instead of the previous hard-coded
  // North American "1", which produced invalid booking payloads for
  // Bangladesh/Singapore travellers.
  const normalized = phone.trim().startsWith('+') ? digits : digits;
  if (normalized.length === 11 && normalized.startsWith('01')) {
    return { deviceType: 'MOBILE', countryCallingCode: '880', number: normalized.slice(1) };
  }
  if (normalized.startsWith('880') && normalized.length >= 11) {
    return { deviceType: 'MOBILE', countryCallingCode: '880', number: normalized.slice(3) };
  }
  if (normalized.startsWith('65') && normalized.length >= 9) {
    return { deviceType: 'MOBILE', countryCallingCode: '65', number: normalized.slice(2) };
  }

  // For other markets, callers should submit an international +country
  // number. We cannot safely infer an arbitrary country's prefix, so fail
  // closed rather than sending a guessed country code to the supplier.
  if (phone.trim().startsWith('+') && normalized.length >= 8) {
    // Best-effort split is intentionally conservative: Amadeus accepts
    // countryCallingCode and number separately; common 1/2/3 digit codes
    // are handled without claiming to geolocate the customer.
    const oneDigit = ['1', '7'];
    if (oneDigit.includes(normalized.slice(0, 1))) {
      return { deviceType: 'MOBILE', countryCallingCode: normalized.slice(0, 1), number: normalized.slice(1) };
    }
    return { deviceType: 'MOBILE', countryCallingCode: normalized.slice(0, 2), number: normalized.slice(2) };
  }

  throw new Error('Contact phone must use international format, for example +8801XXXXXXXXX');
}
