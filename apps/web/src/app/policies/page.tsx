import type { Metadata } from 'next';
import { SiteHeader } from '@/components/site-header';

export const metadata: Metadata = {
  title: 'Fare Policies — Muhammad Tours and Travels',
  description: 'Baggage allowance, refund, cancellation, and date-change policy for flights booked on this site.',
};

const SECTIONS = [
  {
    id: 'baggage',
    title: 'Baggage allowance',
    body: [
      'Checked and carry-on baggage allowance is set by the airline and fare family, and is shown on every fare before you book — on the search results list, the fare details page, and again on your booking confirmation.',
      'When a supplier does not return a specific allowance for a fare, we show that fare’s own baggage note instead of guessing a number — always confirm exact weight and piece limits with the operating airline before you travel, especially for connecting itineraries on two different carriers.',
    ],
  },
  {
    id: 'refund',
    title: 'Refund policy',
    body: [
      'Refundable fares can be cancelled for a refund of the ticket value, minus any refund/cancellation fee shown on that fare. Non-refundable fares are not eligible for a cash refund except where the airline’s own conditions of carriage require one (for example a schedule change or flight cancellation by the airline).',
      'Refunds are processed back to the original payment method and can take one to two billing cycles to appear, depending on your bank or card issuer.',
    ],
  },
  {
    id: 'cancellation',
    title: 'Cancellation policy',
    body: [
      'You can request cancellation from Manage Booking or by contacting us. The refund fee (if any) shown on your fare at the time of booking is what applies — this is set per fare family by the airline, not by us.',
      'Tickets that have already been issued and used in part (for example one leg of a round trip already flown) are subject to the airline’s partially-used-ticket rules, which can differ from the original refund fee.',
    ],
  },
  {
    id: 'date-change',
    title: 'Date change policy',
    body: [
      'Changeable fares can have their travel date changed for the change fee shown on that fare, plus any difference in fare if the new date is more expensive. Fares marked "No changes allowed" cannot be moved to a different date once ticketed.',
      'Date changes must be requested before the ticketing deadline shown on your booking wherever possible, and are always subject to seat availability on the new date.',
    ],
  },
];

export default function PoliciesPage() {
  return (
    <main className="min-h-screen">
      <SiteHeader />
      <section className="max-w-3xl mx-auto px-6 pt-10 pb-24">
        <h1 className="font-display text-3xl text-dusk-900">Fare policies</h1>
        <p className="mt-2 text-dusk-500 max-w-xl">
          General baggage, refund, cancellation, and date-change policy for flights booked on this site. The exact
          numbers for your fare — baggage weight, refund fee, change fee — are always shown on the fare itself before
          you pay; this page explains how those numbers apply.
        </p>

        <nav className="mt-6 flex flex-wrap gap-3 text-sm">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="rounded-full border border-sand px-3 py-1.5 text-dusk-700 hover:border-tangerine hover:text-dusk-900">
              {s.title}
            </a>
          ))}
        </nav>

        <div className="mt-10 space-y-10">
          {SECTIONS.map((s) => (
            <div key={s.id} id={s.id} className="scroll-mt-24">
              <h2 className="font-display text-xl text-dusk-900">{s.title}</h2>
              <div className="mt-2 space-y-2 text-sm text-dusk-500">
                {s.body.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-12 text-xs text-dusk-500 bg-sand/50 rounded-lg px-4 py-3">
          Flight fares shown on this platform are demo/mock data while live supplier integrations are connected —
          the policy mechanics above describe how the platform works, not the terms of a specific real airline.
        </p>
      </section>
    </main>
  );
}
