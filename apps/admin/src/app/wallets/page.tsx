'use client';

import { useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { useAuth } from '@/lib/auth-context';
import { apiClient, ApiError, AgencyWithWallet, WalletTransactionRow, newIdempotencyKey } from '@/lib/api-client';

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export default function WalletsPage() {
  const { accessToken } = useAuth();
  const [agencies, setAgencies] = useState<AgencyWithWallet[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AgencyWithWallet | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    apiClient
      .listAgencyWallets(accessToken)
      .then((r) => setAgencies(r.agencies))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load agency wallets.'));
  }, [accessToken]);

  function refresh() {
    if (!accessToken) return;
    apiClient.listAgencyWallets(accessToken).then((r) => setAgencies(r.agencies));
  }

  return (
    <AdminShell>
      <h2 className="text-lg font-semibold text-paper-100 mb-1">B2B agency wallets</h2>
      <p className="text-sm text-paper-500 mb-6">
        Every balance change is an append-only ledger entry (see WalletService) — this never edits a balance directly.
      </p>

      {error && <p className="text-sm text-danger">{error}</p>}
      {!error && !agencies && <p className="text-sm text-paper-500">Loading…</p>}

      {agencies && (
        <div className="border border-ink-700 rounded-lg divide-y divide-ink-700">
          {agencies.length === 0 && <p className="px-4 py-3 text-sm text-paper-500">No B2B agencies yet.</p>}
          {agencies.map((a) => (
            <button
              key={a.id}
              onClick={() => setSelected(a)}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-ink-800"
            >
              <div>
                <p className="text-paper-100">{a.name}</p>
                <p className="text-xs text-paper-500">
                  {a.status} · {a.creditEnabled ? `Credit limit ${formatMoney(a.creditLimit, a.currency)}` : 'No credit'}
                </p>
              </div>
              <span className={`font-mono text-sm ${a.wallet && a.wallet.balance < 0 ? 'text-danger' : 'text-paper-100'}`}>
                {a.wallet ? formatMoney(a.wallet.balance, a.wallet.currency) : '— no wallet yet —'}
              </span>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <AgencyWalletDetail
          agency={selected}
          accessToken={accessToken!}
          onClose={() => setSelected(null)}
          onAdjusted={refresh}
        />
      )}
    </AdminShell>
  );
}

function AgencyWalletDetail({
  agency,
  accessToken,
  onClose,
  onAdjusted,
}: {
  agency: AgencyWithWallet;
  accessToken: string;
  onClose: () => void;
  onAdjusted: () => void;
}) {
  const [transactions, setTransactions] = useState<WalletTransactionRow[] | null>(null);
  const [type, setType] = useState<'DEPOSIT' | 'ADJUSTMENT_CREDIT' | 'ADJUSTMENT_DEBIT'>('DEPOSIT');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .listAgencyTransactions(accessToken, agency.id)
      .then((r) => setTransactions(r.transactions))
      .catch(() => setTransactions([]));
  }, [accessToken, agency.id]);

  async function submit() {
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setFormError('Enter a positive amount.');
      return;
    }
    setFormError(null);
    setSubmitting(true);
    try {
      const result = await apiClient.adjustWallet(accessToken, agency.id, { type, amount: parsed, description: description || undefined }, newIdempotencyKey());
      if ('error' in result) {
        setFormError(`${result.message} (${result.available} ${result.currency} available)`);
        return;
      }
      setAmount('');
      setDescription('');
      onAdjusted();
      const refreshed = await apiClient.listAgencyTransactions(accessToken, agency.id);
      setTransactions(refreshed.transactions);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not adjust this wallet.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-6 border border-ink-700 rounded-lg p-5 bg-ink-900">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-paper-100 font-medium">{agency.name}</h3>
        <button onClick={onClose} className="text-sm text-paper-500 hover:text-paper-100">Close</button>
      </div>

      <div className="grid sm:grid-cols-2 gap-6">
        <div>
          <p className="text-xs text-paper-500 mb-2">Adjust balance</p>
          <div className="space-y-2">
            <select value={type} onChange={(e) => setType(e.target.value as typeof type)} className="w-full bg-ink-800 border border-ink-700 rounded-md px-3 py-2 text-sm text-paper-100">
              <option value="DEPOSIT">Deposit</option>
              <option value="ADJUSTMENT_CREDIT">Adjustment (credit)</option>
              <option value="ADJUSTMENT_DEBIT">Adjustment (debit)</option>
            </select>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount"
              inputMode="decimal"
              className="w-full bg-ink-800 border border-ink-700 rounded-md px-3 py-2 text-sm text-paper-100"
            />
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
              className="w-full bg-ink-800 border border-ink-700 rounded-md px-3 py-2 text-sm text-paper-100"
            />
            {formError && <p className="text-xs text-danger">{formError}</p>}
            <button
              onClick={submit}
              disabled={submitting}
              className="rounded-md bg-signal text-ink-950 font-medium px-4 py-2 text-sm hover:bg-signal-dim disabled:opacity-60"
            >
              {submitting ? 'Applying…' : 'Apply'}
            </button>
          </div>
        </div>

        <div>
          <p className="text-xs text-paper-500 mb-2">Recent ledger entries</p>
          <div className="space-y-1 max-h-64 overflow-y-auto text-xs">
            {transactions === null && <p className="text-paper-500">Loading…</p>}
            {transactions?.length === 0 && <p className="text-paper-500">No transactions yet.</p>}
            {transactions?.map((t) => (
              <div key={t.id} className="flex items-center justify-between border-b border-ink-800 py-1.5">
                <div>
                  <p className="text-paper-100">{t.type}{t.description ? ` — ${t.description}` : ''}</p>
                  <p className="text-paper-500">{new Date(t.createdAt).toLocaleString()}</p>
                </div>
                <span className={t.debit > 0 ? 'text-danger' : 'text-ok'}>
                  {t.debit > 0 ? `-${formatMoney(t.debit, t.currency)}` : `+${formatMoney(t.credit, t.currency)}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
