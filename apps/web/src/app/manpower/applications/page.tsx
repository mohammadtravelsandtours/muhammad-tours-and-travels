'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SiteHeader } from '@/components/site-header';
import { useAuth } from '@/lib/auth-context';
import { apiClient, ApiError } from '@/lib/api-client';
import { MANPOWER_STATUS_LABEL, MANPOWER_WITHDRAWABLE_STATUSES, ManpowerApplication } from '@/lib/manpower-types';
import { formatDate } from '@/lib/format';

export default function MyManpowerApplicationsPage() {
  const { user, accessToken, loading: authLoading } = useAuth();
  const router = useRouter();
  const [applications, setApplications] = useState<ManpowerApplication[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login?next=/manpower/applications');
  }, [authLoading, user, router]);

  function load() {
    if (!accessToken) return;
    apiClient
      .listManpowerApplications(accessToken)
      .then((r) => setApplications(r.applications))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load your applications.'));
  }

  useEffect(load, [accessToken]);

  async function withdraw(id: string) {
    if (!accessToken) return;
    setWithdrawingId(id);
    try {
      await apiClient.withdrawManpowerApplication(id, accessToken);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not withdraw this application.');
    } finally {
      setWithdrawingId(null);
    }
  }

  if (authLoading || !user) return null;

  return (
    <main className="min-h-screen">
      <SiteHeader />
      <section className="max-w-3xl mx-auto px-6 pt-10 pb-24">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-2xl text-dusk-900">My manpower applications</h1>
          <Link href="/manpower" className="text-sm text-tangerine-dim">Browse jobs</Link>
        </div>

        {error && <p role="alert" className="mt-6 text-sm text-red-600">{error}</p>}
        {!error && applications === null && <p className="mt-6 text-sm text-dusk-500">Loading…</p>}
        {applications && applications.length === 0 && (
          <p className="mt-6 text-sm text-dusk-500 bg-white border border-sand rounded-lg p-4">
            No applications yet. <Link href="/manpower" className="text-tangerine-dim">Browse open jobs</Link> to get started.
          </p>
        )}

        <div className="mt-6 space-y-3">
          {applications?.map((a) => (
            <div key={a.id} className="rounded-2xl bg-white border border-sand shadow-sm p-5">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <div className="min-w-0">
                  <p className="font-medium text-dusk-900 break-words">
                    {a.job?.title ?? 'Job'} {a.job?.country ? `· ${a.job.country}` : ''} · {a.applicationReference}
                  </p>
                  <p className="text-xs text-dusk-500">{formatDate(a.createdAt)} · {a.applicantFullName}</p>
                </div>
                <StatusBadge status={a.status} />
              </div>
              {a.reviewerNote && <p className="mt-3 text-sm text-dusk-700 bg-sand/50 rounded-md px-3 py-2">{a.reviewerNote}</p>}
              {MANPOWER_WITHDRAWABLE_STATUSES.includes(a.status) && (
                <button
                  onClick={() => withdraw(a.id)}
                  disabled={withdrawingId === a.id}
                  className="mt-3 text-xs text-dusk-500 hover:text-red-600 disabled:opacity-60"
                >
                  {withdrawingId === a.id ? 'Withdrawing…' : 'Withdraw application'}
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function StatusBadge({ status }: { status: ManpowerApplication['status'] }) {
  const cls =
    status === 'DEPLOYED' || status === 'SELECTED'
      ? 'bg-green-100 text-green-700'
      : status === 'REJECTED' || status === 'WITHDRAWN'
        ? 'bg-red-100 text-red-700'
        : 'bg-sand text-dusk-700';
  return <span className={`text-xs font-medium rounded-full px-3 py-1 shrink-0 ${cls}`}>{MANPOWER_STATUS_LABEL[status]}</span>;
}
