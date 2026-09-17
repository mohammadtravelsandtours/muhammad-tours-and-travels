// Frontend-side mirror of PackagesController's serialize() shape (see
// apps/api/src/modules/packages/packages.controller.ts) — a thin wrapper
// tying one already-CONFIRMED flight Booking to one already-CONFIRMED
// HotelBooking under a single shared reference, not a third booking flow.

export interface CreatePackageInput {
  bookingId: string;
  hotelBookingId: string;
}

export interface TravelPackage {
  id: string;
  packageReference: string;
  currency: string;
  totalAmount: number;
  createdAt: string;
  flightBooking?: { id: string; bookingReference: string; status: string };
  hotelBooking?: { id: string; bookingReference: string; status: string; property?: { name: string; city: string } };
}
