'use client';

import { useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { useAuth } from '@/lib/auth-context';
import { apiClient, ApiError, SupplierRow } from '@/lib/api-client';

const HEALTH_COLOR: Record<string, string> = {
  ONLINE: 'text-ok',
  DEGRADED: 'text-signal',
  TIMEOUT: 'text-signal',
  OFFLINE: 'text-danger',
  AUTH_ERROR: 'text-danger',
  UNKNOWN: 'text-paper-500',
};

export default function SuppliersPage() {
  const { accessToken } = useAuth();
  const [suppliers, setSuppliers] = useState<SupplierRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    if (!accessToken) return;
    apiClient
      .listSuppliers(accessToken)
      .then((r) => setSuppliers(r.suppliers))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load suppliers.'));
  }

  useEffect(load, [accessToken]);

  async function toggleActive(s: SupplierRow) {
    await apiClient.updateSupplier(accessToken!, s.id, { active: !s.active });
    load();
  }

  return (
    <AdminShell>
      <h2 className="text-lg font-semibold text-paper-100 mb-1">Suppliers</h2>
      <p className="text-sm text-paper-500 mb-6">
        Toggling a supplier here takes effect on the very next search — no redeploy needed (SupplierRegistry reads
        this table fresh every time). No credential is ever shown here; only a masked login id, if one is configured.
      </p>

      {error && <p className="text-sm text-danger">{error}</p>}
      {!error && !suppliers && <p className="text-sm text-paper-500">Loading…</p>}

      {suppliers && (
        <div className="border border-ink-700 rounded-lg divide-y divide-ink-700">
          {suppliers.map((s) => (
            <div key={s.id} className="px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-paper-100">
                    {s.name} <span className="text-paper-500 font-mono text-xs">{s.code}</span>
                  </p>
                  <p className="text-xs text-paper-500">
                    {s.type} · priority {s.priority} · {s.timeoutMs}ms timeout
                    {!s.registeredInCode && ' · not registered in this deployment'}
                    {s.credentialLoginIdMasked && ` · login ${s.credentialLoginIdMasked}`}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`text-xs font-mono ${HEALTH_COLOR[s.health?.status ?? 'UNKNOWN']}`}>
                    {s.health?.status ?? 'UNKNOWN'}
                    {s.health?.avgResponseMs ? ` · ${s.health.avgResponseMs}ms avg` : ''}
                    {s.health && s.health.consecutiveErrors > 0 ? ` · ${s.health.consecutiveErrors} consecutive errors` : ''}
                  </span>
                  <button
                    onClick={() => toggleActive(s)}
                    className={`text-xs font-mono rounded-full px-3 py-1 ${s.active ? 'bg-ok/20 text-ok' : 'bg-ink-700 text-paper-500'}`}
                  >
                    {s.active ? 'ACTIVE' : 'INACTIVE'}
                  </button>
                </div>
              </div>
              {s.health?.lastErrorMessage && (
                <p className="mt-1 text-xs text-danger">Last error: {s.health.lastErrorMessage}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
