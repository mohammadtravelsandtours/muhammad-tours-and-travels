'use client';

import { FormEvent, Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiClient, ApiError } from '@/lib/api-client';

export default function ResetPasswordPage() {
  // useSearchParams needs a Suspense boundary in the app router — see
  // login/register pages elsewhere in this codebase for the same pattern.
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 10) {
      setError('Password must be at least 10 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.confirmPasswordReset(token, newPassword);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reset your password. The link may have expired.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-10">
          <div className="h-2 w-10 bg-signal rounded-full mb-6" aria-hidden />
          <h1 className="text-2xl font-semibold text-paper-100">Set a new password</h1>
        </div>

        {!token && (
          <p role="alert" className="text-sm text-danger">
            This link is missing its reset token. Please use the link from your email, or request a new one.
          </p>
        )}

        {token && done ? (
          <div className="space-y-4">
            <p className="text-sm text-paper-300 bg-ink-900 border border-ink-700 rounded-md p-4">
              Your password has been updated. Every existing session has been signed out — sign in again with your new password.
            </p>
            <Link href="/login" className="block text-center text-sm text-signal hover:text-signal-dim">
              Go to sign in
            </Link>
          </div>
        ) : token ? (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label htmlFor="newPassword" className="block text-sm text-paper-300 mb-1.5">
                New password
              </label>
              <input
                id="newPassword"
                type="password"
                required
                minLength={10}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-md bg-ink-800 border border-ink-700 px-3 py-2.5 text-paper-100 focus:border-signal focus:ring-0"
              />
              <p className="mt-1 text-xs text-paper-500">At least 10 characters.</p>
            </div>
            <div>
              <label htmlFor="confirmPassword" className="block text-sm text-paper-300 mb-1.5">
                Confirm new password
              </label>
              <input
                id="confirmPassword"
                type="password"
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-md bg-ink-800 border border-ink-700 px-3 py-2.5 text-paper-100 focus:border-signal focus:ring-0"
              />
            </div>

            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-signal text-ink-950 font-medium py-2.5 hover:bg-signal-dim transition-colors disabled:opacity-60"
            >
              {submitting ? 'Saving…' : 'Save new password'}
            </button>
          </form>
        ) : (
          <Link href="/forgot-password" className="block text-center text-sm text-signal hover:text-signal-dim">
            Request a new reset link
          </Link>
        )}
      </div>
    </main>
  );
}
