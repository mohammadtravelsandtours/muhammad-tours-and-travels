import { BookingStatus } from '@mohammad-travels/types';

/**
 * The complete, explicit set of allowed status transitions. Nothing
 * outside BookingStateMachineService should ever write `bookings.status`
 * directly — see that service's doc comment. Reasoning per state:
 *
 * - SEARCHED: an offer has been picked but nothing supplier-side has
 *   happened yet. Can move into repricing, or be abandoned (CANCELLED)
 *   or lapse (EXPIRED) if the offer/search window runs out first.
 * - PRICE_PENDING: the mandatory reprice call is in flight. Succeeds to
 *   PRICE_CONFIRMED, or fails (offer no longer available) to FAILED.
 * - PRICE_CONFIRMED: price accepted (unchanged, or explicitly confirmed
 *   by the caller after a price-change). Can proceed to booking, or
 *   still be abandoned/expire before the supplier call is made.
 * - BOOKING_PENDING: the supplier's createBooking call is in flight.
 *   Succeeds to CONFIRMED, or fails to FAILED — never back to an
 *   earlier state, since a real supplier call was already made.
 * - CONFIRMED: the supplier holds the booking but no ticket has been
 *   issued. Can proceed to TICKETED, fail during ticketing, or be
 *   cancelled before ticketing (no money has moved yet in this pass —
 *   payment integration is Phase 3+).
 * - TICKETED: a real (mock) ticket exists. From here the only paths are
 *   into a refund flow or a straight cancellation record — never back
 *   to CONFIRMED or earlier.
 * - FAILED, CANCELLED, EXPIRED, REFUNDED: terminal. A failed/cancelled/
 *   expired booking is not retried in place — the caller starts a new
 *   search/booking instead, which keeps the history of what actually
 *   happened intact rather than mutating it.
 * - REFUND_PENDING: a refund was requested; resolves to REFUNDED or,
 *   if the supplier rejects it, FAILED.
 */
export const ALLOWED_BOOKING_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  SEARCHED: ['PRICE_PENDING', 'CANCELLED', 'EXPIRED'],
  PRICE_PENDING: ['PRICE_CONFIRMED', 'FAILED', 'CANCELLED', 'EXPIRED'],
  PRICE_CONFIRMED: ['BOOKING_PENDING', 'CANCELLED', 'EXPIRED'],
  BOOKING_PENDING: ['CONFIRMED', 'FAILED'],
  CONFIRMED: ['TICKETED', 'FAILED', 'CANCELLED'],
  TICKETED: ['REFUND_PENDING', 'CANCELLED'],
  FAILED: [],
  CANCELLED: [],
  EXPIRED: [],
  REFUND_PENDING: ['REFUNDED', 'FAILED'],
  REFUNDED: [],
};

export function isTransitionAllowed(from: BookingStatus, to: BookingStatus): boolean {
  return ALLOWED_BOOKING_TRANSITIONS[from]?.includes(to) ?? false;
}
