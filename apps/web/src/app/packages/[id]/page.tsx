'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';
import { useAuth } from '@/lib/auth-context';
import { apiClient, ApiError } from '@/lib/api-client';
import { TravelPackage } from '@/lib/package-types';
import { formatDateTime, formatMoney } from '@/lib/format';

export default function PackageDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, accessToken, loading: authLoading } = useAuth();
  const [pkg, setPkg] = useState<TravelPackage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace(`/login?next=${encodeURIComponent(`/packages/${params.id}`)}`);
  }, [authLoading, user, router, params.id]);

  useEffect(() => {
    if (!accessToken) return;
    apiClient
      .getPackage(params.id, accessToken)
      .then(setPkg)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load this package.'));
  }, [accessToken, params.id]);

  if (authLoading || !user) return null;

  return (
    <main className="min-h-screen">
      <SiteHeader />
      <section className="max-w-2xl mx-auto px-6 pt-10 pb-24">
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {!error && !pkg && <p className="text-sm text-dusk-500">Loading…</p>}

        {pkg && (
          <>
            <h1 className="font-display text-2xl text-dusk-900">Package {pkg.packageReference}</h1>
            <p className="text-sm text-dusk-500 mt-1">Created {formatDateTime(pkg.createdAt)}</p>

            <div className="mt-6 rounded-2xl bg-white border border-sand shadow-sm p-5 flex items-center justify-between">
              <p className="text-xs text-dusk-500">Combined total</p>
              <p className="font-display text-3xl text-dusk-900">{formatMoney(pkg.totalAmount, pkg.currency)}</p>
            </div>

            <div className="mt-6 grid sm:grid-cols-2 gap-4">
              <div className="rounded-xl bg-white border border-sand p-4">
                <p className="text-xs font-medium text-dusk-700 mb-2">Flight</p>
                {pkg.flightBooking ? (
                  <>
                    <p className="text-sm text-dusk-500">{pkg.flightBooking.bookingReference}</p>
                    <p className="text-xs text-dusk-500 mt-1">{pkg.flightBooking.status}</p>
                    <Link href={`/bookings/${pkg.flightBooking.id}`} className="text-xs text-tangerine-dim mt-2 inline-block">
                      View flight booking
                    </Link>
                  </>
                ) : (
                  <p className="text-sm text-dusk-500">—</p>
                )}
              </div>
              <div className="rounded-xl bg-white border border-sand p-4">
                <p className="text-xs font-medium text-dusk-700 mb-2">Hotel</p>
                {pkg.hotelBooking ? (
                  <>
                    <p className="text-sm text-dusk-500">
                      {pkg.hotelBooking.bookingReference}
                      {pkg.hotelBooking.property ? ` — ${pkg.hotelBooking.property.name}, ${pkg.hotelBooking.property.city}` : ''}
                    </p>
                    <p className="text-xs text-dusk-500 mt-1">{pkg.hotelBooking.status}</p>
                    <Link href={`/hotels/bookings/${pkg.hotelBooking.id}`} className="text-xs text-tangerine-dim mt-2 inline-block">
                      View hotel booking
                    </Link>
                  </>
                ) : (
                  <p className="text-sm text-dusk-500">—</p>
                )}
              </div>
            </div>

            <Link href="/packages" className="mt-8 inline-block text-sm text-tangerine-dim">
              ← Back to my packages
            </Link>
          </>
        )}
      </section>
    </main>
  );
}
