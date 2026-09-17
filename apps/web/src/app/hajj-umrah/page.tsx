'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { SiteHeader } from '@/components/site-header';
import { apiClient, ApiError } from '@/lib/api-client';
import { HajjUmrahPackage } from '@/lib/hajj-umrah-types';
import { formatDate, formatMoney } from '@/lib/format';

const FILTERS = [
  { value: undefined, label: 'All' },
  { value: 'HAJJ' as const, label: 'Hajj' },
  { value: 'UMRAH' as const, label: 'Umrah' },
];

export default function HajjUmrahListPage() {
  // useSearchParams needs a Suspense boundary in the app router, or the
  // production build fails — see login/register pages for the same pattern.
  return (
    <Suspense fallback={null}>
      <HajjUmrahListPageInner />
    </Suspense>
  );
}

function HajjUmrahListPageInner() {
  // Deep-linkable from the homepage hero's Hajj & Umrah tab (?type=HAJJ|UMRAH) —
  // read once on mount; the FILTERS buttons below still drive it after that.
  const searchParams = useSearchParams();
  const initialType = searchParams.get('type');
  const [type, setType] = useState<'HAJJ' | 'UMRAH' | undefined>(
    initialType === 'HAJJ' || initialType === 'UMRAH' ? initialType : undefined,
  );
  const [packages, setPackages] = useState<HajjUmrahPackage[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPackages(null);
    apiClient
      .listHajjUmrahPackages(type)
      .then((r) => !cancelled && setPackages(r.packages))
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : 'Could not load packages.'));
    return () => {
      cancelled = true;
    };
  }, [type]);

  return (
    <main className="min-h-screen">
      <SiteHeader />
      <section className="max-w-4xl mx-auto px-6 pt-10 pb-24">
        <h1 className="font-display text-3xl text-dusk-900">Hajj &amp; Umrah packages</h1>
        <p className="mt-2 text-sm text-dusk-500">
          Browse upcoming departures, see what&apos;s included, and reserve your seat with a deposit — pay the rest
          later in installments.
        </p>

        <div className="mt-6 flex gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.label}
              onClick={() => setType(f.value)}
              className={`rounded-full px-4 py-1.5 text-sm border ${
                type === f.value ? 'bg-dusk-900 text-ground border-dusk-900' : 'border-sand text-dusk-700 hover:border-dusk-500'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {error && <p role="alert" className="mt-6 text-sm text-red-600">{error}</p>}
        {!error && packages === null && <p className="mt-8 text-sm text-dusk-500">Loading packages…</p>}
        {packages && packages.length === 0 && (
          <p className="mt-8 text-sm text-dusk-500 bg-white border border-sand rounded-lg p-4">
            No upcoming packages right now — check back soon, or contact us and we&apos;ll let you know when new dates
            are added.
          </p>
        )}

        <div className="mt-8 grid sm:grid-cols-2 gap-4">
          {packages?.map((p) => (
            <Link
              key={p.id}
              href={`/hajj-umrah/${p.id}`}
              className="block rounded-2xl bg-white border border-sand shadow-sm p-5 hover:border-tangerine transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs rounded-full bg-sand text-dusk-700 px-2.5 py-1 font-medium">{p.type}</span>
                <span className="text-xs text-dusk-500">{p.seatsRemaining} seat{p.seatsRemaining === 1 ? '' : 's'} left</span>
              </div>
              <h2 className="mt-3 font-display text-xl text-dusk-900">{p.title}</h2>
              <p className="mt-1 text-sm text-dusk-500">
                {formatDate(p.departureDate)} — {formatDate(p.returnDate)} · {p.durationNights} nights
              </p>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-xs text-dusk-500">Per pilgrim</span>
                <span className="font-display text-2xl text-dusk-900">{formatMoney(p.totalAmount, p.currency)}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
