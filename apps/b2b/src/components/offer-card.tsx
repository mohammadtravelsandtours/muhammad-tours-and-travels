'use client';

import Link from 'next/link';
import { FlightOffer } from '@/lib/flight-types';
import { legLabel, legsFor } from '@/lib/itinerary';
import { formatDuration, formatLayover, formatMoney, formatTime, stopsLabel } from '@/lib/format';

export function OfferCard({ offer }: { offer: FlightOffer }) {
  const legs = legsFor(offer);

  return (
    <Link
      href={`/offers/${offer.id}`}
      className="block rounded-2xl bg-white border border-line shadow-sm p-5 hover:border-teal transition-colors"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex-1 min-w-[240px]">
          <p className="text-xs text-slate-500 mb-1.5">{offer.isMock ? 'DEMO fare' : offer.validatingCarrier}</p>
          <div className="space-y-2.5">
            {legs.map((leg, i) => (
              <div key={i}>
                {legLabel(i, legs.length) && (
                  <p className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">{legLabel(i, legs.length)}</p>
                )}
                <p className="text-lg font-medium text-slate-900 leading-tight">
                  {formatTime(leg.departureAt)} {leg.origin} → {formatTime(leg.arrivalAt)} {leg.destination}
                </p>
                <p className="text-xs text-slate-500">
                  {formatDuration(leg.durationMinutes)} · {stopsLabel(leg.stops)}
                  {leg.layovers.length > 0 && (
                    <> · {leg.layovers.map((l) => formatLayover(l.airport, l.minutes)).join(', ')}</>
                  )}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end text-xs text-slate-500">
            <span>{offer.fareFamily} · {offer.cabin.replace('_', ' ')}</span>
            <span>{offer.refundable ? 'Refundable' : 'Non-refundable'}</span>
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold text-slate-900">{formatMoney(offer.totalFare, offer.currency)}</p>
            <p className="text-xs text-slate-500">total, all pax</p>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        <span>Baggage: {offer.baggage.note ?? `${offer.baggage.checkedKg ?? 0}kg checked, ${offer.baggage.carryOnKg ?? 0}kg carry-on`}</span>
        {offer.isMock && <span className="text-teal-dim">DEMO / MOCK — not a real fare</span>}
      </div>

      {offer.transitVisaWarning && (
        <p className="mt-2 text-xs text-slate-500 bg-base rounded-md px-3 py-2">
          ⚠ {offer.transitVisaWarning}
        </p>
      )}
    </Link>
  );
}
