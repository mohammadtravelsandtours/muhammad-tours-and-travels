'use client';

import { useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { useAuth } from '@/lib/auth-context';
import { apiClient, ApiError, MarkupRuleRow } from '@/lib/api-client';

const SCOPES = ['GLOBAL', 'SUPPLIER', 'AIRLINE', 'ROUTE', 'CABIN', 'FARE_FAMILY', 'AGENCY'] as const;
const SCOPE_FIELD: Record<(typeof SCOPES)[number], string | null> = {
  GLOBAL: null,
  SUPPLIER: 'supplierId',
  AIRLINE: 'airlineCode',
  ROUTE: 'route',
  CABIN: 'cabin',
  FARE_FAMILY: 'fareFamily',
  AGENCY: 'agencyId',
};

export default function PricingPage() {
  const { accessToken } = useAuth();
  const [rules, setRules] = useState<MarkupRuleRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [scope, setScope] = useState<(typeof SCOPES)[number]>('GLOBAL');
  const [matchValue, setMatchValue] = useState('');
  const [type, setType] = useState<'FIXED' | 'PERCENTAGE'>('PERCENTAGE');
  const [value, setValue] = useState('');
  const [priority, setPriority] = useState('100');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function load() {
    if (!accessToken) return;
    apiClient
      .listMarkupRules(accessToken)
      .then((r) => setRules(r.rules))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load markup rules.'));
  }

  useEffect(load, [accessToken]);

  async function createRule() {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      setFormError('Enter a numeric value.');
      return;
    }
    const field = SCOPE_FIELD[scope];
    if (field && !matchValue.trim()) {
      setFormError(`This scope needs a ${field} to match against.`);
      return;
    }
    setFormError(null);
    setSubmitting(true);
    try {
      await apiClient.createMarkupRule(accessToken!, {
        scope,
        type,
        value: numericValue,
        priority: Number(priority) || 100,
        ...(field ? { [field]: matchValue.trim() } : {}),
      });
      setMatchValue('');
      setValue('');
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not create this rule.');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(rule: MarkupRuleRow) {
    await apiClient.updateMarkupRule(accessToken!, rule.id, { active: !rule.active });
    load();
  }

  return (
    <AdminShell>
      <h2 className="text-lg font-semibold text-paper-100 mb-1">Pricing & markup rules</h2>
      <p className="text-sm text-paper-500 mb-6">
        Evaluated most-specific-first (AGENCY → FARE_FAMILY → ROUTE → CABIN → AIRLINE → SUPPLIER → GLOBAL) — the first
        active match wins; rules never stack. This is the entire pricing engine's configuration — no markup is ever
        hardcoded in application code.
      </p>

      <div className="border border-ink-700 rounded-lg p-5 bg-ink-900 mb-6">
        <p className="text-xs text-paper-500 mb-2">New rule</p>
        <div className="grid sm:grid-cols-5 gap-2 text-sm">
          <select value={scope} onChange={(e) => setScope(e.target.value as typeof scope)} className="bg-ink-800 border border-ink-700 rounded-md px-2 py-2 text-paper-100">
            {SCOPES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          {SCOPE_FIELD[scope] && (
            <input
              value={matchValue}
              onChange={(e) => setMatchValue(e.target.value)}
              placeholder={SCOPE_FIELD[scope] ?? ''}
              className="bg-ink-800 border border-ink-700 rounded-md px-2 py-2 text-paper-100"
            />
          )}
          <select value={type} onChange={(e) => setType(e.target.value as typeof type)} className="bg-ink-800 border border-ink-700 rounded-md px-2 py-2 text-paper-100">
            <option value="PERCENTAGE">Percentage</option>
            <option value="FIXED">Fixed</option>
          </select>
          <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={type === 'PERCENTAGE' ? 'e.g. 5 (%)' : 'e.g. 12.50'} className="bg-ink-800 border border-ink-700 rounded-md px-2 py-2 text-paper-100" />
          <input value={priority} onChange={(e) => setPriority(e.target.value)} placeholder="Priority" className="bg-ink-800 border border-ink-700 rounded-md px-2 py-2 text-paper-100" />
        </div>
        {formError && <p className="mt-2 text-xs text-danger">{formError}</p>}
        <button onClick={createRule} disabled={submitting} className="mt-3 rounded-md bg-signal text-ink-950 font-medium px-4 py-2 text-sm hover:bg-signal-dim disabled:opacity-60">
          {submitting ? 'Creating…' : 'Create rule'}
        </button>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      {!error && !rules && <p className="text-sm text-paper-500">Loading…</p>}

      {rules && (
        <div className="border border-ink-700 rounded-lg divide-y divide-ink-700">
          {rules.length === 0 && <p className="px-4 py-3 text-sm text-paper-500">No markup rules yet — offers fall back to each supplier's default markup, then zero.</p>}
          {rules.map((r) => (
            <div key={r.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-paper-100 text-sm">
                  {r.scope}
                  {r.route ? ` · ${r.route}` : ''}
                  {r.airlineCode ? ` · ${r.airlineCode}` : ''}
                  {r.cabin ? ` · ${r.cabin}` : ''}
                  {r.fareFamily ? ` · ${r.fareFamily}` : ''}
                  {r.supplierCode ? ` · ${r.supplierCode}` : ''}
                  {r.agencyName ? ` · ${r.agencyName}` : ''}
                </p>
                <p className="text-xs text-paper-500">
                  {r.type === 'PERCENTAGE' ? `${r.value}%` : r.value} · priority {r.priority}
                </p>
              </div>
              <button
                onClick={() => toggleActive(r)}
                className={`text-xs font-mono rounded-full px-3 py-1 ${r.active ? 'bg-ok/20 text-ok' : 'bg-ink-700 text-paper-500'}`}
              >
                {r.active ? 'ACTIVE' : 'INACTIVE'}
              </button>
            </div>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
