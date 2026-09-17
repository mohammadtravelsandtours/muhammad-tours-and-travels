'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CorporateHeader } from '@/components/corporate-header';
import { useAuth } from '@/lib/auth-context';
import { apiClient, ApiError, PendingApproval } from '@/lib/api-client';

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

/**
 * The approver's half of the corporate travel-policy gate — see
 * CorporateApprovalsService's doc comment. A CORPORATE-channel booking
 * is confirmed with the supplier but held at CONFIRMED (not ticketed)
 * until an approval here is decided. Requests are created by employees
 * through this app's own /search → /offers → book flow (or, still,
 * through the B2C app if a corporate employee books there instead —
 * either path derives the CORPORATE channel from their role).
 */
export default function ApprovalsPage() {
  const { user, accessToken, loading } = useAuth();
  const router = useRouter();
  const [approvals, setApprovals] = useState<PendingApproval[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  function load() {
    if (!accessToken) return;
    apiClient
      .listPendingApprovals(accessToken)
      .then((r) => setApprovals(r.approvals))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load pending approvals.'));
  }

  useEffect(load, [accessToken]);

  async function decide(id: string, decision: 'APPROVED' | 'REJECTED') {
    if (!accessToken) return;
    setBusyId(id);
    try {
      await apiClient.decideApproval(accessToken, id, decision);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record that decision.');
    } finally {
      setBusyId(null);
    }
  }

  if (loading || !user) return null;

  return (
    <main className="min-h-screen">
      <CorporateHeader />
      <section className="max-w-3xl mx-auto px-6 pt-10 pb-24">
      <h1 className="text-2xl font-semibold text-graphite-900">Pending approvals</h1>
      <p className="mt-1 text-sm text-graphite-500">
        Approving issues the e-ticket immediately; rejecting cancels the booking (the supplier hold is released).
      </p>

      {error && <p role="alert" className="mt-6 text-sm text-red-600">{error}</p>}
      {!error && approvals === null && <p className="mt-6 text-sm text-graphite-500">Loading…</p>}
      {approvals?.length === 0 && (
        <p className="mt-6 text-sm text-graphite-500 bg-white border border-line rounded-lg p-4">Nothing waiting on you right now.</p>
      )}

      <div className="mt-6 space-y-3">
        {approvals?.map((a) => (
          <div key={a.id} className="rounded-xl border border-line bg-white p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-graphite-900 font-medium">{a.booking?.bookingReference}</p>
                <p className="text-xs text-graphite-500">
                  Requested by {a.requestedBy?.name ?? 'an employee'}
                  {a.requestedBy?.title ? ` (${a.requestedBy.title})` : ''}
                </p>
              </div>
              {a.booking && <p className="text-graphite-900 font-medium">{formatMoney(a.booking.totalAmount, a.booking.currency)}</p>}
            </div>

            {a.booking?.segments.map((s, i) => (
              <p key={i} className="mt-2 text-xs text-graphite-500">
                {s.marketingCarrier}{s.flightNumber}: {s.origin} → {s.destination} ({new Date(s.departureAt).toLocaleString()})
              </p>
            ))}

            <div className="mt-4 flex gap-3">
              <button
                disabled={busyId === a.id}
                onClick={() => decide(a.id, 'APPROVED')}
                className="rounded-md bg-indigo text-white text-sm font-medium px-4 py-2 hover:bg-indigo-dim disabled:opacity-60"
              >
                Approve
              </button>
              <button
                disabled={busyId === a.id}
                onClick={() => decide(a.id, 'REJECTED')}
                className="rounded-md border border-line text-sm text-graphite-700 px-4 py-2 hover:bg-base disabled:opacity-60"
              >
                Reject
              </button>
            </div>
          </div>
        ))}
      </div>
      </section>
    </main>
  );
}
