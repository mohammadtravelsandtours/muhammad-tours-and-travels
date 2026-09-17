'use client';
import { FormEvent, useState } from 'react';
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
        // No corporate account can enable 2FA today (that setup UI only
        // exists in the admin app) — handled defensively so this never
        // crashes.
        throw new ApiError('This account requires two-factor authentication, which isn’t supported here yet. Please contact support.', 400);
      }
      if (!session.user.roles.some((r) => r.startsWith('CORPORATE_'))) {
        throw new ApiError('This account is not linked to a corporate travel program.', 403);
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
        <h1 className="text-2xl font-semibold text-graphite-900">Corporate sign in</h1>
        <p className="mt-2 text-sm text-graphite-500">
          Accounts are set up by your travel manager or Muhammad Tours and Travels
          admin — there's no self-registration here by design.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4" noValidate>
          <div>
            <label htmlFor="email" className="block text-sm text-graphite-700 mb-1.5">Work email</label>
            <input id="email" type="email" required autoComplete="email" value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-line px-3 py-2.5 focus:border-indigo focus:ring-0" />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm text-graphite-700 mb-1.5">Password</label>
            <input id="password" type="password" required autoComplete="current-password" value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-line px-3 py-2.5 focus:border-indigo focus:ring-0" />
          </div>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={submitting}
            className="w-full rounded-md bg-indigo text-white font-medium py-2.5 hover:bg-indigo-dim disabled:opacity-60">
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </main>
  );
}
