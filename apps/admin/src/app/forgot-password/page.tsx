'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { apiClient, ApiError } from '@/lib/api-client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiClient.requestPasswordReset(email);
      // Always shows the same confirmation, whether or not the address
      // is registered — the API itself never reveals that either (see
      // AuthService.requestPasswordReset), so surfacing a different
      // message here would defeat the point.
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-10">
          <div className="h-2 w-10 bg-signal rounded-full mb-6" aria-hidden />
          <h1 className="text-2xl font-semibold text-paper-100">Reset your password</h1>
          <p className="mt-2 text-sm text-paper-500">
            Enter your work email and we&apos;ll send a reset link if an account matches.
          </p>
        </div>

        {submitted ? (
          <div className="space-y-4">
            <p className="text-sm text-paper-300 bg-ink-900 border border-ink-700 rounded-md p-4">
              If an account exists for <span className="text-paper-100">{email}</span>, a reset link is on its way.
              The link expires in 30 minutes.
            </p>
            <Link href="/login" className="block text-center text-sm text-signal hover:text-signal-dim">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label htmlFor="email" className="block text-sm text-paper-300 mb-1.5">
                Work email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md bg-ink-800 border border-ink-700 px-3 py-2.5 text-paper-100 placeholder:text-paper-500/60 focus:border-signal focus:ring-0"
                placeholder="you@mohammadtravels.example"
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
              {submitting ? 'Sending…' : 'Send reset link'}
            </button>
            <Link href="/login" className="block text-center text-sm text-paper-500 hover:text-paper-100">
              Back to sign in
            </Link>
          </form>
        )}
      </div>
    </main>
  );
}
