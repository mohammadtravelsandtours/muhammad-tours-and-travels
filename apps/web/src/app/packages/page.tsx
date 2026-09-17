'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SiteHeader } from '@/components/site-header';
import { useAuth } from '@/lib/auth-context';
import { apiClient, ApiError } from '@/lib/api-client';
import { BookingSummary } from '@/lib/flight-types';
import { HotelBookingSummary } from '@/lib/hotel-types';
import { TravelPackage } from '@/lib/package-types';
import { formatDate, formatMoney } from '@/lib/format';

const PACKAGEABLE_FLIGHT_STATUSES: BookingSummary['status'][] = ['CONFIRMED', 'TICKETED'];
const PACKAGEABLE_HOTEL_STATUSES: HotelBookingSummary['status'][] = ['CONFIRMED'];

export default function PackagesPage() {
  const { user, accessToken, loading: authLoading } = useAuth();
  const router = useRouter();

  const [flightBookings, setFlightBookings] = useState<BookingSummary[] | null>(null);
  const [hotelBookings, setHotelBookings] = useState<HotelBookingSummary[] | null>(null);
  const [packages, setPackages] = useState<TravelPackage[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedBookingId, setSelectedBookingId] = useState('');
  const [selectedHotelBookingId, setSelectedHotelBookingId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login?next=/packages');
  }, [authLoading, user, router]);

  function reloadAll(token: string) {
    Promise.all([apiClient.listBookings(token), apiClient.listHotelBookings(token), apiClient.listPackages(token)])
      .then(([b, h, p]) => {
        setFlightBookings(b.bookings);
        setHotelBookings(h.bookings);
        setPackages(p.packages);
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : 'Could not load your bookings.'));
  }

  useEffect(() => {
    if (accessToken) reloadAll(accessToken);
  }, [accessToken]);

  const eligibleFlightBookings = (flightBookings ?? []).filter((b) => PACKAGEABLE_FLIGHT_STATUSES.includes(b.status));
  const eligibleHotelBookings = (hotelBookings ?? []).filter((b) => PACKAGEABLE_HOTEL_STATUSES.includes(b.status));

  async function handleCreate() {
    if (!accessToken || !selectedBookingId || !selectedHotelBookingId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await apiClient.createPackage({ bookingId: selectedBookingId, hotelBookingId: selectedHotelBookingId }, accessToken);
      setSelectedBookingId('');
      setSelectedHotelBookingId('');
      reloadAll(accessToken);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Could not create this package. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading || !user) return null;

  return (
    <main className="min-h-screen">
      <SiteHeader />
      <section className="max-w-3xl mx-auto px-6 pt-10 pb-24">
        <h1 className="font-display text-3xl text-dusk-900">Build a package</h1>
        <p className="mt-2 text-sm text-dusk-500">
          Combine one of your confirmed flight bookings with one of your confirmed hotel bookings under a single
          shared reference. Each booking must already be confirmed on its own — this doesn&apos;t create a new
          booking, only bundles two you already have.
        </p>

        {loadError && <p role="alert" className="mt-6 text-sm text-red-600">{loadError}</p>}

        {!loadError && (flightBookings === null || hotelBookings === null) && (
          <p className="mt-6 text-sm text-dusk-500">Loading your bookings…</p>
        )}

        {flightBookings && hotelBookings && (
          <div className="mt-8 rounded-2xl bg-white border border-sand shadow-sm p-5 space-y-4">
            {eligibleFlightBookings.length === 0 || eligibleHotelBookings.length === 0 ? (
              <p className="text-sm text-dusk-500">
                You need at least one confirmed <Link href="/bookings" className="text-tangerine-dim">flight booking</Link> and
                one confirmed <Link href="/hotels/bookings" className="text-tangerine-dim">hotel booking</Link> to build a
                package.
              </p>
            ) : (
              <>
                <div className="grid sm:grid-cols-2 gap-4 text-sm">
                  <label className="block">
                    <span className="block text-xs text-dusk-500 mb-1">Flight booking</span>
                    <select
                      value={selectedBookingId}
                      onChange={(e) => setSelectedBookingId(e.target.value)}
                      className="w-full rounded-md border border-sand px-3 py-2"
                    >
                      <option value="">Select a flight booking…</option>
                      {eligibleFlightBookings.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.bookingReference} · {b.route ?? 'Flight'} · {formatMoney(b.totalAmount, b.currency)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="block text-xs text-dusk-500 mb-1">Hotel booking</span>
                    <select
                      value={selectedHotelBookingId}
                      onChange={(e) => setSelectedHotelBookingId(e.target.value)}
                      className="w-full rounded-md border border-sand px-3 py-2"
                    >
                      <option value="">Select a hotel booking…</option>
                      {eligibleHotelBookings.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.bookingReference} · {b.property ? `${b.property.name}, ${b.property.city}` : 'Hotel'} ·{' '}
                          {formatMoney(b.totalAmount, b.currency)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {submitError && <p role="alert" className="text-sm text-red-600">{submitError}</p>}

                <button
                  disabled={submitting || !selectedBookingId || !selectedHotelBookingId}
                  onClick={handleCreate}
                  className="rounded-lg bg-tangerine text-white font-medium px-6 py-2.5 hover:bg-tangerine-dim disabled:opacity-60"
                >
                  {submitting ? 'Creating package…' : 'Create package'}
                </button>
              </>
            )}
          </div>
        )}

        <h2 className="font-display text-2xl text-dusk-900 mt-12">My packages</h2>
        {packages && packages.length === 0 && (
          <p className="mt-4 text-sm text-dusk-500 bg-white border border-sand rounded-lg p-4">No packages yet.</p>
        )}
        <div className="mt-4 space-y-3">
          {packages?.map((p) => (
            <Link
              key={p.id}
              href={`/packages/${p.id}`}
              className="block rounded-2xl bg-white border border-sand shadow-sm p-5 hover:border-tangerine transition-colors"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-dusk-900">Package {p.packageReference}</p>
                  <p className="text-xs text-dusk-500">{formatDate(p.createdAt)}</p>
                </div>
                <p className="font-medium text-dusk-900">{formatMoney(p.totalAmount, p.currency)}</p>
              </div>
              <div className="mt-3 text-xs text-dusk-500 space-y-0.5">
                {p.flightBooking && <p>Flight: {p.flightBooking.bookingReference} ({p.flightBooking.status.toLowerCase()})</p>}
                {p.hotelBooking && (
                  <p>
                    Hotel: {p.hotelBooking.bookingReference} ({p.hotelBooking.status.toLowerCase()})
                    {p.hotelBooking.property ? ` — ${p.hotelBooking.property.name}, ${p.hotelBooking.property.city}` : ''}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
