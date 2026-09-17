'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';
import { useAuth } from '@/lib/auth-context';
import { apiClient, ApiError } from '@/lib/api-client';
import { HOTEL_BOOKING_CANCELLABLE_STATUSES, HOTEL_BOOKING_STATUS_LABEL, HotelBooking } from '@/lib/hotel-types';
import { formatDateTime, formatMoney } from '@/lib/format';

const TERMINAL_GOOD: HotelBooking['status'][] = ['CONFIRMED'];
const TERMINAL_BAD: HotelBooking['status'][] = ['FAILED', 'CANCELLED'];

export default function HotelBookingDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, accessToken, loading: authLoading } = useAuth();
  const [booking, setBooking] = useState<HotelBooking | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace(`/login?next=${encodeURIComponent(`/hotels/bookings/${params.id}`)}`);
  }, [authLoading, user, router, params.id]);

  useEffect(() => {
    if (!accessToken) return;
    apiClient
      .getHotelBooking(params.id, accessToken)
      .then(setBooking)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load this booking.'));
  }, [accessToken, params.id]);

  async function handleCancel() {
    if (!accessToken) return;
    setCancelling(true);
    setCancelError(null);
    try {
      const updated = await apiClient.cancelHotelBooking(params.id, cancelReason.trim() || undefined, accessToken);
      setBooking(updated);
      setShowCancelForm(false);
    } catch (err) {
      setCancelError(err instanceof ApiError ? err.message : 'Could not cancel this booking. Please try again.');
    } finally {
      setCancelling(false);
    }
  }

  if (authLoading || !user) return null;

  const canCancel = booking && HOTEL_BOOKING_CANCELLABLE_STATUSES.includes(booking.status);

  return (
    <main className="min-h-screen">
      <SiteHeader />
      <section className="max-w-3xl mx-auto px-6 pt-10 pb-24">
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {!error && !booking && <p className="text-sm text-dusk-500">Loading…</p>}

        {booking && (
          <>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="font-display text-2xl text-dusk-900">Booking {booking.bookingReference}</h1>
                <p className="text-sm text-dusk-500 mt-1">Created {formatDateTime(booking.createdAt)}</p>
              </div>
              <StatusBadge status={booking.status} />
            </div>

            {TERMINAL_GOOD.includes(booking.status) && (
              <p className="mt-4 text-sm text-dusk-700 bg-sand/50 rounded-lg px-4 py-3">
                Your hotel booking is confirmed with the supplier.
              </p>
            )}
            {TERMINAL_BAD.includes(booking.status) && (
              <p className="mt-4 text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">
                This booking did not complete ({HOTEL_BOOKING_STATUS_LABEL[booking.status].toLowerCase()}). You have not
                been charged for a confirmed rate. Please search again or contact support.
              </p>
            )}
            {(booking.status === 'REFUND_PENDING' || booking.status === 'REFUNDED') && (
              <p className="mt-4 text-sm text-dusk-700 bg-sand/50 rounded-lg px-4 py-3">
                This booking was cancelled. {booking.status === 'REFUND_PENDING' ? 'A refund is being processed.' : 'The refund has been completed.'}
              </p>
            )}

            {booking.offer && (
              <div className="mt-6 rounded-2xl bg-white border border-sand shadow-sm p-5 space-y-2 text-sm">
                <p className="font-medium text-dusk-900">
                  {booking.offer.property?.name ?? 'Property'}
                  {booking.offer.property ? `, ${booking.offer.property.city}, ${booking.offer.property.country}` : ''}
                </p>
                <p className="text-dusk-500">
                  {booking.offer.roomType} · {booking.offer.board.replace('_', ' ')} · {booking.offer.nights} night
                  {booking.offer.nights === 1 ? '' : 's'}
                </p>
              </div>
            )}

            <div className="mt-6 grid sm:grid-cols-2 gap-4">
              <div className="rounded-xl bg-white border border-sand p-4">
                <p className="text-xs font-medium text-dusk-700 mb-2">Guest</p>
                <p className="text-sm text-dusk-500">{booking.guestName}</p>
                <p className="text-xs text-dusk-500 mt-1">{booking.contactEmail} · {booking.contactPhone}</p>
              </div>
              <div className="rounded-xl bg-white border border-sand p-4">
                <p className="text-xs font-medium text-dusk-700 mb-2">Total paid</p>
                <p className="font-display text-2xl text-dusk-900">{formatMoney(booking.totalAmount, booking.currency)}</p>
              </div>
            </div>

            {booking.refunds.length > 0 && (
              <div className="mt-4 rounded-xl bg-white border border-sand p-4">
                <p className="text-xs font-medium text-dusk-700 mb-2">Refunds</p>
                <ul className="text-sm text-dusk-500 space-y-0.5">
                  {booking.refunds.map((r, i) => (
                    <li key={i}>
                      {formatMoney(r.amount, r.currency)} — {r.status.toLowerCase()}
                      {r.reason ? ` (${r.reason})` : ''} · {formatDateTime(r.createdAt)}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {canCancel && (
              <div className="mt-6 rounded-xl border border-sand bg-white p-4">
                {!showCancelForm ? (
                  <button onClick={() => setShowCancelForm(true)} className="text-sm text-tangerine-dim">
                    Cancel this booking
                  </button>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-dusk-700">
                      Cancelling will request a refund from the supplier. This cannot be undone.
                    </p>
                    <textarea
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      placeholder="Reason (optional)"
                      maxLength={500}
                      rows={2}
                      className="w-full rounded-md border border-sand px-3 py-2 text-sm"
                    />
                    {cancelError && <p role="alert" className="text-sm text-red-600">{cancelError}</p>}
                    <div className="flex gap-3">
                      <button
                        disabled={cancelling}
                        onClick={handleCancel}
                        className="rounded-lg bg-tangerine text-white text-sm font-medium px-5 py-2 hover:bg-tangerine-dim disabled:opacity-60"
                      >
                        {cancelling ? 'Cancelling…' : 'Confirm cancellation'}
                      </button>
                      <button onClick={() => setShowCancelForm(false)} className="text-sm text-dusk-500">
                        Keep booking
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <Link href="/hotels/bookings" className="mt-8 inline-block text-sm text-tangerine-dim">
              ← Back to my hotel bookings
            </Link>
          </>
        )}
      </section>
    </main>
  );
}

function StatusBadge({ status }: { status: HotelBooking['status'] }) {
  const good = TERMINAL_GOOD.includes(status);
  const bad = TERMINAL_BAD.includes(status);
  const cls = good ? 'bg-green-100 text-green-700' : bad ? 'bg-red-100 text-red-700' : 'bg-sand text-dusk-700';
  return <span className={`text-xs font-medium rounded-full px-3 py-1 ${cls}`}>{HOTEL_BOOKING_STATUS_LABEL[status]}</span>;
}
