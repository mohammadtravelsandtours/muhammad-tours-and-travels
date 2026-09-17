'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { apiClient, ApiError, WalletDto, WalletTransactionDto } from '@/lib/api-client';

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export default function WalletPage() {
  const { user, accessToken, loading } = useAuth();
  const router = useRouter();
  const [wallet, setWallet] = useState<WalletDto | null>(null);
  const [transactions, setTransactions] = useState<WalletTransactionDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  useEffect(() => {
    if (!accessToken) return;
    Promise.all([apiClient.getWallet(accessToken), apiClient.listWalletTransactions(accessToken)])
      .then(([w, t]) => {
        setWallet(w);
        setTransactions(t.transactions);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load your agency wallet.'));
  }, [accessToken]);

  if (loading || !user) return null;

  return (
    <main className="min-h-screen px-6 py-12 max-w-2xl mx-auto">
      <Link href="/dashboard" className="text-sm text-teal-dim">← Dashboard</Link>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">Agency wallet</h1>
      <p className="mt-1 text-sm text-slate-500">
        Every B2B booking is deducted from this balance — see your ledger below for exactly why it changed.
      </p>

      {error && (
        <p role="alert" className="mt-6 text-sm text-slate-700 bg-white border border-line rounded-lg p-4">
          {error}
        </p>
      )}

      {!error && !wallet && <p className="mt-6 text-sm text-slate-500">Loading…</p>}

      {wallet && (
        <div className="mt-6 rounded-xl border border-line bg-white p-5">
          <p className="text-xs text-slate-500">Current balance</p>
          <p className={`text-3xl font-semibold ${wallet.balance < 0 ? 'text-red-600' : 'text-slate-900'}`}>
            {formatMoney(wallet.balance, wallet.currency)}
          </p>
          {wallet.balance < 0 && (
            <p className="mt-1 text-xs text-red-600">Negative balance is drawing on your agency's approved credit line, if any.</p>
          )}
        </div>
      )}

      <h2 className="mt-8 text-sm font-medium text-slate-700">Ledger</h2>
      <div className="mt-2 rounded-xl border border-line bg-white divide-y divide-line">
        {transactions === null && !error && <p className="px-4 py-3 text-sm text-slate-500">Loading…</p>}
        {transactions?.length === 0 && <p className="px-4 py-3 text-sm text-slate-500">No transactions yet.</p>}
        {transactions?.map((t) => (
          <div key={t.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <div>
              <p className="text-slate-900">{t.type.replace('_', ' ').toLowerCase()}{t.description ? ` — ${t.description}` : ''}</p>
              <p className="text-xs text-slate-500">{new Date(t.createdAt).toLocaleString()}</p>
            </div>
            <span className={t.debit > 0 ? 'text-red-600' : 'text-teal-dim'}>
              {t.debit > 0 ? `-${formatMoney(t.debit, t.currency)}` : `+${formatMoney(t.credit, t.currency)}`}
            </span>
          </div>
        ))}
      </div>
    </main>
  );
}
