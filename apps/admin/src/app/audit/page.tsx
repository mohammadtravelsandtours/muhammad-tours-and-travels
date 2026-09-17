'use client';

import { useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { useAuth } from '@/lib/auth-context';
import { apiClient, ApiError, AuditEntryRow } from '@/lib/api-client';

// Matches the resource strings AuditService.record() is actually
// called with across the codebase (grep `resource: '` under
// apps/api/src/modules if this list ever needs to be re-derived) —
// 'wallet' is the one financial resource, redacted server-side for
// anyone without audit:read:financial regardless of what's picked here.
const RESOURCES = ['booking', 'corporate_approval', 'markup_rule', 'supplier', 'user', 'role', 'wallet'];

function formatJson(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function AuditLogPage() {
  const { accessToken } = useAuth();
  const [resource, setResource] = useState('');
  const [action, setAction] = useState('');
  const [entries, setEntries] = useState<AuditEntryRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  function load(reset: boolean) {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    apiClient
      .listAuditLog(accessToken, {
        resource: resource || undefined,
        action: action || undefined,
        cursor: reset ? undefined : (nextCursor ?? undefined),
        take: 25,
      })
      .then((r) => {
        setEntries((prev) => (reset ? r.entries : [...prev, ...r.entries]));
        setNextCursor(r.nextCursor);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load the audit log.'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, resource, action]);

  return (
    <AdminShell>
      <h2 className="text-lg font-semibold text-paper-100 mb-1">Audit log</h2>
      <p className="text-sm text-paper-500 mb-6">
        Every administrative write in the platform — wallet adjustments, role/permission changes, supplier and
        markup edits, corporate approval decisions — lands here, never updated or deleted after the fact. Rows for
        a financial resource (wallet) only appear for accounts with the separate audit:read:financial permission,
        which is why some accounts see fewer rows here than others.
      </p>

      <div className="flex flex-wrap gap-3 mb-4 text-sm">
        <select
          value={resource}
          onChange={(e) => setResource(e.target.value)}
          className="rounded-md bg-ink-900 border border-ink-700 text-paper-100 px-3 py-1.5"
        >
          <option value="">All resources</option>
          {RESOURCES.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <input
          value={action}
          onChange={(e) => setAction(e.target.value)}
          placeholder="Filter by action (e.g. WALLET_ADJUSTED)"
          className="rounded-md bg-ink-900 border border-ink-700 text-paper-100 px-3 py-1.5 placeholder:text-paper-500 flex-1 min-w-[220px]"
        />
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      {!error && entries.length === 0 && !loading && (
        <p className="text-sm text-paper-500">No matching audit entries.</p>
      )}

      <div className="border border-ink-700 rounded-lg divide-y divide-ink-700">
        {entries.map((e) => {
          const oldJson = formatJson(e.oldValue);
          const newJson = formatJson(e.newValue);
          const hasDetail = oldJson || newJson;
          return (
            <div key={e.id} className="px-4 py-3">
              <div
                className={`flex items-center justify-between gap-4 ${hasDetail ? 'cursor-pointer' : ''}`}
                onClick={() => hasDetail && setExpanded(expanded === e.id ? null : e.id)}
              >
                <div>
                  <p className="text-paper-100 font-mono text-sm">{e.action}</p>
                  <p className="text-xs text-paper-500">
                    {e.resource}
                    {e.resourceId ? ` · ${e.resourceId}` : ''} · {e.user ? `${e.user.fullName} (${e.user.email})` : 'system'}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-paper-500">{new Date(e.createdAt).toLocaleString()}</p>
                  {hasDetail && <p className="text-xs text-signal">{expanded === e.id ? 'hide detail' : 'show detail'}</p>}
                </div>
              </div>
              {expanded === e.id && hasDetail && (
                <div className="mt-3 grid sm:grid-cols-2 gap-3 text-xs">
                  {oldJson && (
                    <div>
                      <p className="text-paper-500 mb-1">Before</p>
                      <pre className="bg-ink-950 border border-ink-700 rounded-md p-2 overflow-x-auto text-paper-300">{oldJson}</pre>
                    </div>
                  )}
                  {newJson && (
                    <div>
                      <p className="text-paper-500 mb-1">After</p>
                      <pre className="bg-ink-950 border border-ink-700 rounded-md p-2 overflow-x-auto text-paper-300">{newJson}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {nextCursor && (
        <button
          disabled={loading}
          onClick={() => load(false)}
          className="mt-4 text-sm text-signal disabled:opacity-60"
        >
          {loading ? 'Loading…' : 'Load more'}
        </button>
      )}
    </AdminShell>
  );
}
