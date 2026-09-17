'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';
import { HotelOfferCard } from '@/components/hotel-offer-card';
import { apiClient, ApiError } from '@/lib/api-client';
import { HotelSearchResult } from '@/lib/hotel-types';

type SortKey = 'price' | 'nights';

export default function HotelSearchResultsPage() {
  const params = useParams<{ searchId: string }>();
  const [result, setResult] = useState<HotelSearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>('price');

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getHotelSearch(params.searchId)
      .then((r) => !cancelled && setResult(r))
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : 'Could not load these results.'));
    return () => {
      cancelled = true;
    };
  }, [params.searchId]);

  const offers = result
    ? [...result.offers].sort((a, b) => (sort === 'price' ? a.totalFare - b.totalFare : a.nights - b.nights))
    : [];

  return (
    <main className="min-h-screen">
      <SiteHeader />
      <section className="max-w-4xl mx-auto px-6 pt-10 pb-24">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-2xl text-dusk-900">
            {result ? `${result.offerCount} rate${result.offerCount === 1 ? '' : 's'} found` : 'Searching…'}
          </h1>
          <Link href="/hotels" className="text-sm text-tangerine-dim">
            New search
          </Link>
        </div>

        {error && (
          <p role="alert" className="mt-6 text-sm text-red-600 bg-white border border-sand rounded-lg p-4">
            {error} — the search may have expired after 30 minutes. Try searching again.
          </p>
        )}

        {!error && !result && <p className="mt-6 text-sm text-dusk-500">Loading results…</p>}

        {result && result.offers.length === 0 && (
          <p className="mt-6 text-sm text-dusk-500 bg-white border border-sand rounded-lg p-4">
            No rates matched this search. Try different dates or a different city.
          </p>
        )}

        {result && result.offers.length > 0 && (
          <>
            <div className="mt-4 flex items-center gap-4 text-xs text-dusk-500">
              <span>Sort by:</span>
              {(['price', 'nights'] as SortKey[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setSort(k)}
                  className={sort === k ? 'text-dusk-900 font-medium underline' : 'hover:text-dusk-900'}
                >
                  {k === 'price' ? 'Cheapest' : 'Fewest nights'}
                </button>
              ))}
            </div>
            <div className="mt-4 space-y-3">
              {offers.map((offer) => (
                <HotelOfferCard key={offer.id} offer={offer} />
              ))}
            </div>
          </>
        )}

        {result && result.supplierRuns && result.supplierRuns.some((r) => r.status !== 'SUCCESS') && (
          <div className="mt-8 text-xs text-dusk-500">
            <p className="font-medium text-dusk-700">Supplier status</p>
            <ul className="mt-1 space-y-0.5">
              {result.supplierRuns.map((r) => (
                <li key={r.supplierCode}>
                  {r.supplierCode}: {r.status.toLowerCase()}
                  {r.status !== 'SUCCESS' && r.errorMessage ? ` — ${r.errorMessage}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </main>
  );
}
