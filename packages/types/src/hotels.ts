/**
 * Hotel-domain contract, mirroring flights.ts's shape (search → per-
 * supplier offers → booking) — see HotelsModule for the orchestrator
 * and mock adapters that implement this. Hotel suppliers are identified
 * by a plain `supplierCode` string rather than a Supplier table row —
 * see schema.prisma's HotelSearch doc comment for why.
 */

export type HotelBoardType = 'ROOM_ONLY' | 'BREAKFAST' | 'HALF_BOARD' | 'FULL_BOARD';

/** Mirrors schema.prisma's HotelBookingStatus enum — see flights.ts's doc comment on why these string unions are hand-duplicated here rather than imported from @prisma/client. */
export type HotelBookingStatus = 'PENDING' | 'CONFIRMED' | 'FAILED' | 'CANCELLED' | 'REFUND_PENDING' | 'REFUNDED';

/**
 * Deliberately different from FlightSearchRequest's shape: a flight
 * adapter fabricates its own itinerary from bare origin/destination
 * codes, but a hotel adapter is asked to quote ONE specific real,
 * already-seeded property (see HotelsService — it looks up matching
 * HotelProperty rows for the requested city first, then calls each
 * registered adapter once per property) rather than inventing a hotel
 * name itself. An unseeded city returns zero properties and therefore
 * zero offers, never a fabricated one.
 */
export interface HotelSearchRequest {
  property: { id: string; name: string; city: string; country: string; starRating?: number };
  checkInDate: string; // YYYY-MM-DD
  checkOutDate: string; // YYYY-MM-DD
  adults: number;
  children?: number;
  rooms?: number;
  currency: string;
}

export interface NormalizedHotelOffer {
  supplierCode: string;
  supplierOfferId: string;
  isMock: boolean;
  propertyId: string;
  roomType: string;
  board: HotelBoardType;
  refundable: boolean;
  nights: number;
  baseFare: number;
  taxes: number;
  fees: number;
  currency: string;
}

export interface HotelRepriceRequest {
  supplierOfferId: string;
  rooms: number;
}

export interface HotelRepriceResult {
  supplierOfferId: string;
  stillAvailable: boolean;
  priceChanged: boolean;
  previousTotal?: number;
  newTotal?: number;
  currency?: string;
}

export interface CreateHotelBookingRequest {
  supplierOfferId: string;
  guestName: string;
  contactEmail: string;
  contactPhone: string;
  rooms: number;
}

export interface CreateHotelBookingResult {
  supplierBookingReference: string;
  status: 'CONFIRMED' | 'PENDING' | 'FAILED';
}

export interface CancelHotelBookingRequest {
  supplierBookingReference: string;
  reason?: string;
}

export interface CancelHotelBookingResult {
  status: 'CANCELLED' | 'FAILED';
}

export interface HotelSupplierAdapter {
  readonly supplierCode: string;
  searchHotels(request: HotelSearchRequest): Promise<NormalizedHotelOffer[]>;
  repriceHotel(request: HotelRepriceRequest): Promise<HotelRepriceResult>;
  createBooking(request: CreateHotelBookingRequest): Promise<CreateHotelBookingResult>;
  cancelBooking?(request: CancelHotelBookingRequest): Promise<CancelHotelBookingResult>;
}
