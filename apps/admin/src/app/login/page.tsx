'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';

export default function LoginPage() {
  const { login, completeTwoFactorLogin } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Set once beginLogin() reports the account has 2FA enabled — switches
  // the form to a code-entry step instead of issuing a second request
  // with email/password again.
  const [twoFactorToken, setTwoFactorToken] = useState<string | null>(null);
  const [code, setCode] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await login(email, password);
      if (result && 'twoFactorRequired' in result) {
        setTwoFactorToken(result.twoFactorToken);
      } else {
        router.push('/dashboard');
      }
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : 'Could not sign in. Check your details and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerifyCode(e: FormEvent) {
    e.preventDefault();
    if (!twoFactorToken) return;
    setError(null);
    setSubmitting(true);
    try {
      await completeTwoFactorLogin(twoFactorToken, code);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : 'Incorrect code. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-10">
          <div className="h-2 w-10 bg-signal rounded-full mb-6" aria-hidden />
          <h1 className="text-2xl font-semibold text-paper-100">Operations console</h1>
          <p className="mt-2 text-sm text-paper-500">Muhammad Tours and Travels — internal access only</p>
        </div>

        {twoFactorToken ? (
          <form onSubmit={handleVerifyCode} className="space-y-4" noValidate>
            <div>
              <label htmlFor="code" className="block text-sm text-paper-300 mb-1.5">
                Authentication code
              </label>
              <input
                id="code"
                inputMode="text"
                autoComplete="one-time-code"
                autoFocus
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full rounded-md bg-ink-800 border border-ink-700 px-3 py-2.5 text-paper-100 tracking-widest placeholder:text-paper-500/60 placeholder:tracking-normal focus:border-signal focus:ring-0"
                placeholder="6-digit code, or a backup code"
              />
              <p className="mt-1.5 text-xs text-paper-500">
                Open your authenticator app, or use one of your saved backup codes.
              </p>
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
              {submitting ? 'Verifying…' : 'Verify and sign in'}
            </button>
            <button
              type="button"
              onClick={() => {
                setTwoFactorToken(null);
                setCode('');
                setError(null);
              }}
              className="w-full text-sm text-paper-500 hover:text-paper-100"
            >
              Back to sign in
            </button>
          </form>
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

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="password" className="block text-sm text-paper-300">
                  Password
                </label>
                <Link href="/forgot-password" className="text-xs text-signal hover:text-signal-dim">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-md bg-ink-800 border border-ink-700 px-3 py-2.5 pr-16 text-paper-100 focus:border-signal focus:ring-0"
                  placeholder="••••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-paper-500 hover:text-paper-100 px-1.5 py-1"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
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
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
