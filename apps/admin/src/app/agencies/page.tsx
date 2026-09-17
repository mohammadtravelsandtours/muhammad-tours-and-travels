'use client';

import { useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { useAuth } from '@/lib/auth-context';
import { apiClient, ApiError, AgencyAdminRow } from '@/lib/api-client';

const STATUS_TABS = ['PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED', 'ALL'] as const;
type StatusTab = (typeof STATUS_TABS)[number];

const STATUS_LABEL: Record<StatusTab, string> = {
  PENDING_APPROVAL: 'Pending approval',
  ACTIVE: 'Active',
  SUSPENDED: 'Suspended',
  ALL: 'All',
};

const STATUS_BADGE: Record<AgencyAdminRow['status'], string> = {
  PENDING_APPROVAL: 'bg-signal/20 text-signal',
  ACTIVE: 'bg-ok/20 text-ok',
  SUSPENDED: 'bg-danger/20 text-danger',
};

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export default function AgenciesPage() {
  const { accessToken } = useAuth();
  const [tab, setTab] = useState<StatusTab>('PENDING_APPROVAL');
  const [agencies, setAgencies] = useState<AgencyAdminRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  function load() {
    if (!accessToken) return;
    setAgencies(null);
    apiClient
      .listAgencies(accessToken, tab === 'ALL' ? undefined : tab)
      .then((r) => setAgencies(r.agencies))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load agencies.'));
  }

  useEffect(load, [accessToken, tab]);

  const selected = agencies?.find((a) => a.id === selectedId) ?? null;

  return (
    <AdminShell>
      <h2 className="text-lg font-semibold text-paper-100 mb-1">B2B agency approvals</h2>
      <p className="text-sm text-paper-500 mb-6">
        New agency signups land here as PENDING_APPROVAL. Approve to activate the account, or suspend an active one —
        every status change is recorded with an optional reason.
      </p>

      <div className="flex gap-2 mb-6">
        {STATUS_TABS.map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              setSelectedId(null);
            }}
            className={`text-xs font-mono rounded-full px-3 py-1.5 ${
              tab === t ? 'bg-signal text-ink-950' : 'bg-ink-800 text-paper-300 hover:bg-ink-700'
            }`}
          >
            {STATUS_LABEL[t]}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      {!error && !agencies && <p className="text-sm text-paper-500">Loading…</p>}

      {agencies && (
        <div className="border border-ink-700 rounded-lg divide-y divide-ink-700">
          {agencies.length === 0 && <p className="px-4 py-3 text-sm text-paper-500">No agencies in this state.</p>}
          {agencies.map((a) => (
            <button
              key={a.id}
              onClick={() => setSelectedId(a.id)}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-ink-800"
            >
              <div>
                <p className="text-paper-100">{a.name}</p>
                <p className="text-xs text-paper-500">
                  {a.country ?? '—'} · {a.currency} · {a.members.length} member{a.members.length === 1 ? '' : 's'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm text-paper-100">
                  {a.wallet ? formatMoney(a.wallet.balance, a.wallet.currency) : '— no wallet —'}
                </span>
                <span className={`text-xs font-mono rounded-full px-2.5 py-1 ${STATUS_BADGE[a.status]}`}>{a.status}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <AgencyDetail
          agency={selected}
          accessToken={accessToken!}
          onClose={() => setSelectedId(null)}
          onChanged={load}
        />
      )}
    </AdminShell>
  );
}

function AgencyDetail({
  agency,
  accessToken,
  onClose,
  onChanged,
}: {
  agency: AgencyAdminRow;
  accessToken: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState<'ACTIVE' | 'SUSPENDED' | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  async function setStatus(status: 'ACTIVE' | 'SUSPENDED') {
    setSubmitting(status);
    setFormError(null);
    try {
      await apiClient.updateAgencyStatus(accessToken, agency.id, { status, reason: reason.trim() || undefined });
      setReason('');
      onChanged();
      onClose();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not update this agency.');
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div className="mt-6 border border-ink-700 rounded-lg p-5 bg-ink-900">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-paper-100 font-medium">{agency.name}</h3>
          <p className="text-xs text-paper-500">
            {agency.country ?? '—'} · {agency.currency} · created {new Date(agency.createdAt).toLocaleDateString()}
            {agency.approvedAt ? ` · approved ${new Date(agency.approvedAt).toLocaleDateString()}` : ''}
          </p>
        </div>
        <button onClick={onClose} className="text-sm text-paper-500 hover:text-paper-100">Close</button>
      </div>

      <div className="grid sm:grid-cols-2 gap-6">
        <div>
          <p className="text-xs text-paper-500 mb-2">Wallet & credit</p>
          <p className="text-sm text-paper-100">
            {agency.wallet ? formatMoney(agency.wallet.balance, agency.wallet.currency) : 'No wallet yet'}
          </p>
          <p className="text-xs text-paper-500 mt-1">
            {agency.creditEnabled
              ? `Credit enabled, limit ${formatMoney(agency.creditLimit ?? 0, agency.currency)}`
              : 'Credit not enabled'}
          </p>

          <p className="text-xs text-paper-500 mt-4 mb-2">Members</p>
          <div className="space-y-1 text-xs">
            {agency.members.length === 0 && <p className="text-paper-500">No members yet.</p>}
            {agency.members.map((m) => (
              <div key={m.id} className="flex items-center justify-between border-b border-ink-800 py-1.5">
                <span className="text-paper-100">{m.fullName}{m.title ? ` — ${m.title}` : ''}</span>
                <span className="text-paper-500">{m.email}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs text-paper-500 mb-2">Update status</p>
          <p className="text-sm text-paper-100 mb-2">
            Current: <span className={`text-xs font-mono rounded-full px-2.5 py-1 ${STATUS_BADGE[agency.status]}`}>{agency.status}</span>
          </p>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (optional)"
            className="w-full bg-ink-800 border border-ink-700 rounded-md px-3 py-2 text-sm text-paper-100 mb-2"
          />
          {formError && <p className="text-xs text-danger mb-2">{formError}</p>}
          <div className="flex gap-2">
            {agency.status !== 'ACTIVE' && (
              <button
                onClick={() => setStatus('ACTIVE')}
                disabled={submitting !== null}
                className="rounded-md bg-ok/20 text-ok font-medium px-4 py-2 text-sm hover:bg-ok/30 disabled:opacity-60"
              >
                {submitting === 'ACTIVE' ? 'Approving…' : 'Approve'}
              </button>
            )}
            {agency.status !== 'SUSPENDED' && (
              <button
                onClick={() => setStatus('SUSPENDED')}
                disabled={submitting !== null}
                className="rounded-md bg-danger/20 text-danger font-medium px-4 py-2 text-sm hover:bg-danger/30 disabled:opacity-60"
              >
                {submitting === 'SUSPENDED' ? 'Suspending…' : 'Suspend'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
