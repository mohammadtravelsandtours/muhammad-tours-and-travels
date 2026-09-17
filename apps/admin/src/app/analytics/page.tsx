'use client';

import { useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { useAuth } from '@/lib/auth-context';
import {
  apiClient,
  ApiError,
  AnalyticsOverview,
  BookingsTimeseriesPoint,
  RevenueByChannelRow,
  TopRouteRow,
  SupplierHealthRow,
  CorporatePolicyStats,
} from '@/lib/api-client';

// Fixed categorical order (never re-cycled per-render) for the 3 booking
// channels — validated colorblind-safe on this app's dark ink-950 surface
// (dataviz skill's default categorical dark steps 1-3, which validate
// all-pairs together; see the skill's palette.md). Always paired with a
// visible text label, never color alone.
const CHANNEL_COLOR: Record<string, string> = {
  B2C: '#3987e5',
  B2B: '#d95926',
  CORPORATE: '#199e70',
};

// Status is state, not identity — reuses this app's existing semantic
// tokens (signal/ok/danger/paper-500) rather than a generic categorical
// ramp, per the "status colors are reserved" rule.
function statusColor(status: string): string {
  if (['CONFIRMED', 'TICKETED', 'APPROVED'].includes(status)) return '#3FB68B'; // ok
  if (['FAILED', 'CANCELLED', 'REJECTED'].includes(status)) return '#E15B5B'; // danger
  if (['REFUND_PENDING', 'REFUNDED', 'EXPIRED'].includes(status)) return '#8993A8'; // paper-500 (settled, neutral)
  return '#E8A33D'; // signal — anything still in progress (SEARCHED, PRICE_*, BOOKING_PENDING, PENDING, SUBMITTED, UNDER_REVIEW, ...)
}

function formatMoney(amount: number, currency = 'USD'): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${amount.toFixed(0)} ${currency}`;
  }
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

function StatusList({ rows, countKey = 'count' }: { rows: Array<{ status: string; count: number; revenue?: number }>; countKey?: 'count' }) {
  const total = rows.reduce((s, r) => s + r.count, 0) || 1;
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.status} className="flex items-center gap-3 text-sm">
          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: statusColor(r.status) }} aria-hidden />
          <span className="text-paper-300 w-40 shrink-0 truncate">{r.status.replace(/_/g, ' ').toLowerCase()}</span>
          <div className="flex-1 h-1.5 rounded-full bg-ink-800 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(r.count / total) * 100}%`, backgroundColor: statusColor(r.status) }} />
          </div>
          <span className="font-mono text-paper-100 w-10 text-right">{r.count}</span>
        </div>
      ))}
      {rows.length === 0 && <p className="text-sm text-paper-500">No data yet.</p>}
    </div>
  );
}

/** A simple bar chart, hand-drawn in SVG (no charting library — see the API's own no-npm-registry note). One axis, one measure (booking count); revenue surfaces in the hover tooltip instead of a second scaled axis. */
function BookingsBarChart({ points }: { points: BookingsTimeseriesPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 720;
  const height = 180;
  const padding = 24;
  const max = Math.max(1, ...points.map((p) => p.count));
  const barWidth = (width - padding * 2) / points.length;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-44" role="img" aria-label="Confirmed flight bookings per day, last 30 days">
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#232D40" strokeWidth={1} />
        {points.map((p, i) => {
          const barHeight = (p.count / max) * (height - padding * 2 - 8);
          const x = padding + i * barWidth;
          const y = height - padding - barHeight;
          const isHover = hover === i;
          return (
            <rect
              key={p.date}
              x={x + 1}
              y={y}
              width={Math.max(1, barWidth - 2)}
              height={Math.max(0, barHeight)}
              rx={2}
              fill={isHover ? '#E8A33D' : '#B9822F'}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          );
        })}
      </svg>
      {hover !== null && points[hover] && (
        <div className="absolute top-0 right-0 bg-ink-800 border border-ink-700 rounded-md px-3 py-2 text-xs text-paper-100 shadow-lg">
          <p className="font-mono">{points[hover].date}</p>
          <p>{points[hover].count} booking{points[hover].count === 1 ? '' : 's'}</p>
          <p className="text-paper-500">{formatMoney(points[hover].revenue)}</p>
        </div>
      )}
      <div className="flex justify-between text-xs text-paper-500 mt-1 font-mono">
        <span>{points[0]?.date}</span>
        <span>{points[points.length - 1]?.date}</span>
      </div>
    </div>
  );
}

function ChannelBars({ rows }: { rows: RevenueByChannelRow[] }) {
  const total = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.channel} className="flex items-center gap-3 text-sm">
          <span className="w-24 shrink-0 text-paper-300">{r.channel}</span>
          <div className="flex-1 h-3 rounded-full bg-ink-800 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(r.count / total) * 100}%`, backgroundColor: CHANNEL_COLOR[r.channel] ?? '#8993A8' }} />
          </div>
          <span className="font-mono text-paper-100 w-12 text-right">{r.count}</span>
        </div>
      ))}
      {rows.length === 0 && <p className="text-sm text-paper-500">No confirmed bookings yet.</p>}
    </div>
  );
}

function RouteBars({ rows }: { rows: TopRouteRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.route} className="flex items-center gap-3 text-sm">
          <span className="w-20 shrink-0 font-mono text-paper-300">{r.route}</span>
          <div className="flex-1 h-2.5 rounded-full bg-ink-800 overflow-hidden">
            <div className="h-full rounded-full bg-signal" style={{ width: `${(r.count / max) * 100}%` }} />
          </div>
          <span className="font-mono text-paper-100 w-8 text-right">{r.count}</span>
        </div>
      ))}
      {rows.length === 0 && <p className="text-sm text-paper-500">No confirmed itineraries yet.</p>}
    </div>
  );
}

const SUPPLIER_STATUS_COLOR: Record<string, string> = {
  ONLINE: '#3FB68B',
  DEGRADED: '#E8A33D',
  TIMEOUT: '#E8A33D',
  OFFLINE: '#E15B5B',
  UNKNOWN: '#8993A8',
};

export default function AnalyticsPage() {
  const { accessToken } = useAuth();
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [timeseries, setTimeseries] = useState<BookingsTimeseriesPoint[] | null>(null);
  const [byChannel, setByChannel] = useState<RevenueByChannelRow[] | null>(null);
  const [topRoutes, setTopRoutes] = useState<TopRouteRow[] | null>(null);
  const [supplierHealth, setSupplierHealth] = useState<SupplierHealthRow[] | null>(null);
  const [policyStats, setPolicyStats] = useState<CorporatePolicyStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    Promise.all([
      apiClient.getAnalyticsOverview(accessToken),
      apiClient.getBookingsTimeseries(accessToken, 30),
      apiClient.getRevenueByChannel(accessToken),
      apiClient.getTopRoutes(accessToken, 8),
      apiClient.getSupplierHealthAnalytics(accessToken),
      apiClient.getCorporatePolicyStats(accessToken),
    ])
      .then(([ov, ts, ch, routes, health, policy]) => {
        setOverview(ov);
        setTimeseries(ts);
        setByChannel(ch);
        setTopRoutes(routes);
        setSupplierHealth(health);
        setPolicyStats(policy);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load analytics.'));
  }, [accessToken]);

  return (
    <AdminShell>
      <h2 className="text-lg font-semibold text-paper-100 mb-1">Analytics</h2>
      <p className="text-sm text-paper-500 mb-6">
        Read-only rollups over what every other module already writes — bookings, wallets, supplier health, and the corporate
        travel policy engine's decisions. Aggregated over the platform&apos;s current (mock) data volume; see the API for scope notes.
      </p>

      {error && <p className="text-sm text-danger mb-4">{error}</p>}
      {!error && !overview && <p className="text-sm text-paper-500">Loading…</p>}

      {overview && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {Object.entries(overview.grossRevenueByCurrency).map(([currency, amount]) => (
              <StatTile key={currency} label={`Gross revenue (${currency})`} value={formatMoney(amount, currency)} sub="Flights + hotels, confirmed+" />
            ))}
            {Object.keys(overview.grossRevenueByCurrency).length === 0 && <StatTile label="Gross revenue" value="—" sub="No settled bookings yet" />}
            {overview.grossRevenueConvertedTotal && (
              <StatTile
                label={`Gross revenue, converted (${overview.grossRevenueConvertedTotal.baseCurrency})`}
                value={formatMoney(overview.grossRevenueConvertedTotal.amount, overview.grossRevenueConvertedTotal.baseCurrency)}
                sub={
                  overview.grossRevenueConvertedTotal.unconvertedCurrencies.length > 0
                    ? `Excludes ${overview.grossRevenueConvertedTotal.unconvertedCurrencies.join(', ')} — no FX rate configured`
                    : 'All currencies converted'
                }
              />
            )}
            <StatTile
              label="B2B agencies"
              value={String(overview.agencies.active)}
              sub={`${overview.agencies.pendingApproval} pending · ${overview.agencies.suspended} suspended`}
            />
            <StatTile label="Corporate accounts" value={String(overview.corporatesCount)} />
            {Object.entries(overview.walletBalanceByCurrency).map(([currency, amount]) => (
              <StatTile key={currency} label={`Wallet balances (${currency})`} value={formatMoney(amount, currency)} sub="All agencies, this currency" />
            ))}
            {Object.keys(overview.walletBalanceByCurrency).length === 0 && <StatTile label="Wallet balances" value="—" sub="No agency wallets yet" />}
            {overview.walletBalanceConvertedTotal && (
              <StatTile
                label={`Wallet balances, converted (${overview.walletBalanceConvertedTotal.baseCurrency})`}
                value={formatMoney(overview.walletBalanceConvertedTotal.amount, overview.walletBalanceConvertedTotal.baseCurrency)}
                sub={
                  overview.walletBalanceConvertedTotal.unconvertedCurrencies.length > 0
                    ? `Excludes ${overview.walletBalanceConvertedTotal.unconvertedCurrencies.join(', ')} — no FX rate configured`
                    : 'All currencies converted'
                }
              />
            )}
            <StatTile label="Hotel properties seeded" value={String(overview.hotelPropertiesCount)} />
            <StatTile label="Packages booked" value={String(overview.packagesCount)} />
          </div>

          <div className="grid lg:grid-cols-2 gap-6 mb-8">
            <section className="border border-ink-700 rounded-lg p-5 bg-ink-900">
              <h3 className="text-sm text-paper-100 font-medium mb-4">Confirmed flight bookings — last 30 days</h3>
              {timeseries && <BookingsBarChart points={timeseries} />}
            </section>

            <section className="border border-ink-700 rounded-lg p-5 bg-ink-900">
              <h3 className="text-sm text-paper-100 font-medium mb-4">Confirmed bookings by channel</h3>
              {byChannel && <ChannelBars rows={byChannel} />}
            </section>

            <section className="border border-ink-700 rounded-lg p-5 bg-ink-900">
              <h3 className="text-sm text-paper-100 font-medium mb-4">Flight booking status</h3>
              <StatusList rows={overview.flightBookings} />
            </section>

            <section className="border border-ink-700 rounded-lg p-5 bg-ink-900">
              <h3 className="text-sm text-paper-100 font-medium mb-4">Hotel booking status</h3>
              <StatusList rows={overview.hotelBookings} />
            </section>

            <section className="border border-ink-700 rounded-lg p-5 bg-ink-900">
              <h3 className="text-sm text-paper-100 font-medium mb-4">Visa applications</h3>
              <StatusList rows={overview.visaApplications} />
            </section>

            <section className="border border-ink-700 rounded-lg p-5 bg-ink-900">
              <h3 className="text-sm text-paper-100 font-medium mb-4">Top routes (confirmed+, recent)</h3>
              {topRoutes && <RouteBars rows={topRoutes} />}
            </section>

            <section className="border border-ink-700 rounded-lg p-5 bg-ink-900">
              <h3 className="text-sm text-paper-100 font-medium mb-4">Supplier health</h3>
              <div className="space-y-2">
                {supplierHealth?.map((s) => (
                  <div key={s.supplierCode} className="flex items-center gap-3 text-sm">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: SUPPLIER_STATUS_COLOR[s.status] ?? '#8993A8' }} aria-hidden />
                    <span className="text-paper-300 flex-1 truncate">{s.supplierName}</span>
                    <span className="text-xs text-paper-500 font-mono">{s.status}{s.avgResponseMs ? ` · ${s.avgResponseMs}ms` : ''}</span>
                  </div>
                ))}
                {supplierHealth?.length === 0 && <p className="text-sm text-paper-500">No search traffic recorded yet.</p>}
              </div>
            </section>

            <section className="border border-ink-700 rounded-lg p-5 bg-ink-900">
              <h3 className="text-sm text-paper-100 font-medium mb-4">Corporate travel policy — auto vs. human</h3>
              {policyStats && policyStats.total > 0 ? (
                <div className="space-y-3">
                  <div className="flex h-3 rounded-full overflow-hidden bg-ink-800">
                    <div className="h-full bg-ok" style={{ width: `${(policyStats.autoApprovedByPolicy / policyStats.total) * 100}%` }} />
                    <div className="h-full bg-signal" style={{ width: `${(policyStats.decidedByHuman / policyStats.total) * 100}%` }} />
                  </div>
                  <div className="flex justify-between text-xs text-paper-500">
                    <span><span className="inline-block h-2 w-2 rounded-full bg-ok mr-1.5" />Auto-approved by policy: {policyStats.autoApprovedByPolicy}</span>
                    <span><span className="inline-block h-2 w-2 rounded-full bg-signal mr-1.5" />Needed a human: {policyStats.decidedByHuman}</span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-paper-500">No corporate bookings yet.</p>
              )}
            </section>
          </div>
        </>
      )}
    </AdminShell>
  );
}
