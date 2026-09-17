'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SiteHeader } from '@/components/site-header';
import { FlightSearchForm } from '@/components/flight-search-form';
import { HotelSearchForm } from '@/components/hotel-search-form';

const DESTINATIONS = [
  { code: 'DXB', city: 'Dubai', country: 'United Arab Emirates', tone: 'from-slate-900 to-slate-700' },
  { code: 'JED', city: 'Jeddah', country: 'Saudi Arabia', tone: 'from-emerald-950 to-slate-700' },
  { code: 'SIN', city: 'Singapore', country: 'Singapore', tone: 'from-blue-950 to-slate-700' },
  { code: 'KUL', city: 'Kuala Lumpur', country: 'Malaysia', tone: 'from-indigo-950 to-slate-700' },
  { code: 'DOH', city: 'Doha', country: 'Qatar', tone: 'from-slate-950 to-purple-900' },
  { code: 'BKK', city: 'Bangkok', country: 'Thailand', tone: 'from-orange-950 to-slate-700' },
];

const SERVICES = [
  { href: '/search', title: 'Flights', body: 'Search connected airline and agency inventory with price revalidation before booking.', icon: '✈' },
  { href: '/hotels', title: 'Hotels', body: 'Find stays by destination and dates, compare rates and continue through a protected booking flow.', icon: '⌂' },
  { href: '/hajj-umrah', title: 'Hajj & Umrah', body: 'Browse published pilgrim packages, inclusions, dates and availability.', icon: '☾' },
  { href: '/packages', title: 'Tour Packages', body: 'Explore packaged journeys and combine travel services where available.', icon: '◈' },
  { href: '/visas', title: 'Visa Service', body: 'Submit and track supported visa applications from your account.', icon: '▣' },
  { href: '/manpower', title: 'Manpower', body: 'Browse overseas opportunities and submit applications securely.', icon: '◆' },
];

type HeroTab = 'flights' | 'hotels' | 'hajj-umrah';

export default function HomePage() {
  const router = useRouter();
  const searchRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<HeroTab>('flights');
  const [hajjType, setHajjType] = useState<'HAJJ' | 'UMRAH' | ''>('');
  const [destination, setDestination] = useState('');
  const [formKey, setFormKey] = useState(0);

  const openSearch = (next: HeroTab, nextDestination = '') => {
    if (nextDestination) {
      setDestination(nextDestination);
      setFormKey((current) => current + 1);
    }
    setTab(next);
    requestAnimationFrame(() => searchRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  return (
    <main className="min-h-screen bg-slate-50">
      <SiteHeader />

      <section className="relative overflow-hidden bg-dusk-900 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,rgba(249,115,22,.28),transparent_32%),radial-gradient(circle_at_15%_20%,rgba(59,130,246,.25),transparent_35%)]" />
        <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:48px_48px]" />

        <div className="relative mx-auto max-w-7xl px-5 pb-28 pt-14 sm:px-8 sm:pt-20 lg:pb-36">
          <div className="grid items-end gap-12 lg:grid-cols-[1fr_1.15fr]">
            <div className="max-w-2xl">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold backdrop-blur">
                <span className="h-2 w-2 rounded-full bg-orange-400" />
                Flights · Hotels · Hajj & Umrah · Travel Services
              </div>
              <h1 className="font-display text-4xl leading-[1.02] tracking-tight sm:text-6xl">
                Your journey,
                <span className="block text-orange-400">our priority.</span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-white/70 sm:text-lg">
                Search, compare and manage travel services through one professional platform built for customers,
                travel agents and corporate travellers.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/search" className="rounded-xl bg-orange-500 px-5 py-3 text-sm font-bold text-white shadow-lg hover:bg-orange-400">
                  Search flights
                </Link>
                <Link href="/hotels" className="rounded-xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-bold text-white backdrop-blur hover:bg-white/15">
                  Find hotels
                </Link>
                <Link href="/hajj-umrah" className="rounded-xl border border-white/20 px-5 py-3 text-sm font-bold text-white backdrop-blur hover:bg-white/15">
                  Hajj & Umrah
                </Link>
              </div>
            </div>

            <div ref={searchRef} id="search-panel" className="scroll-mt-24">
              <div className="mb-3 flex flex-wrap gap-2">
                {([
                  ['flights', 'Flights'],
                  ['hotels', 'Hotels'],
                  ['hajj-umrah', 'Hajj & Umrah'],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTab(key)}
                    className={`rounded-full px-4 py-2 text-sm font-semibold ${tab === key ? 'bg-white text-dusk-900' : 'bg-white/10 text-white hover:bg-white/15'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {tab === 'flights' && <FlightSearchForm key={formKey} compact initialDestination={destination} />}
              {tab === 'hotels' && <HotelSearchForm />}
              {tab === 'hajj-umrah' && (
                <div className="rounded-3xl border border-slate-200 bg-white p-6 text-dusk-900 shadow-[0_18px_60px_rgba(15,23,42,0.18)]">
                  <p className="text-sm text-dusk-500">Explore published pilgrim packages, hotel information, inclusions and departure dates.</p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {([
                      ['', 'All packages'],
                      ['HAJJ', 'Hajj'],
                      ['UMRAH', 'Umrah'],
                    ] as const).map(([value, label]) => (
                      <button key={label} type="button" onClick={() => setHajjType(value)} className={`rounded-full border px-4 py-2 text-sm font-semibold ${hajjType === value ? 'border-dusk-900 bg-dusk-900 text-white' : 'border-slate-200 hover:bg-slate-50'}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => router.push(`/hajj-umrah${hajjType ? `?type=${hajjType}` : ''}`)}
                    className="mt-5 rounded-xl bg-orange-500 px-6 py-3 text-sm font-bold text-white hover:bg-orange-400"
                  >
                    Browse packages
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="-mt-8 relative z-10 mx-auto max-w-7xl px-5 sm:px-8">
        <div className="grid overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl sm:grid-cols-3">
          {[
            ['Secure booking', 'Protected account and server-side authorization'],
            ['Transparent fares', 'Fare terms and final revalidation before booking'],
            ['Regional support', 'Bangladesh and Singapore contact channels'],
          ].map(([title, body]) => (
            <div key={title} className="border-b border-slate-100 p-5 last:border-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
              <p className="text-sm font-bold text-dusk-900">{title}</p>
              <p className="mt-1 text-xs leading-5 text-dusk-500">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-600">Travel services</p>
            <h2 className="mt-2 font-display text-3xl text-dusk-900">Everything in one place</h2>
          </div>
          <Link href="/contact" className="hidden text-sm font-semibold text-orange-600 sm:block">Need help? Contact us →</Link>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map((service) => (
            <Link key={service.href} href={service.href} className="group rounded-2xl border border-slate-200 bg-white p-6 transition hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-lg">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-lg text-dusk-900 group-hover:bg-orange-50 group-hover:text-orange-600">{service.icon}</span>
              <h3 className="mt-5 text-base font-bold text-dusk-900">{service.title}</h3>
              <p className="mt-2 text-sm leading-6 text-dusk-500">{service.body}</p>
              <span className="mt-5 inline-block text-sm font-bold text-orange-600">Explore →</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="bg-white py-20">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-600">Popular routes</p>
              <h2 className="mt-2 font-display text-3xl text-dusk-900">Start with a destination</h2>
            </div>
            <Link href="/search" className="text-sm font-semibold text-orange-600">Search all routes →</Link>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {DESTINATIONS.map((destination) => (
              <button key={destination.code} type="button" onClick={() => openSearch('flights', destination.code)} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm hover:shadow-lg">
                <div className={`relative h-32 bg-gradient-to-br ${destination.tone}`}>
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(255,255,255,.2),transparent_30%)]" />
                  <div className="absolute bottom-4 left-5">
                    <span className="rounded-md bg-white/15 px-2 py-1 text-xs font-bold text-white backdrop-blur">{destination.code}</span>
                  </div>
                </div>
                <div className="p-5">
                  <h3 className="font-bold text-dusk-900">{destination.city}</h3>
                  <p className="mt-1 text-xs text-dusk-500">{destination.country}</p>
                  <span className="mt-4 inline-block text-xs font-bold text-orange-600">Search flights →</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
        <div className="grid gap-8 rounded-3xl bg-dusk-900 p-8 text-white sm:p-12 lg:grid-cols-[1.2fr_.8fr]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-400">For every traveller</p>
            <h2 className="mt-3 font-display text-3xl sm:text-4xl">Customer, B2B and corporate travel workflows.</h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/65">
              Customers get a clean booking journey. Approved travel agencies can use the dedicated B2B portal and
              wallet. Corporate teams get policy-aware travel workflows and approvals.
            </p>
          </div>
          <div className="flex flex-wrap content-center gap-3 lg:justify-end">
            <Link href="/login" className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-dusk-900 hover:bg-slate-100">Customer login</Link>
            <Link href="/contact" className="rounded-xl border border-white/20 px-5 py-3 text-sm font-bold hover:bg-white/10">Talk to our team</Link>
          </div>
        </div>
      </section>

      <section className="border-t border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-7xl px-5 py-10 text-center sm:px-8">
          <p className="text-xs text-dusk-400">Live supplier fares, availability and booking references are only displayed when a configured provider returns them. Test suppliers remain clearly labelled.</p>
        </div>
      </section>
    </main>
  );
}
