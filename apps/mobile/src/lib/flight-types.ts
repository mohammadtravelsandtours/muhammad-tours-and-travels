// Mirrors apps/web/src/lib/flight-types.ts exactly — this is the same
// HTTP response DTO shape FlightsController/BookingsController serialize
// (see apps/api/src/modules/flights and modules/bookings), duplicated
// rather than imported cross-app since apps/web isn't a shared package
// (kept identical here on purpose so the two clients never silently drift).

export type TripType = 'ONE_WAY' | 'ROUND_TRIP' | 'MULTI_CITY';
export type CabinClass = 'ECONOMY' | 'PREMIUM_ECONOMY' | 'BUSINESS' | 'FIRST';

export interface FlightSearchSegmentInput {
  origin: string;
  destination: string;
  departureDate: string; // YYYY-MM-DD
}

export interface OfferSegment {
  sequence: number;
  marketingCarrier: string;
  operatingCarrier: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departureAt: string;
  arrivalAt: string;
  durationMinutes: number;
  aircraft?: string;
  bookingClass: string;
}

export interface OfferBaggage {
  checkedKg?: number;
  carryOnKg?: number;
  note?: string;
}

export interface OfferLayover {
  /** IATA code of the connecting airport. */
  airport: string;
  minutes: number;
}

/**
 * One searched leg (outbound, return, or one MULTI_CITY hop), with its
 * OWN stops/duration/layovers — never the offer-wide aggregate on
 * `FlightOffer` itself, which sums across every leg. A round trip's
 * outbound and return arrive here as two separate entries specifically
 * so the UI never has to guess where one ends and the other begins —
 * see the API's groupSegmentsByLeg, which builds this from the search's
 * own leg boundaries rather than from timing gaps.
 */
export interface OfferLeg {
  origin: string;
  destination: string;
  departureAt: string;
  arrivalAt: string;
  durationMinutes: number;
  stops: number;
  segments: OfferSegment[];
  layovers: OfferLayover[];
}

export interface FlightOffer {
  id: string;
  supplierCode?: string;
  isMock: boolean;
  validatingCarrier: string;
  cabin: CabinClass;
  fareFamily: string;
  stops: number;
  totalDurationMinutes: number;
  baseFare: number;
  taxes: number;
  fees: number;
  markupAmount: number;
  totalFare: number;
  currency: string;
  refundable: boolean;
  changeable: boolean;
  baggage: OfferBaggage;
  seatsAvailable: number;
  ticketingDeadline?: string;
  fareRules?: Record<string, unknown>;
  transitVisaWarning?: string;
  /** Flat, offer-wide physical segment list — prefer `legs` for display; this alone can't tell a same-leg connection from the gap between a round trip's outbound and return. */
  segments: OfferSegment[];
  /** Segments grouped back into outbound/return (or each multi-city hop). Falls back to `[]` only against a not-yet-updated API response. */
  legs: OfferLeg[];
  passengerCounts?: { adults: number; children: number; infants: number };
}

export interface SupplierRunSummary {
  supplierCode: string;
  supplierName: string;
  status: string;
  latencyMs: number;
  offerCount: number;
  errorMessage?: string;
}

export interface SearchResult {
  searchId: string;
  status?: string;
  expiresAt?: string;
  segments?: FlightSearchSegmentInput[];
  supplierRuns?: SupplierRunSummary[];
  offerCount: number;
  offers: FlightOffer[];
}

export interface RepriceResponse {
  offerId: string;
  stillAvailable: boolean;
  priceChanged: boolean;
  previousTotal: number;
  newTotal: number | null;
  currency: string;
}

export type PassengerType = 'ADULT' | 'CHILD' | 'INFANT';

export interface PassengerInput {
  type: PassengerType;
  title: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  dateOfBirth: string;
  gender?: string;
  nationality?: string;
  passportNumber?: string;
  passportExpiry?: string;
  passportIssuingCountry?: string;
}

export interface CreateBookingInput {
  offerId: string;
  passengers: PassengerInput[];
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  whatsappNumber?: string;
  acceptedTotalFare?: number;
}

export interface PriceConfirmationRequired {
  requiresPriceConfirmation: true;
  previousTotal: number;
  newTotal: number;
  currency: string;
  message: string;
}

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

export interface BookingTicket {
  passengerId: string;
  ticketNumber: string;
  status: string;
  issuedAt: string;
}

export interface BookingStatusHistoryEntry {
  fromStatus: string;
  toStatus: string;
  reason?: string;
  createdAt: string;
}

export interface Booking {
  id: string;
  bookingReference: string;
  status: BookingStatus;
  channel?: string;
  currency: string;
  totalAmount: number;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  whatsappNumber?: string;
  createdAt: string;
  offer?: {
    id: string;
    supplierCode?: string;
    validatingCarrier: string;
    cabin: CabinClass;
    fareFamily: string;
    stops: number;
    segments: Array<{
      marketingCarrier: string;
      flightNumber: string;
      origin: string;
      destination: string;
      departureAt: string;
      arrivalAt: string;
      bookingClass: string;
    }>;
  };
  passengers: Array<{ id: string; type: PassengerType; title: string; firstName: string; lastName: string }>;
  tickets: BookingTicket[];
  statusHistory: BookingStatusHistoryEntry[];
}

export interface BookingSummary {
  id: string;
  bookingReference: string;
  status: BookingStatus;
  currency: string;
  totalAmount: number;
  createdAt: string;
  route?: string;
}

export const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  SEARCHED: 'Searched',
  PRICE_PENDING: 'Confirming price',
  PRICE_CONFIRMED: 'Price confirmed',
  BOOKING_PENDING: 'Booking in progress',
  CONFIRMED: 'Confirmed',
  TICKETED: 'Ticketed',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
  REFUND_PENDING: 'Refund in progress',
  REFUNDED: 'Refunded',
};

/** Statuses a traveler may still self-cancel from the app — mirrors the
 * set BookingsService.cancelBooking accepts server-side; kept here too so
 * the Cancel button only ever renders when the call could actually succeed. */
export const CANCELLABLE_STATUSES: BookingStatus[] = ['CONFIRMED', 'TICKETED', 'BOOKING_PENDING', 'PRICE_CONFIRMED'];
