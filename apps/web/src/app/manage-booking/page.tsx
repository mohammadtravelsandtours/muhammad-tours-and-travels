'use client';

import { FormEvent, useState } from 'react';
import { SiteHeader } from '@/components/site-header';
import { MANAGE_BOOKING_AIRLINES } from '@/lib/manage-booking-airlines';

export default function ManageBookingPage() {
  const [iataCode, setIataCode] = useState('');
  const [pnr, setPnr] = useState('');
  const [lastName, setLastName] = useState('');
  const [copied, setCopied] = useState<'pnr' | 'lastName' | null>(null);

  const airline = MANAGE_BOOKING_AIRLINES.find((a) => a.iataCode === iataCode);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!airline) return;
    window.open(airline.manageBookingUrl, '_blank', 'noopener,noreferrer');
  }

  async function copy(value: string, which: 'pnr' | 'lastName') {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      setTimeout(() => setCopied((c) => (c === which ? null : c)), 1500);
    } catch {
      // Clipboard access can be blocked by the browser — not worth
      // surfacing as an error, the field's value is still selectable by hand.
    }
  }

  return (
    <main>
      <SiteHeader />

      <section className="max-w-2xl mx-auto px-6 pt-12 pb-24">
        <h1 className="font-display text-3xl text-dusk-900">Manage your booking</h1>
        <p className="mt-2 text-sm text-dusk-500">
          Choose the airline your ticket was issued on, then continue to that airline&apos;s own manage-booking page
          with your booking reference (PNR) and last name ready to paste in. We don&apos;t hold or change airline
          reservations directly here — every airline manages its own bookings on its own site.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 rounded-2xl bg-white border border-sand shadow-sm p-5 space-y-4">
          <div className="rounded-lg border border-sand px-4 py-2.5">
            <label className="block text-xs text-dusk-500 mb-1" htmlFor="airline">Airline</label>
            <select
              id="airline"
              required
              value={iataCode}
              onChange={(e) => setIataCode(e.target.value)}
              className="w-full bg-transparent text-dusk-900 font-medium focus:outline-none"
            >
              <option value="" disabled>Select an airline…</option>
              {MANAGE_BOOKING_AIRLINES.map((a) => (
                <option key={a.iataCode} value={a.iataCode}>
                  {a.name} ({a.iataCode})
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[160px] rounded-lg border border-sand px-4 py-2.5">
              <label className="block text-xs text-dusk-500 mb-1" htmlFor="pnr">Booking reference (PNR)</label>
              <div className="flex items-center gap-2">
                <input
                  id="pnr"
                  required
                  value={pnr}
                  onChange={(e) => setPnr(e.target.value.toUpperCase())}
                  placeholder="e.g. K7QX2P"
                  maxLength={10}
                  className="flex-1 min-w-0 bg-transparent text-dusk-900 font-medium placeholder:font-normal placeholder:text-dusk-500 focus:outline-none uppercase"
                />
                <button
                  type="button"
                  onClick={() => copy(pnr, 'pnr')}
                  className="shrink-0 text-xs text-tangerine-dim hover:text-tangerine-dim/80"
                >
                  {copied === 'pnr' ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>

            <div className="flex-1 min-w-[160px] rounded-lg border border-sand px-4 py-2.5">
              <label className="block text-xs text-dusk-500 mb-1" htmlFor="lastName">Passenger last name</label>
              <div className="flex items-center gap-2">
                <input
                  id="lastName"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="As it appears on the ticket"
                  className="flex-1 min-w-0 bg-transparent text-dusk-900 font-medium placeholder:font-normal placeholder:text-dusk-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => copy(lastName, 'lastName')}
                  className="shrink-0 text-xs text-tangerine-dim hover:text-tangerine-dim/80"
                >
                  {copied === 'lastName' ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={!airline}
            className="w-full rounded-lg bg-tangerine text-white font-medium px-6 py-3 hover:bg-tangerine-dim disabled:opacity-60"
          >
            {airline ? `Continue to ${airline.name}` : 'Select an airline to continue'}
          </button>

          <p className="text-xs text-dusk-500">
            This opens {airline ? airline.name + "'s" : 'the airline’s'} own manage-booking page in a new tab. Use
            the Copy buttons above, then paste your reference and last name into that page&apos;s own form.
          </p>
        </form>

        <p className="mt-6 text-xs text-dusk-500">
          Booked with us and can&apos;t find your PNR? Check your booking confirmation email, or{' '}
          <a href="mailto:mohammadtravelsandtours@gmail.com" className="text-tangerine-dim">email us</a> and we&apos;ll help you
          track it down.
        </p>
      </section>
    </main>
  );
}
