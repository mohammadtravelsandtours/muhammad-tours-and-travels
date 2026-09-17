'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SiteHeader } from '@/components/site-header';
import { useAuth } from '@/lib/auth-context';
import { apiClient, ApiError } from '@/lib/api-client';
import { VISA_STATUS_LABEL, VisaApplication } from '@/lib/visa-types';
import { formatDate } from '@/lib/format';

export default function MyVisaApplicationsPage() {
  const { user, accessToken, loading: authLoading } = useAuth();
  const router = useRouter();
  const [applications, setApplications] = useState<VisaApplication[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login?next=/visas/applications');
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!accessToken) return;
    apiClient
      .listVisaApplications(accessToken)
      .then((r) => setApplications(r.applications))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load your visa applications.'));
  }, [accessToken]);

  if (authLoading || !user) return null;

  return (
    <main className="min-h-screen">
      <SiteHeader />
      <section className="max-w-3xl mx-auto px-6 pt-10 pb-24">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-2xl text-dusk-900">My visa applications</h1>
          <Link href="/visas" className="text-sm text-tangerine-dim">New application</Link>
        </div>

        {error && <p role="alert" className="mt-6 text-sm text-red-600">{error}</p>}
        {!error && applications === null && <p className="mt-6 text-sm text-dusk-500">Loading…</p>}
        {applications && applications.length === 0 && (
          <p className="mt-6 text-sm text-dusk-500 bg-white border border-sand rounded-lg p-4">
            No visa applications yet. <Link href="/visas" className="text-tangerine-dim">Apply for a visa</Link> to get started.
          </p>
        )}

        <div className="mt-6 space-y-3">
          {applications?.map((a) => (
            <Link
              key={a.id}
              href={`/visas/applications/${a.id}`}
              className="flex items-center justify-between rounded-2xl bg-white border border-sand shadow-sm p-5 hover:border-tangerine transition-colors"
            >
              <div>
                <p className="font-medium text-dusk-900">
                  {a.destinationCountry} · {a.visaType} · {a.applicationReference}
                </p>
                <p className="text-xs text-dusk-500">{formatDate(a.createdAt)} · {a.applicantFullName}</p>
              </div>
              <StatusBadge status={a.status} />
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}

function StatusBadge({ status }: { status: VisaApplication['status'] }) {
  const cls =
    status === 'APPROVED'
      ? 'bg-green-100 text-green-700'
      : status === 'REJECTED'
      ? 'bg-red-100 text-red-700'
      : 'bg-sand text-dusk-700';
  return <span className={`text-xs font-medium rounded-full px-3 py-1 shrink-0 ${cls}`}>{VISA_STATUS_LABEL[status]}</span>;
}
