// Frontend-side mirrors of the shapes HotelsController actually serializes
// (see apps/api/src/modules/hotels/hotels.controller.ts). Same rationale as
// flight-types.ts: hand-kept HTTP response shapes, not the adapter-facing
// domain contract from @mohammad-travels/types.

export interface SearchHotelsInput {
  city: string;
  checkInDate: string; // YYYY-MM-DD
  checkOutDate: string; // YYYY-MM-DD
  adults: number;
  children?: number;
  rooms?: number;
  currency: string;
}

export interface HotelProperty {
  id: string;
  name: string;
  city: string;
  country: string;
  starRating?: number;
}

export interface HotelOffer {
  id: string;
  supplierCode?: string;
  isMock: boolean;
  property?: HotelProperty;
  roomType: string;
  board: string;
  refundable: boolean;
  nights: number;
  baseFare: number;
  taxes: number;
  fees: number;
  totalFare: number;
  currency: string;
  /** Only present on the single-offer detail view (GET /hotels/offers/:id). */
  checkInDate?: string;
  checkOutDate?: string;
  adults?: number;
  children?: number;
}

export interface HotelSupplierRunSummary {
  supplierCode: string;
  status: string;
  latencyMs: number;
  offerCount: number;
  errorMessage?: string;
}

export interface HotelSearchResult {
  searchId: string;
  city?: string;
  checkInDate?: string;
  checkOutDate?: string;
  supplierRuns?: HotelSupplierRunSummary[];
  offerCount: number;
  offers: HotelOffer[];
}

export interface HotelRepriceResponse {
  offerId: string;
  stillAvailable: boolean;
  priceChanged: boolean;
  previousTotal: number;
  newTotal: number | null;
  currency: string;
}

export interface CreateHotelBookingInput {
  offerId: string;
  rooms: number;
  guestName: string;
  contactEmail: string;
  contactPhone: string;
  acceptedTotalAmount?: number;
  /** A Stripe PaymentMethod id from StripeCardField — omitted entirely when Stripe isn't configured for this deployment. */
  paymentMethodToken?: string;
}

export interface HotelPriceConfirmationRequired {
  requiresPriceConfirmation: true;
  previousTotal: number;
  newTotal: number;
  currency: string;
  message: string;
}

// Mirrors schema.prisma's HotelBookingStatus enum (see packages/types/src/hotels.ts).
export type HotelBookingStatus = 'PENDING' | 'CONFIRMED' | 'FAILED' | 'CANCELLED' | 'REFUND_PENDING' | 'REFUNDED';

export interface HotelBookingRefund {
  amount: number;
  currency: string;
  status: string;
  reason?: string;
  createdAt: string;
}

export interface HotelBooking {
  id: string;
  bookingReference: string;
  status: HotelBookingStatus;
  channel?: string;
  currency: string;
  totalAmount: number;
  guestName: string;
  contactEmail: string;
  contactPhone: string;
  createdAt: string;
  offer?: {
    id: string;
    supplierCode?: string;
    roomType: string;
    board: string;
    nights: number;
    property?: { name: string; city: string; country: string };
  };
  refunds: HotelBookingRefund[];
}

export interface HotelBookingSummary {
  id: string;
  bookingReference: string;
  status: HotelBookingStatus;
  currency: string;
  totalAmount: number;
  createdAt: string;
  property?: { name: string; city: string };
}

export const HOTEL_BOOKING_STATUS_LABEL: Record<HotelBookingStatus, string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
  REFUND_PENDING: 'Refund in progress',
  REFUNDED: 'Refunded',
};

// Only a CONFIRMED hotel booking can be cancelled — see
// HotelsService.cancelBooking's status check in hotels.service.ts.
export const HOTEL_BOOKING_CANCELLABLE_STATUSES: HotelBookingStatus[] = ['CONFIRMED'];
