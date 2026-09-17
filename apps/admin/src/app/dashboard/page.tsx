'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AdminShell } from '@/components/admin-shell';
import { useAuth } from '@/lib/auth-context';
import { apiClient, ApiError, AnalyticsOverview, AuditEntryRow } from '@/lib/api-client';

function formatMoney(amount: number, currency = 'USD'): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${amount.toFixed(0)} ${currency}`;
  }
}

const NEEDS_REVIEW_STATUSES = ['SUBMITTED', 'UNDER_REVIEW'];
function countNeedingReview(rows: Array<{ status: string; count: number }>): number {
  return rows.filter((r) => NEEDS_REVIEW_STATUSES.includes(r.status)).reduce((sum, r) => sum + r.count, 0);
}

interface ModuleTile {
  href: string;
  label: string;
  detail: string;
  icon: string;
  accent: string;
}

// Restyled from a plain divided list of link rows into a grid of small
// icon tiles — the icon is a single glyph in a colored square (no icon
// library available/needed for something this simple), consistent with
// this portal's existing text-first, no-imagery visual language.
function moduleTiles(overview: AnalyticsOverview | null): ModuleTile[] {
  return [
    { href: '/analytics', label: 'Analytics', detail: 'Revenue, bookings & trends', icon: '◔', accent: 'bg-signal/15 text-signal' },
    { href: '/wallets', label: 'Wallets', detail: overview ? `${Object.keys(overview.walletBalanceByCurrency).length || 0} currencies held` : 'B2B agency balances', icon: '◈', accent: 'bg-ok/15 text-ok' },
    { href: '/pricing', label: 'Pricing & Markup', detail: 'Fare & fee rules', icon: '▤', accent: 'bg-signal/15 text-signal' },
    { href: '/suppliers', label: 'Suppliers', detail: 'Connections & health', icon: '◎', accent: 'bg-paper-300/20 text-paper-100' },
    { href: '/rbac', label: 'Roles & Access', detail: 'Staff permissions', icon: '◫', accent: 'bg-paper-300/20 text-paper-100' },
    { href: '/audit', label: 'Audit Log', detail: 'Every administrative write', icon: '☰', accent: 'bg-paper-300/20 text-paper-100' },
    { href: '/agencies', label: 'B2B Agencies', detail: overview ? `${overview.agencies.active} active` : 'Approvals & status', icon: '◧', accent: 'bg-ok/15 text-ok' },
    { href: '/corporates', label: 'Corporate', detail: overview ? `${overview.corporatesCount} accounts` : 'Travel programs', icon: '◨', accent: 'bg-ok/15 text-ok' },
    { href: '/hajj-umrah', label: 'Hajj & Umrah', detail: 'Packages & bookings', icon: '☾', accent: 'bg-signal/15 text-signal' },
    { href: '/manpower', label: 'Manpower', detail: 'Jobs & applications', icon: '◪', accent: 'bg-signal/15 text-signal' },
  ];
}

export default function DashboardPage() {
  const { user, accessToken } = useAuth();
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [recentActivity, setRecentActivity] = useState<AuditEntryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    Promise.all([apiClient.getAnalyticsOverview(accessToken), apiClient.listAuditLog(accessToken, { take: 6 })])
      .then(([ov, audit]) => {
        setOverview(ov);
        setRecentActivity(audit.entries);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load dashboard data.'));
  }, [accessToken]);

  const pendingAgencies = overview?.agencies.pendingApproval ?? 0;
  const pendingManpower = overview ? countNeedingReview(overview.manpowerApplications) : 0;
  // Visa applications also have a "needs review" count (see
  // AnalyticsOverview.visaApplications) but this admin app has no visa
  // review screen to link to yet — a pre-existing gap, not something
  // this pass adds — so it's left out of this tile row rather than
  // pointing an operator at a dead end. See docs/ROADMAP.md.
  const totalPending = pendingAgencies + pendingManpower;

  return (
    <AdminShell>
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-paper-100">Welcome back, {user?.fullName.split(' ')[0]}</h2>
        <p className="text-sm text-paper-500 mt-1">Here&apos;s what&apos;s happening across the platform right now.</p>
      </div>

      {error && <p role="alert" className="text-sm text-danger mb-4">{error}</p>}

      {/* Pending approvals — the thing an operator most needs to see first */}
      <section className="mb-8">
        <h3 className="text-xs uppercase tracking-wide text-paper-500 font-medium mb-3">Needs your attention</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <ApprovalTile href="/agencies" label="Agency approvals" count={pendingAgencies} />
          <ApprovalTile href="/manpower" label="Manpower applications" count={pendingManpower} />
          <div className="rounded-lg border border-ink-700 bg-ink-900 p-4">
            <p className="text-2xl font-semibold font-mono text-paper-100">{totalPending}</p>
            <p className="text-xs text-paper-500 mt-1">Total open items</p>
          </div>
        </div>
      </section>

      {/* KPIs */}
      <section className="mb-8">
        <h3 className="text-xs uppercase tracking-wide text-paper-500 font-medium mb-3">At a glance</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {overview ? (
            <>
              {Object.entries(overview.grossRevenueByCurrency).length > 0 ? (
                Object.entries(overview.grossRevenueByCurrency).map(([currency, amount]) => (
                  <StatTile key={currency} label={`Revenue (${currency})`} value={formatMoney(amount, currency)} />
                ))
              ) : (
                <StatTile label="Revenue" value="—" sub="No settled bookings yet" />
              )}
              <StatTile label="B2B agencies" value={String(overview.agencies.active)} sub={`${overview.agencies.pendingApproval} pending`} />
              <StatTile label="Corporate accounts" value={String(overview.corporatesCount)} />
              <StatTile label="Hotel properties" value={String(overview.hotelPropertiesCount)} />
            </>
          ) : (
            !error && <p className="text-sm text-paper-500 col-span-full">Loading…</p>
          )}
        </div>
      </section>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Module grid */}
        <section className="lg:col-span-2">
          <h3 className="text-xs uppercase tracking-wide text-paper-500 font-medium mb-3">Platform modules</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            {moduleTiles(overview).map((tile) => (
              <Link
                key={tile.href}
                href={tile.href}
                className="flex items-start gap-3 rounded-lg border border-ink-700 bg-ink-900 p-4 hover:border-signal/60 transition-colors"
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-lg ${tile.accent}`} aria-hidden>
                  {tile.icon}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-paper-100">{tile.label}</span>
                  <span className="block text-xs text-paper-500 truncate">{tile.detail}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* Recent activity */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs uppercase tracking-wide text-paper-500 font-medium">Recent activity</h3>
            <Link href="/audit" className="text-xs text-signal hover:text-signal-dim">View all</Link>
          </div>
          <div className="rounded-lg border border-ink-700 bg-ink-900 divide-y divide-ink-700">
            {recentActivity?.map((e) => (
              <div key={e.id} className="px-4 py-3">
                <p className="text-sm text-paper-100 font-mono truncate">{e.action}</p>
                <p className="text-xs text-paper-500 mt-0.5">
                  {e.resource} · {e.user ? e.user.fullName : 'system'} · {new Date(e.createdAt).toLocaleString()}
                </p>
              </div>
            ))}
            {recentActivity?.length === 0 && <p className="px-4 py-3 text-sm text-paper-500">No activity recorded yet.</p>}
            {!recentActivity && !error && <p className="px-4 py-3 text-sm text-paper-500">Loading…</p>}
          </div>
        </section>
      </div>
    </AdminShell>
  );
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border border-ink-700 rounded-lg p-4 bg-ink-900">
      <p className="text-xs text-paper-500">{label}</p>
      <p className="text-2xl font-semibold text-paper-100 mt-1 font-mono">{value}</p>
      {sub && <p className="text-xs text-paper-500 mt-1">{sub}</p>}
    </div>
  );
}

function ApprovalTile({ href, label, count }: { href: string; label: string; count: number }) {
  return (
    <Link
      href={href}
      className={`block rounded-lg border p-4 transition-colors ${
        count > 0 ? 'border-signal/40 bg-signal/10 hover:border-signal' : 'border-ink-700 bg-ink-900 hover:border-ink-600'
      }`}
    >
      <p className={`text-2xl font-semibold font-mono ${count > 0 ? 'text-signal' : 'text-paper-100'}`}>{count}</p>
      <p className="text-xs text-paper-500 mt-1">{label}</p>
    </Link>
  );
}
