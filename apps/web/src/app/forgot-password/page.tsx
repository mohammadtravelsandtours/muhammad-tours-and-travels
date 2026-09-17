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
    <main className="min-h-screen flex items-center justify-center px-6 bg-ground">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-2xl text-dusk-900">Reset your password</h1>
        <p className="mt-2 text-sm text-dusk-500">
          Enter your email and we&apos;ll send a reset link if an account matches.
        </p>

        {submitted ? (
          <div className="mt-8 space-y-4">
            <p className="text-sm text-dusk-700 bg-white border border-sand rounded-md p-4">
              If an account exists for <span className="text-dusk-900">{email}</span>, a reset link is on its way.
              The link expires in 30 minutes.
            </p>
            <Link href="/login" className="block text-center text-sm text-tangerine-dim">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-4" noValidate>
            <div>
              <label htmlFor="email" className="block text-sm text-dusk-700 mb-1.5">Email</label>
              <input
                id="email" type="email" required autoComplete="email"
                value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-sand px-3 py-2.5 focus:border-tangerine focus:ring-0"
              />
            </div>
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            <button
              type="submit" disabled={submitting}
              className="w-full rounded-md bg-dusk-900 text-ground font-medium py-2.5 hover:bg-dusk-700 disabled:opacity-60"
            >
              {submitting ? 'Sending…' : 'Send reset link'}
            </button>
            <Link href="/login" className="block text-center text-sm text-dusk-500">
              Back to sign in
            </Link>
          </form>
        )}
      </div>
    </main>
  );
}
