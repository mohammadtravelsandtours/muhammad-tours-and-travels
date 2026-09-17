'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SiteHeader } from '@/components/site-header';
import { useAuth } from '@/lib/auth-context';
import { apiClient, ApiError } from '@/lib/api-client';
import { HajjUmrahBooking } from '@/lib/hajj-umrah-types';
import { formatDate, formatMoney } from '@/lib/format';

const STATUS_LABEL: Record<HajjUmrahBooking['status'], string> = {
  PENDING_DEPOSIT: 'Deposit pending',
  DEPOSIT_PAID: 'Deposit paid',
  PARTIALLY_PAID: 'Partially paid',
  FULLY_PAID: 'Fully paid',
  CANCELLED: 'Cancelled',
};

export default function HajjUmrahBookingsPage() {
  const { user, accessToken, loading: authLoading } = useAuth();
  const router = useRouter();
  const [bookings, setBookings] = useState<HajjUmrahBooking[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login?next=/hajj-umrah/bookings');
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!accessToken) return;
    apiClient
      .listHajjUmrahBookings(accessToken)
      .then((r) => setBookings(r.bookings))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load your bookings.'));
  }, [accessToken]);

  if (authLoading || !user) return null;

  return (
    <main className="min-h-screen">
      <SiteHeader />
      <section className="max-w-3xl mx-auto px-6 pt-10 pb-24">
        <h1 className="font-display text-3xl text-dusk-900">My Hajj &amp; Umrah bookings</h1>

        {error && <p role="alert" className="mt-6 text-sm text-red-600">{error}</p>}
        {!error && bookings === null && <p className="mt-6 text-sm text-dusk-500">Loading…</p>}
        {bookings && bookings.length === 0 && (
          <p className="mt-6 text-sm text-dusk-500 bg-white border border-sand rounded-lg p-4">
            No bookings yet. <Link href="/hajj-umrah" className="text-tangerine-dim">Browse upcoming packages</Link>.
          </p>
        )}

        <div className="mt-6 space-y-3">
          {bookings?.map((b) => (
            <Link
              key={b.id}
              href={`/hajj-umrah/bookings/${b.id}`}
              className="block rounded-2xl bg-white border border-sand shadow-sm p-5 hover:border-tangerine transition-colors"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-dusk-900">{b.package?.title ?? 'Hajj/Umrah booking'} — {b.bookingReference}</p>
                  <p className="text-xs text-dusk-500">
                    {b.pilgrims} pilgrim{b.pilgrims === 1 ? '' : 's'}
                    {b.package ? ` · ${formatDate(b.package.departureDate)}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs rounded-full bg-sand text-dusk-700 px-2.5 py-1 inline-block mb-1">{STATUS_LABEL[b.status]}</p>
                  <p className="font-medium text-dusk-900">
                    {formatMoney(b.amountPaid, b.currency)} / {formatMoney(b.totalAmount, b.currency)}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
