'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { B2bHeader } from '@/components/b2b-header';
import { OfferCard } from '@/components/offer-card';
import { apiClient, ApiError } from '@/lib/api-client';
import { FlightOffer, SearchResult } from '@/lib/flight-types';

type SortKey = 'best' | 'price' | 'duration' | 'stops';
type StopsFilter = 'any' | 'nonstop' | 'one' | 'twoPlus';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'best', label: 'Best' },
  { key: 'price', label: 'Cheapest' },
  { key: 'duration', label: 'Fastest' },
  { key: 'stops', label: 'Fewest stops' },
];

/**
 * The offer-wide `stops` count SUMS every leg (1 stop outbound + 1 stop
 * back = 2) — filtering on that would put a "1 stop each way" round trip
 * in the "2+ stops" bucket, which no real flight-search tool does. The
 * per-leg breakdown lets "1 stop" mean what a traveler expects: at most
 * one stop in EITHER direction.
 */
function maxLegStops(offer: FlightOffer): number {
  if (offer.legs && offer.legs.length > 0) return Math.max(...offer.legs.map((l) => l.stops));
  return offer.stops;
}

/**
 * "Best" blends price and duration (60/40) rather than optimizing either
 * alone — the same idea behind Google Flights/Skyscanner defaulting to
 * "Best" instead of "Cheapest". Normalized against the currently
 * filtered set so the scale always reflects the fares actually on
 * screen, not the full unfiltered result.
 */
function bestScore(offer: FlightOffer, bounds: { minPrice: number; maxPrice: number; minDuration: number; maxDuration: number }): number {
  const priceRange = bounds.maxPrice - bounds.minPrice || 1;
  const durationRange = bounds.maxDuration - bounds.minDuration || 1;
  const priceScore = (offer.totalFare - bounds.minPrice) / priceRange;
  const durationScore = (offer.totalDurationMinutes - bounds.minDuration) / durationRange;
  return priceScore * 0.6 + durationScore * 0.4;
}

export default function SearchResultsPage() {
  const params = useParams<{ searchId: string }>();
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>('best');
  const [stopsFilter, setStopsFilter] = useState<StopsFilter>('any');
  const [refundableOnly, setRefundableOnly] = useState(false);
  const [carrierFilters, setCarrierFilters] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getSearch(params.searchId)
      .then((r) => !cancelled && setResult(r))
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : 'Could not load these results.'));
    return () => {
      cancelled = true;
    };
  }, [params.searchId]);

  function toggleCarrier(code: string) {
    setCarrierFilters((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }

  const carriers = result
    ? Array.from(new Set(result.offers.map((o) => o.validatingCarrier))).sort()
    : [];

  const filtered = result
    ? result.offers.filter((o) => {
        const stops = maxLegStops(o);
        if (stopsFilter === 'nonstop' && stops !== 0) return false;
        if (stopsFilter === 'one' && stops > 1) return false;
        if (stopsFilter === 'twoPlus' && stops < 2) return false;
        if (refundableOnly && !o.refundable) return false;
        if (carrierFilters.length > 0 && !carrierFilters.includes(o.validatingCarrier)) return false;
        return true;
      })
    : [];

  const bounds = {
    minPrice: Math.min(...filtered.map((o) => o.totalFare), Infinity),
    maxPrice: Math.max(...filtered.map((o) => o.totalFare), -Infinity),
    minDuration: Math.min(...filtered.map((o) => o.totalDurationMinutes), Infinity),
    maxDuration: Math.max(...filtered.map((o) => o.totalDurationMinutes), -Infinity),
  };

  const offers = [...filtered].sort((a, b) => {
    if (sort === 'price') return a.totalFare - b.totalFare;
    if (sort === 'duration') return a.totalDurationMinutes - b.totalDurationMinutes;
    if (sort === 'stops') return maxLegStops(a) - maxLegStops(b);
    return bestScore(a, bounds) - bestScore(b, bounds);
  });

  return (
    <main className="min-h-screen">
      <B2bHeader />
      <section className="max-w-5xl mx-auto px-6 pt-10 pb-24">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-slate-900">
            {result ? `${result.offerCount} fare${result.offerCount === 1 ? '' : 's'} found` : 'Searching…'}
          </h1>
          <Link href="/search" className="text-sm text-teal-dim">
            New search
          </Link>
        </div>

        {error && (
          <p role="alert" className="mt-6 text-sm text-red-600 bg-white border border-line rounded-lg p-4">
            {error} — the search may have expired after 30 minutes. Try searching again.
          </p>
        )}

        {!error && !result && (
          <p className="mt-6 text-sm text-slate-500">Loading results…</p>
        )}

        {result && result.offers.length === 0 && (
          <p className="mt-6 text-sm text-slate-500 bg-white border border-line rounded-lg p-4">
            No fares matched this search. Try different dates or airports.
          </p>
        )}

        {result && result.offers.length > 0 && (
          <div className="mt-4 grid sm:grid-cols-[220px_1fr] gap-6 items-start">
            <aside className="rounded-xl border border-line bg-white p-4 space-y-5 text-sm sm:sticky sm:top-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500 font-medium mb-2">Stops</p>
                <div className="space-y-1.5">
                  {(
                    [
                      ['any', 'Any'],
                      ['nonstop', 'Nonstop'],
                      ['one', '1 stop or fewer'],
                      ['twoPlus', '2+ stops'],
                    ] as [StopsFilter, string][]
                  ).map(([value, label]) => (
                    <label key={value} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="stopsFilter"
                        checked={stopsFilter === value}
                        onChange={() => setStopsFilter(value)}
                        className="accent-teal"
                      />
                      <span className={stopsFilter === value ? 'text-slate-900' : 'text-slate-500'}>{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={refundableOnly}
                  onChange={(e) => setRefundableOnly(e.target.checked)}
                  className="accent-teal"
                />
                <span className="text-slate-700">Refundable only</span>
              </label>

              {carriers.length > 1 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">Airline</p>
                    {carrierFilters.length > 0 && (
                      <button type="button" onClick={() => setCarrierFilters([])} className="text-xs text-teal-dim">
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {carriers.map((c) => (
                      <label key={c} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={carrierFilters.includes(c)}
                          onChange={() => toggleCarrier(c)}
                          className="accent-teal"
                        />
                        <span className={carrierFilters.includes(c) ? 'text-slate-900' : 'text-slate-500'}>{c}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </aside>

            <div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
                <span>Sort by:</span>
                {SORTS.map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setSort(key)}
                    className={sort === key ? 'text-slate-900 font-medium underline' : 'hover:text-slate-900'}
                  >
                    {label}
                  </button>
                ))}
                <span className="ml-auto">{offers.length} of {result.offers.length} fares</span>
              </div>
              {offers.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500 bg-white border border-line rounded-lg p-4">
                  No fares match these filters. Try clearing a filter.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  {offers.map((offer) => (
                    <OfferCard key={offer.id} offer={offer} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {result && result.supplierRuns && result.supplierRuns.some((r) => r.status !== 'SUCCESS') && (
          <div className="mt-8 text-xs text-slate-500">
            <p className="font-medium text-slate-700">Supplier status</p>
            <ul className="mt-1 space-y-0.5">
              {result.supplierRuns.map((r) => (
                <li key={r.supplierCode}>
                  {r.supplierName}: {r.status.toLowerCase()}
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
