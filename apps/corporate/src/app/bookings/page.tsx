'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CorporateHeader } from '@/components/corporate-header';
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
    if (!authLoading && !user) router.replace('/login');
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!accessToken) return;
    apiClient
      .listBookings(accessToken)
      .then((r) => setBookings(r.bookings))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load your bookings.'));
  }, [accessToken]);

  if (authLoading || !user) return null;

  return (
    <main className="min-h-screen">
      <CorporateHeader />
      <section className="max-w-3xl mx-auto px-6 pt-10 pb-24">
        <h1 className="text-2xl font-semibold text-graphite-900">My bookings</h1>

        {error && <p role="alert" className="mt-6 text-sm text-red-600">{error}</p>}
        {!error && bookings === null && <p className="mt-6 text-sm text-graphite-500">Loading…</p>}
        {bookings && bookings.length === 0 && (
          <p className="mt-6 text-sm text-graphite-500 bg-white border border-line rounded-lg p-4">
            No bookings yet. <Link href="/search" className="text-indigo-dim">Search for a flight</Link> to get started.
          </p>
        )}

        <div className="mt-6 space-y-3">
          {bookings?.map((b) => (
            <Link
              key={b.id}
              href={`/bookings/${b.id}`}
              className="flex items-center justify-between rounded-2xl bg-white border border-line shadow-sm p-5 hover:border-indigo transition-colors"
            >
              <div>
                <p className="font-medium text-graphite-900">{b.route ?? 'Booking'} · {b.bookingReference}</p>
                <p className="text-xs text-graphite-500">{formatDate(b.createdAt)} · {BOOKING_STATUS_LABEL[b.status]}</p>
              </div>
              <p className="font-medium text-graphite-900">{formatMoney(b.totalAmount, b.currency)}</p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
