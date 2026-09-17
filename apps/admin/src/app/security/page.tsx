'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { useAuth } from '@/lib/auth-context';
import { apiClient, ApiError, SessionRow, TwoFactorSetup } from '@/lib/api-client';

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}

export default function SecurityPage() {
  const { user, accessToken } = useAuth();

  return (
    <AdminShell>
      <h2 className="text-lg font-semibold text-paper-100 mb-1">Security</h2>
      <p className="text-sm text-paper-500 mb-6">
        Manage two-factor authentication and see everywhere {user?.fullName ?? 'your account'} is currently signed in.
      </p>

      <div className="grid lg:grid-cols-2 gap-6">
        <TwoFactorCard accessToken={accessToken} />
        <SessionsCard accessToken={accessToken} />
      </div>
    </AdminShell>
  );
}

function TwoFactorCard({ accessToken }: { accessToken: string | null }) {
  // There is no server-side "is 2FA enabled" flag surfaced to the client
  // outside of login (see docs/ROADMAP.md's Phase 14 entry for why) — this
  // card tracks its own state for the current browser session instead:
  // 'unknown' until the operator interacts with it, then whichever step
  // they're in. A returning operator with 2FA already enabled just sees
  // the default "set it up" state again here (harmless — enabling again
  // simply replaces the pending secret until confirmed), so the copy
  // below is worded to not assume either way.
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [confirmCode, setConfirmCode] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [showDisable, setShowDisable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function startSetup() {
    if (!accessToken) return;
    setError(null);
    setBusy(true);
    try {
      const result = await apiClient.enableTwoFactor(accessToken);
      setSetup(result);
      setConfirmed(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start 2FA setup.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmSetup(e: FormEvent) {
    e.preventDefault();
    if (!accessToken) return;
    setError(null);
    setBusy(true);
    try {
      await apiClient.confirmTwoFactor(accessToken, confirmCode);
      setConfirmed(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Incorrect code. Check your authenticator app and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function disable(e: FormEvent) {
    e.preventDefault();
    if (!accessToken) return;
    setError(null);
    setBusy(true);
    try {
      await apiClient.disableTwoFactor(accessToken, disablePassword);
      setSetup(null);
      setConfirmed(false);
      setShowDisable(false);
      setDisablePassword('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Incorrect password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="border border-ink-700 rounded-lg p-5 bg-ink-900">
      <h3 className="text-sm text-paper-100 font-medium mb-1">Two-factor authentication</h3>
      <p className="text-xs text-paper-500 mb-4">
        Require a 6-digit code from an authenticator app (Google Authenticator, Authy, 1Password, etc.) at sign-in, on top of your password.
      </p>

      {error && <p role="alert" className="text-sm text-danger mb-3">{error}</p>}

      {confirmed ? (
        <p className="text-sm text-ok">Two-factor authentication is enabled. It will be required on your next sign-in.</p>
      ) : setup ? (
        <div className="space-y-4">
          <div className="rounded-md bg-ink-950 border border-ink-700 p-3">
            <p className="text-xs text-paper-500 mb-1">1. Add this to your authenticator app</p>
            <p className="text-xs text-paper-500 mb-2">
              This build has no QR-code image generator — enter the secret manually, or paste the URI below if your app accepts one.
            </p>
            <p className="font-mono text-sm text-paper-100 break-all">{setup.secret}</p>
            <p className="font-mono text-[11px] text-paper-500 break-all mt-2">{setup.otpauthUri}</p>
          </div>

          <div className="rounded-md bg-ink-950 border border-ink-700 p-3">
            <p className="text-xs text-paper-500 mb-1">2. Save these backup codes</p>
            <p className="text-xs text-paper-500 mb-2">
              Each works once, if you ever lose access to your authenticator app. Shown only this one time — store them somewhere safe.
            </p>
            <div className="grid grid-cols-2 gap-1.5 font-mono text-xs text-paper-100">
              {setup.backupCodes.map((c) => (
                <span key={c} className="bg-ink-900 rounded px-2 py-1">{c}</span>
              ))}
            </div>
          </div>

          <form onSubmit={confirmSetup} className="space-y-2">
            <label htmlFor="confirmCode" className="block text-xs text-paper-500">
              3. Enter the current 6-digit code to finish
            </label>
            <div className="flex gap-2">
              <input
                id="confirmCode"
                value={confirmCode}
                onChange={(e) => setConfirmCode(e.target.value)}
                className="flex-1 rounded-md bg-ink-800 border border-ink-700 px-3 py-2 text-sm text-paper-100 tracking-widest focus:border-signal focus:ring-0"
                placeholder="123456"
              />
              <button
                type="submit"
                disabled={busy}
                className="rounded-md bg-signal text-ink-950 font-medium px-4 py-2 text-sm hover:bg-signal-dim disabled:opacity-60"
              >
                Confirm
              </button>
            </div>
          </form>
        </div>
      ) : showDisable ? (
        <form onSubmit={disable} className="space-y-2">
          <label htmlFor="disablePassword" className="block text-xs text-paper-500">
            Enter your password to turn off two-factor authentication
          </label>
          <div className="flex gap-2">
            <input
              id="disablePassword"
              type="password"
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
              className="flex-1 rounded-md bg-ink-800 border border-ink-700 px-3 py-2 text-sm text-paper-100 focus:border-signal focus:ring-0"
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded-md border border-danger/40 text-danger font-medium px-4 py-2 text-sm hover:bg-danger/10 disabled:opacity-60"
            >
              Disable
            </button>
          </div>
          <button type="button" onClick={() => setShowDisable(false)} className="text-xs text-paper-500 hover:text-paper-100">
            Cancel
          </button>
        </form>
      ) : (
        <div className="flex flex-wrap gap-3">
          <button
            onClick={startSetup}
            disabled={busy}
            className="rounded-md bg-signal text-ink-950 font-medium px-4 py-2 text-sm hover:bg-signal-dim disabled:opacity-60"
          >
            {busy ? 'Starting…' : 'Set up two-factor authentication'}
          </button>
          <button onClick={() => setShowDisable(true)} className="text-sm text-paper-500 hover:text-paper-100">
            Already enabled? Turn it off
          </button>
        </div>
      )}
    </section>
  );
}

function SessionsCard({ accessToken }: { accessToken: string | null }) {
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  function load() {
    if (!accessToken) return;
    apiClient
      .listSessions(accessToken)
      .then((r) => setSessions(r.sessions))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load active sessions.'));
  }

  useEffect(load, [accessToken]);

  async function revoke(id: string) {
    if (!accessToken) return;
    setRevokingId(id);
    try {
      await apiClient.revokeSession(accessToken, id);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign out that session.');
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <section className="border border-ink-700 rounded-lg p-5 bg-ink-900">
      <h3 className="text-sm text-paper-100 font-medium mb-1">Active sessions</h3>
      <p className="text-xs text-paper-500 mb-4">
        Every device currently signed into your account. Sign out any you don&apos;t recognize.
      </p>

      {error && <p role="alert" className="text-sm text-danger mb-3">{error}</p>}
      {!error && sessions === null && <p className="text-sm text-paper-500">Loading…</p>}
      {sessions?.length === 0 && <p className="text-sm text-paper-500">No active sessions found.</p>}

      <div className="space-y-2">
        {sessions?.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border border-ink-700 rounded-md px-3 py-2 text-sm">
            <div className="min-w-0">
              <p className="text-paper-100 truncate">{s.deviceLabel || 'Unknown device'}</p>
              <p className="text-xs text-paper-500">
                Signed in {formatDateTime(s.issuedAt)} · expires {formatDateTime(s.expiresAt)}
              </p>
            </div>
            <button
              onClick={() => revoke(s.id)}
              disabled={revokingId === s.id}
              className="text-xs text-danger hover:underline disabled:opacity-60 shrink-0"
            >
              {revokingId === s.id ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
