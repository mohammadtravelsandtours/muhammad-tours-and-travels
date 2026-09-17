'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SiteHeader } from '@/components/site-header';
import { useAuth } from '@/lib/auth-context';
import { apiClient, ApiError } from '@/lib/api-client';
import { HOTEL_BOOKING_STATUS_LABEL, HotelBookingSummary } from '@/lib/hotel-types';
import { formatDate, formatMoney } from '@/lib/format';

export default function MyHotelBookingsPage() {
  const { user, accessToken, loading: authLoading } = useAuth();
  const router = useRouter();
  const [bookings, setBookings] = useState<HotelBookingSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login?next=/hotels/bookings');
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!accessToken) return;
    apiClient
      .listHotelBookings(accessToken)
      .then((r) => setBookings(r.bookings))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load your hotel bookings.'));
  }, [accessToken]);

  if (authLoading || !user) return null;

  return (
    <main className="min-h-screen">
      <SiteHeader />
      <section className="max-w-3xl mx-auto px-6 pt-10 pb-24">
        <h1 className="font-display text-2xl text-dusk-900">My hotel bookings</h1>

        {error && <p role="alert" className="mt-6 text-sm text-red-600">{error}</p>}
        {!error && bookings === null && <p className="mt-6 text-sm text-dusk-500">Loading…</p>}
        {bookings && bookings.length === 0 && (
          <p className="mt-6 text-sm text-dusk-500 bg-white border border-sand rounded-lg p-4">
            No hotel bookings yet. <Link href="/hotels" className="text-tangerine-dim">Search for a hotel</Link> to get started.
          </p>
        )}

        <div className="mt-6 space-y-3">
          {bookings?.map((b) => (
            <Link
              key={b.id}
              href={`/hotels/bookings/${b.id}`}
              className="flex items-center justify-between rounded-2xl bg-white border border-sand shadow-sm p-5 hover:border-tangerine transition-colors"
            >
              <div>
                <p className="font-medium text-dusk-900">
                  {b.property ? `${b.property.name}, ${b.property.city}` : 'Hotel booking'} · {b.bookingReference}
                </p>
                <p className="text-xs text-dusk-500">{formatDate(b.createdAt)} · {HOTEL_BOOKING_STATUS_LABEL[b.status]}</p>
              </div>
              <p className="font-medium text-dusk-900">{formatMoney(b.totalAmount, b.currency)}</p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
