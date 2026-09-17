'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { useAuth } from '@/lib/auth-context';
import { apiClient, ApiError, AdminUserRow, PermissionRow, RoleRow } from '@/lib/api-client';

export default function RbacPage() {
  const { accessToken } = useAuth();
  const [roles, setRoles] = useState<RoleRow[] | null>(null);
  const [permissions, setPermissions] = useState<PermissionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  function loadRbac() {
    if (!accessToken) return;
    Promise.all([apiClient.listRoles(accessToken), apiClient.listPermissions(accessToken)])
      .then(([r, p]) => {
        setRoles(r);
        setPermissions(p);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load roles and permissions.'));
  }

  useEffect(loadRbac, [accessToken]);

  const grantedByRole = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const role of roles ?? []) {
      map.set(role.id, new Set(role.permissions.map((p) => p.permission.id)));
    }
    return map;
  }, [roles]);

  async function toggle(role: RoleRow, permission: PermissionRow, granted: boolean) {
    if (!accessToken) return;
    const key = `${role.id}:${permission.id}`;
    setBusyKey(key);
    setError(null);
    try {
      if (granted) await apiClient.revokePermission(accessToken, role.id, permission.id);
      else await apiClient.grantPermission(accessToken, role.id, permission.id);
      loadRbac();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update that permission.');
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <AdminShell>
      <h2 className="text-lg font-semibold text-paper-100 mb-1">Roles & access</h2>
      <p className="text-sm text-paper-500 mb-6">
        Changes here take effect the next time an affected user signs in or refreshes their session — permissions
        are resolved into the access token at login, not re-checked against this table on every request.
      </p>

      {error && <p className="text-sm text-danger mb-4">{error}</p>}

      <section aria-labelledby="matrix-heading" className="mb-10">
        <h3 id="matrix-heading" className="text-sm font-medium text-paper-300 mb-3">Permission matrix</h3>
        {!roles || !permissions ? (
          <p className="text-sm text-paper-500">Loading…</p>
        ) : (
          <div className="overflow-x-auto border border-ink-700 rounded-lg">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b border-ink-700">
                  <th className="text-left px-3 py-2 text-paper-500 font-medium sticky left-0 bg-ink-950">Permission</th>
                  {roles.map((role) => (
                    <th key={role.id} className="px-3 py-2 text-paper-300 font-medium whitespace-nowrap">{role.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {permissions.map((permission) => (
                  <tr key={permission.id} className="border-b border-ink-700 last:border-b-0">
                    <td className="px-3 py-2 text-paper-100 font-mono sticky left-0 bg-ink-950 whitespace-nowrap">{permission.name}</td>
                    {roles.map((role) => {
                      const granted = grantedByRole.get(role.id)?.has(permission.id) ?? false;
                      const isSuperAdmin = role.name === 'SUPER_ADMIN';
                      const key = `${role.id}:${permission.id}`;
                      return (
                        <td key={role.id} className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={isSuperAdmin ? true : granted}
                            disabled={isSuperAdmin || busyKey === key}
                            onChange={() => toggle(role, permission, granted)}
                            title={isSuperAdmin ? 'SUPER_ADMIN always holds every permission' : undefined}
                            className="accent-signal"
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <UserRoleAssignment accessToken={accessToken} roles={roles} />
    </AdminShell>
  );
}

function UserRoleAssignment({ accessToken, roles }: { accessToken: string | null; roles: RoleRow[] | null }) {
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [pickedRole, setPickedRole] = useState<Record<string, string>>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function load() {
    if (!accessToken) return;
    apiClient
      .searchUsers(accessToken, search || undefined)
      .then((r) => setUsers(r.users))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not search users.'));
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(load, 250);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, search]);

  async function assign(userId: string) {
    const roleName = pickedRole[userId];
    if (!accessToken || !roleName) return;
    setBusyUserId(userId);
    setError(null);
    try {
      await apiClient.assignUserRole(accessToken, userId, roleName);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not assign that role.');
    } finally {
      setBusyUserId(null);
    }
  }

  async function revoke(userId: string, roleName: string) {
    if (!accessToken) return;
    setBusyUserId(userId);
    setError(null);
    try {
      await apiClient.revokeUserRole(accessToken, userId, roleName);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove that role.');
    } finally {
      setBusyUserId(null);
    }
  }

  return (
    <section aria-labelledby="users-heading">
      <h3 id="users-heading" className="text-sm font-medium text-paper-300 mb-3">Assign roles to a user</h3>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name or email…"
        className="w-full max-w-sm rounded-md bg-ink-900 border border-ink-700 text-paper-100 px-3 py-2 text-sm placeholder:text-paper-500 mb-4"
      />

      {error && <p className="text-sm text-danger mb-3">{error}</p>}
      {users?.length === 0 && <p className="text-sm text-paper-500">No matching users.</p>}

      <div className="border border-ink-700 rounded-lg divide-y divide-ink-700">
        {users?.map((u) => {
          const currentRoleNames = new Set(u.roles.map((r) => r.role.name));
          const available = (roles ?? []).filter((r) => !currentRoleNames.has(r.name));
          return (
            <div key={u.id} className="px-4 py-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-paper-100">{u.fullName}</p>
                  <p className="text-xs text-paper-500">{u.email}{!u.isActive ? ' · inactive' : ''}</p>
                </div>
                {available.length > 0 && (
                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      value={pickedRole[u.id] ?? ''}
                      onChange={(e) => setPickedRole((prev) => ({ ...prev, [u.id]: e.target.value }))}
                      className="rounded-md bg-ink-900 border border-ink-700 text-paper-100 text-xs px-2 py-1.5"
                    >
                      <option value="">Add role…</option>
                      {available.map((r) => (
                        <option key={r.id} value={r.name}>{r.name}</option>
                      ))}
                    </select>
                    <button
                      disabled={!pickedRole[u.id] || busyUserId === u.id}
                      onClick={() => assign(u.id)}
                      className="text-xs rounded-md bg-signal/20 text-signal px-3 py-1.5 disabled:opacity-50"
                    >
                      Add
                    </button>
                  </div>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {u.roles.map((r) => (
                  <span key={r.role.id} className="inline-flex items-center gap-1.5 text-xs font-mono rounded-full bg-ink-800 text-paper-300 px-2.5 py-1">
                    {r.role.name}
                    <button
                      disabled={busyUserId === u.id}
                      onClick={() => revoke(u.id, r.role.name)}
                      className="text-paper-500 hover:text-danger disabled:opacity-50"
                      aria-label={`Remove ${r.role.name}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
