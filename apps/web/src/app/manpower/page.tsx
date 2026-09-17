'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { SiteHeader } from '@/components/site-header';
import { apiClient, ApiError } from '@/lib/api-client';
import { ManpowerJob } from '@/lib/manpower-types';
import { formatMoney, formatDate } from '@/lib/format';

export default function ManpowerJobsPage() {
  // useSearchParams needs a Suspense boundary in the app router, or the
  // production build fails — see login/register pages for the same pattern.
  return (
    <Suspense fallback={null}>
      <ManpowerJobsPageInner />
    </Suspense>
  );
}

function ManpowerJobsPageInner() {
  // Deep-linkable from the homepage hero's Manpower tab (?country=...).
  const searchParams = useSearchParams();
  const [jobs, setJobs] = useState<ManpowerJob[] | null>(null);
  const [allCountries, setAllCountries] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [country, setCountry] = useState(searchParams.get('country') ?? '');

  // Fetched once, unfiltered — the country chip list must not shrink to
  // just the active filter once one is selected (which is what deriving
  // it from the already-filtered `jobs` list would do).
  useEffect(() => {
    apiClient
      .listManpowerJobs()
      .then((r) => setAllCountries(Array.from(new Set(r.jobs.map((j) => j.country))).sort()))
      .catch(() => {
        /* the chip list is a convenience; the main load's error below covers the real failure case */
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setJobs(null);
    apiClient
      .listManpowerJobs(country ? { country } : undefined)
      .then((r) => !cancelled && setJobs(r.jobs))
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : 'Could not load jobs.'));
    return () => {
      cancelled = true;
    };
  }, [country]);

  return (
    <main className="min-h-screen">
      <SiteHeader />
      <section className="max-w-4xl mx-auto px-6 pt-10 pb-24">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl text-dusk-900">Manpower — overseas job placement</h1>
            <p className="mt-2 text-dusk-500 max-w-xl">
              Browse open overseas positions and apply directly. We do not charge candidates a recruitment fee.
            </p>
          </div>
          <Link href="/manpower/applications" className="text-sm text-tangerine-dim shrink-0">
            My applications
          </Link>
        </div>

        {allCountries.length > 1 && (
          <div className="mt-6 flex flex-wrap gap-2 text-sm">
            <button
              onClick={() => setCountry('')}
              className={`rounded-full border px-3 py-1.5 ${country === '' ? 'border-tangerine text-dusk-900 font-medium' : 'border-sand text-dusk-500'}`}
            >
              All countries
            </button>
            {allCountries.map((c) => (
              <button
                key={c}
                onClick={() => setCountry(c)}
                className={`rounded-full border px-3 py-1.5 ${country === c ? 'border-tangerine text-dusk-900 font-medium' : 'border-sand text-dusk-500'}`}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {error && (
          <p role="alert" className="mt-6 text-sm text-red-600 bg-white border border-sand rounded-lg p-4">
            {error}
          </p>
        )}
        {!error && !jobs && <p className="mt-6 text-sm text-dusk-500">Loading jobs…</p>}
        {jobs && jobs.length === 0 && (
          <p className="mt-6 text-sm text-dusk-500 bg-white border border-sand rounded-lg p-4">
            No open positions right now. Check back soon, or contact us to be notified.
          </p>
        )}

        <div className="mt-6 space-y-3">
          {jobs?.map((job) => (
            <Link
              key={job.id}
              href={`/manpower/${job.id}`}
              className="block rounded-2xl bg-white border border-sand shadow-sm p-5 hover:border-tangerine transition-colors"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-lg font-medium text-dusk-900">{job.title}</p>
                  <p className="text-sm text-dusk-500">
                    {job.country}
                    {job.employer ? ` · ${job.employer}` : ''}
                    {job.category ? ` · ${job.category}` : ''}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  {job.salaryMin != null && (
                    <p className="text-sm font-medium text-dusk-900">
                      {formatMoney(job.salaryMin, job.currency ?? 'USD')}
                      {job.salaryMax != null && job.salaryMax !== job.salaryMin ? ` – ${formatMoney(job.salaryMax, job.currency ?? 'USD')}` : ''}
                      <span className="text-dusk-500 font-normal"> /mo</span>
                    </p>
                  )}
                  <p className="text-xs text-dusk-500">{job.positionsRemaining} of {job.positionsAvailable} positions open</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-dusk-500">
                {job.contractDurationMonths && <span>{job.contractDurationMonths} month contract</span>}
                {job.applicationDeadline && <span>Apply by {formatDate(job.applicationDeadline)}</span>}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
