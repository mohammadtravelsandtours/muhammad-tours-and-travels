'use client';
import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiClient, ApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';

export default function LoginPage() {
  const { setSession } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const session = await apiClient.login(email, password);
      if ('twoFactorRequired' in session) {
        // No B2B account can enable 2FA today (that setup UI only exists
        // in the admin app) — handled defensively so this never crashes.
        throw new ApiError('This account requires two-factor authentication, which isn’t supported here yet. Please contact support.', 400);
      }
      if (!session.user.roles.some((r) => r.startsWith('B2B_'))) {
        throw new ApiError('This account is not registered as a travel agent.', 403);
      }
      setSession(session);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Agent sign in</h1>
        <p className="mt-2 text-sm text-slate-500">Muhammad Tours and Travels partner portal</p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4" noValidate>
          <div>
            <label htmlFor="email" className="block text-sm text-slate-700 mb-1.5">Email</label>
            <input id="email" type="email" required autoComplete="email" value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-line px-3 py-2.5 focus:border-teal focus:ring-0" />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm text-slate-700 mb-1.5">Password</label>
            <input id="password" type="password" required autoComplete="current-password" value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-line px-3 py-2.5 focus:border-teal focus:ring-0" />
          </div>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={submitting}
            className="w-full rounded-md bg-slate-900 text-base font-medium py-2.5 hover:bg-slate-700 disabled:opacity-60">
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-sm text-slate-500">
          New agency? <Link href="/register" className="text-teal-dim">Apply for an account</Link>
        </p>
      </div>
    </main>
  );
}
