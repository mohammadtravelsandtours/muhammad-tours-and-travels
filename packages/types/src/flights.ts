/**
 * Canonical flight-domain contract shared between every supplier adapter
 * and the core search/booking platform. This is the shape referenced by
 * docs/SUPPLIER-INTEGRATION.md: the platform depends on
 * `FlightSupplierAdapter` and the types below, never on a specific
 * supplier's request/response format — normalization into this shape is
 * each adapter's job, not the orchestrator's.
 *
 * These are intentionally plain string-literal unions rather than a
 * re-export of the Prisma-generated enums: this package has no
 * dependency on Prisma (and shouldn't — frontends import it too), so the
 * values are kept identical to the Prisma enums by hand
 * (schema.prisma's TripType/CabinClass/PassengerType/SearchChannel) and
 * must be kept in sync if either side changes.
 */

// ── Search request ───────────────────────────────────────────────────

export type TripType = 'ONE_WAY' | 'ROUND_TRIP' | 'MULTI_CITY';
export type CabinClass = 'ECONOMY' | 'PREMIUM_ECONOMY' | 'BUSINESS' | 'FIRST';
export type SearchChannel = 'B2C' | 'B2B' | 'CORPORATE';
export type PassengerType = 'ADULT' | 'CHILD' | 'INFANT';
export type BookingStatus =
  | 'SEARCHED'
  | 'PRICE_PENDING'
  | 'PRICE_CONFIRMED'
  | 'BOOKING_PENDING'
  | 'CONFIRMED'
  | 'TICKETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'REFUND_PENDING'
  | 'REFUNDED';

export interface FlightSearchSegmentInput {
  origin: string; // IATA 3-letter code
  destination: string; // IATA 3-letter code
  departureDate: string; // YYYY-MM-DD
}

export interface FlightSearchRequest {
  tripType: TripType;
  cabin: CabinClass;
  /** One segment for ONE_WAY, two for ROUND_TRIP, two-or-more for MULTI_CITY. */
  segments: FlightSearchSegmentInput[];
  adults: number;
  children?: number;
  infants?: number;
  currency: string; // ISO 4217, e.g. "USD"
  /** Traveler nationality — for the transit-visa-warning system only, never used to gate the search itself. */
  nationality?: string;
}

// ── Normalized offer (an adapter's output, before persistence/pricing) ─

export interface NormalizedFlightSegment {
  sequence: number;
  marketingCarrier: string; // IATA 2-letter code
  operatingCarrier: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departureAt: string; // ISO 8601, includes offset
  arrivalAt: string; // ISO 8601, includes offset
  durationMinutes: number;
  aircraft?: string;
  bookingClass: string;
}

export interface NormalizedBaggageAllowance {
  checkedKg?: number;
  carryOnKg?: number;
  /**
   * Set — and shown to the user verbatim — whenever the supplier gives no
   * baggage data. Never fabricate a checkedKg/carryOnKg number to fill
   * this gap; leave them undefined and explain why in this field instead
   * (mirrors FlightOffer.baggageNote in schema.prisma).
   */
  note?: string;
}

export interface NormalizedFlightOffer {
  /** Matches Supplier.code (e.g. "MOCK_SUPPLIER_A") — the registry key. */
  supplierCode: string;
  /** The supplier's own reference for this fare — passed back into repriceFlight/createBooking. */
  supplierOfferId: string;
  isMock: boolean;
  validatingCarrier: string; // IATA 2-letter code
  cabin: CabinClass;
  fareFamily: string;
  stops: number;
  totalDurationMinutes: number;
  baseFare: number;
  taxes: number;
  fees: number;
  currency: string;
  refundable: boolean;
  changeable: boolean;
  baggage: NormalizedBaggageAllowance;
  seatsAvailable: number;
  ticketingDeadline?: string; // ISO 8601
  fareRules?: Record<string, unknown>;
  segments: NormalizedFlightSegment[];
}

// ── Reprice (mandatory before booking — see docs/ARCHITECTURE.md) ─────

export interface RepriceRequest {
  supplierOfferId: string;
  passengerCounts: { adults: number; children?: number; infants?: number };
}

export interface RepriceResult {
  supplierOfferId: string;
  stillAvailable: boolean;
  /** Present when stillAvailable — the offer as it stands right now, which may differ in price/seats from the original search result. */
  offer?: NormalizedFlightOffer;
  priceChanged: boolean;
  previousTotal?: number;
  newTotal?: number;
  currency?: string;
}

// ── Booking ─────────────────────────────────────────────────────────

export interface SupplierPassengerInput {
  type: PassengerType;
  title: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string; // YYYY-MM-DD
  nationality?: string;
  passportNumber?: string;
  passportExpiry?: string; // YYYY-MM-DD
  passportIssuingCountry?: string;
}

export interface CreateBookingRequest {
  supplierOfferId: string;
  passengers: SupplierPassengerInput[];
  contactEmail: string;
  contactPhone: string;
}

export interface CreateBookingResult {
  /** The supplier's own PNR/booking id — stored, never shown to the customer as-is if it would leak supplier identity where that matters. */
  supplierBookingReference: string;
  status: 'CONFIRMED' | 'PENDING' | 'FAILED';
  /** Raw supplier response, kept for audit only — never surfaced to end users directly. */
  raw?: Record<string, unknown>;
}

export interface IssueTicketRequest {
  supplierBookingReference: string;
}

export interface IssueTicketResult {
  ticketNumbers: string[];
  status: 'ISSUED' | 'FAILED';
}

export interface CancelBookingRequest {
  supplierBookingReference: string;
  reason?: string;
}

export interface CancelBookingResult {
  status: 'CANCELLED' | 'FAILED';
}

export interface RefundBookingRequest {
  supplierBookingReference: string;
  ticketNumbers?: string[];
  reason?: string;
}

export interface RefundBookingResult {
  status: 'REFUNDED' | 'PARTIALLY_REFUNDED' | 'FAILED';
  amount?: number;
  currency?: string;
}

// ── The adapter contract ──────────────────────────────────────────────

/**
 * Every supplier — mock or real, API-based, NDC, GDS, or manual fare
 * entry — is reached exclusively through this interface. The core
 * platform (SupplierRegistry, the search orchestrator, the booking
 * service) depends only on this contract, never on a specific
 * supplier's implementation or wire format — see
 * docs/SUPPLIER-INTEGRATION.md. `issueTicket`/`cancelBooking`/
 * `refundBooking` are optional because some suppliers (e.g. a MANUAL
 * fare-entry "supplier") don't support them programmatically at all.
 */
export interface FlightSupplierAdapter {
  readonly supplierCode: string;
  searchFlights(request: FlightSearchRequest): Promise<NormalizedFlightOffer[]>;
  repriceFlight(request: RepriceRequest): Promise<RepriceResult>;
  createBooking(request: CreateBookingRequest): Promise<CreateBookingResult>;
  issueTicket?(request: IssueTicketRequest): Promise<IssueTicketResult>;
  cancelBooking?(request: CancelBookingRequest): Promise<CancelBookingResult>;
  refundBooking?(request: RefundBookingRequest): Promise<RefundBookingResult>;
}
