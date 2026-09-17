'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { B2bHeader } from '@/components/b2b-header';
import { useAuth } from '@/lib/auth-context';
import { apiClient, ApiError } from '@/lib/api-client';
import { BOOKING_STATUS_LABEL, BookingSummary } from '@/lib/flight-types';
import { formatDate, formatMoney } from '@/lib/format';

export default function MyBookingsPage() {
  const { user, accessToken, loading: authLoading } = useAuth();
  const router = useRouter();
  const [bookings, setBookings] = useState<BookingSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login?next=/bookings');
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!accessToken) return;
    apiClient
      .listBookings(accessToken)
      .then((r) => setBookings(r.bookings))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load your agency\'s bookings.'));
  }, [accessToken]);

  if (authLoading || !user) return null;

  // The API decides agency-wide vs. own-only based on the caller's
  // booking:read:agency permission (see BookingsService.listMyBookings) —
  // the frontend just reflects that in copy/columns, never re-derives it.
  // bookedBy is only ever present on an agency-wide response.
  const isAgencyWide = !!bookings?.some((b) => b.bookedBy);

  return (
    <main className="min-h-screen">
      <B2bHeader />
      <section className="max-w-3xl mx-auto px-6 pt-10 pb-24">
        <h1 className="text-2xl font-semibold text-slate-900">{isAgencyWide ? 'Agency bookings' : 'My bookings'}</h1>
        {isAgencyWide && (
          <p className="mt-1 text-sm text-slate-500">Every booking made by any agent at your agency, not just your own.</p>
        )}

        {error && <p role="alert" className="mt-6 text-sm text-red-600">{error}</p>}
        {!error && bookings === null && <p className="mt-6 text-sm text-slate-500">Loading…</p>}
        {bookings && bookings.length === 0 && (
          <p className="mt-6 text-sm text-slate-500 bg-white border border-line rounded-lg p-4">
            No bookings yet. <Link href="/search" className="text-teal-dim">Search for a flight</Link> to get started.
          </p>
        )}

        <div className="mt-6 space-y-3">
          {bookings?.map((b) => (
            <Link
              key={b.id}
              href={`/bookings/${b.id}`}
              className="flex items-center justify-between rounded-2xl bg-white border border-line shadow-sm p-5 hover:border-teal transition-colors"
            >
              <div>
                <p className="font-medium text-slate-900">{b.route ?? 'Booking'} · {b.bookingReference}</p>
                <p className="text-xs text-slate-500">
                  {formatDate(b.createdAt)} · {BOOKING_STATUS_LABEL[b.status]}
                  {b.bookedBy && <> · booked by {b.bookedBy.name}</>}
                </p>
              </div>
              <p className="font-medium text-slate-900">{formatMoney(b.totalAmount, b.currency)}</p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
