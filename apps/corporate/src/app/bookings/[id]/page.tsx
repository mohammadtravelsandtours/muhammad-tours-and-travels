'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { CorporateHeader } from '@/components/corporate-header';
import { useAuth } from '@/lib/auth-context';
import { apiClient, ApiError } from '@/lib/api-client';
import { BOOKING_STATUS_LABEL, Booking } from '@/lib/flight-types';
import { formatDateTime, formatMoney } from '@/lib/format';

const TERMINAL_GOOD: Booking['status'][] = ['CONFIRMED', 'TICKETED'];
const TERMINAL_BAD: Booking['status'][] = ['FAILED', 'CANCELLED', 'EXPIRED'];

export default function BookingDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, accessToken, loading: authLoading } = useAuth();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!accessToken) return;
    apiClient
      .getBooking(params.id, accessToken)
      .then(setBooking)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load this booking.'));
  }, [accessToken, params.id]);

  if (authLoading || !user) return null;

  const awaitingApproval = booking?.channel === 'CORPORATE' && booking.status === 'CONFIRMED' && booking.tickets.length === 0;

  return (
    <main className="min-h-screen">
      <CorporateHeader />
      <section className="max-w-3xl mx-auto px-6 pt-10 pb-24">
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {!error && !booking && <p className="text-sm text-graphite-500">Loading…</p>}

        {booking && (
          <>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-semibold text-graphite-900">Booking {booking.bookingReference}</h1>
                <p className="text-sm text-graphite-500 mt-1">Created {formatDateTime(booking.createdAt)}</p>
              </div>
              <StatusBadge status={booking.status} />
            </div>

            {awaitingApproval && (
              <p className="mt-4 text-sm text-graphite-700 bg-base rounded-lg px-4 py-3">
                Confirmed with the airline and awaiting your manager's approval. Tickets are issued
                automatically as soon as it's approved.
              </p>
            )}
            {!awaitingApproval && TERMINAL_GOOD.includes(booking.status) && (
              <p className="mt-4 text-sm text-graphite-700 bg-base rounded-lg px-4 py-3">
                {booking.status === 'TICKETED'
                  ? 'Your ticket has been issued. Details are below.'
                  : 'Your booking is confirmed with the supplier. Ticketing will follow.'}
              </p>
            )}
            {TERMINAL_BAD.includes(booking.status) && (
              <p className="mt-4 text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">
                This booking did not complete ({BOOKING_STATUS_LABEL[booking.status].toLowerCase()}). You have not been
                charged for a confirmed fare. Please search again or contact your travel manager.
              </p>
            )}

            {booking.offer && (
              <div className="mt-6 rounded-2xl bg-white border border-line shadow-sm p-5">
                <p className="text-xs text-graphite-500 mb-2">
                  {booking.offer.fareFamily} · {booking.offer.cabin.replace('_', ' ')} · {booking.offer.stops === 0 ? 'Nonstop' : `${booking.offer.stops} stop(s)`}
                </p>
                {booking.offer.segments.map((s, i) => (
                  <div key={i} className="flex items-center justify-between text-sm py-1.5 border-t border-line first:border-t-0 first:pt-0">
                    <span className="text-graphite-500 w-20 shrink-0">{s.marketingCarrier} {s.flightNumber}</span>
                    <span className="text-graphite-900">{formatDateTime(s.departureAt)} {s.origin}</span>
                    <span className="text-graphite-500">→</span>
                    <span className="text-graphite-900">{formatDateTime(s.arrivalAt)} {s.destination}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-6 grid sm:grid-cols-2 gap-4">
              <div className="rounded-xl bg-white border border-line p-4">
                <p className="text-xs font-medium text-graphite-700 mb-2">Travelers</p>
                <ul className="text-sm text-graphite-500 space-y-0.5">
                  {booking.passengers.map((p) => (
                    <li key={p.id}>{p.title} {p.firstName} {p.lastName} · {p.type.toLowerCase()}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl bg-white border border-line p-4">
                <p className="text-xs font-medium text-graphite-700 mb-2">Total</p>
                <p className="text-2xl font-semibold text-graphite-900">{formatMoney(booking.totalAmount, booking.currency)}</p>
                <p className="text-xs text-graphite-500 mt-1">{booking.contactEmail} · {booking.contactPhone}</p>
                {booking.costCenter && (
                  <p className="text-xs text-graphite-500 mt-2">
                    Charged to cost center <span className="font-medium text-graphite-700">{booking.costCenter.code} — {booking.costCenter.name}</span>
                  </p>
                )}
              </div>
            </div>

            {booking.tickets.length > 0 && (
              <div className="mt-4 rounded-xl bg-white border border-line p-4">
                <p className="text-xs font-medium text-graphite-700 mb-2">Tickets</p>
                <ul className="text-sm text-graphite-500 space-y-0.5">
                  {booking.tickets.map((t) => (
                    <li key={t.ticketNumber}>Ticket {t.ticketNumber} — {t.status.toLowerCase()}</li>
                  ))}
                </ul>
              </div>
            )}

            <details className="mt-6 text-xs text-graphite-500">
              <summary className="cursor-pointer font-medium text-graphite-700">Booking history</summary>
              <ul className="mt-2 space-y-1">
                {booking.statusHistory.map((h, i) => (
                  <li key={i}>
                    {formatDateTime(h.createdAt)}: {h.fromStatus} → {h.toStatus}{h.reason ? ` (${h.reason})` : ''}
                  </li>
                ))}
              </ul>
            </details>

            <Link href="/bookings" className="mt-8 inline-block text-sm text-indigo-dim">
              ← Back to my bookings
            </Link>
          </>
        )}
      </section>
    </main>
  );
}

function StatusBadge({ status }: { status: Booking['status'] }) {
  const good = TERMINAL_GOOD.includes(status);
  const bad = TERMINAL_BAD.includes(status);
  const cls = good ? 'bg-green-100 text-green-700' : bad ? 'bg-red-100 text-red-700' : 'bg-base text-graphite-700';
  return <span className={`text-xs font-medium rounded-full px-3 py-1 ${cls}`}>{BOOKING_STATUS_LABEL[status]}</span>;
}
