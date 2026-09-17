'use client';

import { ReactNode, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { B2bHeader } from '@/components/b2b-header';
import { apiClient, ApiError } from '@/lib/api-client';
import { FlightOffer } from '@/lib/flight-types';
import { legLabel, legsFor, routeSummary } from '@/lib/itinerary';
import { formatDate, formatDuration, formatLayover, formatMoney, formatTime, stopsLabel } from '@/lib/format';

export default function OfferDetailsPage() {
  const params = useParams<{ offerId: string }>();
  const router = useRouter();
  const [offer, setOffer] = useState<FlightOffer | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getOffer(params.offerId)
      .then((o) => !cancelled && setOffer(o))
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : 'Could not load this fare.'));
    return () => {
      cancelled = true;
    };
  }, [params.offerId]);

  const legs = offer ? legsFor(offer) : [];

  return (
    <main className="min-h-screen">
      <B2bHeader />
      <section className="max-w-3xl mx-auto px-6 pt-10 pb-24">
        {error && (
          <p role="alert" className="text-sm text-red-600 bg-white border border-line rounded-lg p-4">
            {error} — this fare may have expired. Please search again.
          </p>
        )}

        {!error && !offer && <p className="text-sm text-slate-500">Loading fare details…</p>}

        {offer && (
          <>
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-semibold text-slate-900">{routeSummary(legs)}</h1>
              {offer.isMock && (
                <span className="text-xs rounded-full bg-teal/10 text-teal-dim px-3 py-1 font-medium">
                  DEMO / MOCK fare
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500 mt-1">
              {offer.fareFamily} · {offer.cabin.replace('_', ' ')}
            </p>

            <div className="mt-6 space-y-5">
              {legs.map((leg, li) => (
                <div key={li}>
                  {legLabel(li, legs.length) && (
                    <p className="text-xs uppercase tracking-wide text-slate-500 font-medium mb-2">
                      {legLabel(li, legs.length)} · {formatDate(leg.departureAt)} · {formatDuration(leg.durationMinutes)} ·{' '}
                      {stopsLabel(leg.stops)}
                    </p>
                  )}
                  <div className="rounded-2xl bg-white border border-line shadow-sm p-5 space-y-5">
                    {leg.segments.map((s, i) => (
                      <div key={i} className="flex gap-4">
                        <div className="text-xs text-slate-500 w-20 shrink-0 pt-0.5">
                          {s.marketingCarrier} {s.flightNumber}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-slate-900 font-medium">
                              {formatTime(s.departureAt)} {s.origin}
                            </span>
                            <span className="text-slate-500">{formatDuration(s.durationMinutes)}</span>
                            <span className="text-slate-900 font-medium">
                              {formatTime(s.arrivalAt)} {s.destination}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {formatDate(s.departureAt)} · {s.bookingClass} class{s.aircraft ? ` · ${s.aircraft}` : ''}
                          </p>
                          {i < leg.segments.length - 1 && (
                            <p className="text-xs text-slate-500 mt-1">
                              {leg.layovers[i] ? formatLayover(leg.layovers[i].airport, leg.layovers[i].minutes) : `Layover in ${s.destination}`}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 grid sm:grid-cols-2 gap-4">
              <InfoCard title="Baggage">
                {offer.baggage.note ?? `${offer.baggage.checkedKg ?? 0}kg checked, ${offer.baggage.carryOnKg ?? 0}kg carry-on`}
              </InfoCard>
              <InfoCard title="Fare rules">
                {offer.refundable ? 'Refundable' : 'Non-refundable'} · {offer.changeable ? 'Changeable' : 'No changes allowed'}
                {offer.ticketingDeadline && (
                  <span className="block mt-1">Ticketing deadline: {formatDate(offer.ticketingDeadline)}</span>
                )}
              </InfoCard>
            </div>

            {offer.transitVisaWarning && (
              <p className="mt-4 text-sm text-slate-700 bg-base rounded-lg px-4 py-3">
                ⚠ {offer.transitVisaWarning} This is general guidance only, not legal or immigration advice —
                always confirm transit and visa requirements with the relevant embassy or airline before travel.
              </p>
            )}

            <div className="mt-8 flex items-center justify-between rounded-2xl bg-white border border-line shadow-sm p-5">
              <div>
                <p className="text-xs text-slate-500">Total price, all passengers</p>
                <p className="text-3xl font-semibold text-slate-900">{formatMoney(offer.totalFare, offer.currency)}</p>
              </div>
              <button
                onClick={() => router.push(`/offers/${offer.id}/book`)}
                className="rounded-lg bg-teal text-white font-medium px-6 py-3 hover:bg-teal-dim"
              >
                Continue to booking
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

function InfoCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl bg-white border border-line p-4">
      <p className="text-xs font-medium text-slate-700">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{children}</p>
    </div>
  );
}
