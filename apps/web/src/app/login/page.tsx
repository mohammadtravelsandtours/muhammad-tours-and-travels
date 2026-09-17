'use client';

import { FormEvent, ReactNode, Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiClient, ApiError, TwoFactorChallenge } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';

export default function LoginPage() {
  return <Suspense fallback={<div className="min-h-screen bg-slate-50" />}><LoginForm /></Suspense>;
}

function LoginForm() {
  const { setSession } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorToken, setTwoFactorToken] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (twoFactorToken) {
        const session = await apiClient.verifyTwoFactor(twoFactorToken, code.replace(/\s/g, ''));
        setSession(session);
        finishLogin();
        return;
      }

      const session = await apiClient.login(email.trim(), password);
      if (isTwoFactorChallenge(session)) {
        setTwoFactorToken(session.twoFactorToken);
        return;
      }
      setSession(session);
      finishLogin();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in. Check your details and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function finishLogin() {
    const next = searchParams.get('next');
    router.push(next && next.startsWith('/') ? next : '/account');
  }

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-12 sm:py-20">
      <div className="mx-auto grid max-w-5xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl lg:grid-cols-[1fr_.9fr]">
        <div className="hidden bg-dusk-900 p-10 text-white lg:block">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-400">Muhammad Tours and Travels</p>
          <h1 className="mt-8 font-display text-4xl leading-tight">Travel management that keeps your journey together.</h1>
          <p className="mt-5 text-sm leading-7 text-white/65">Access your trips, bookings, visa applications, Hajj & Umrah reservations and account settings.</p>
          <div className="mt-10 space-y-3 text-sm text-white/80">
            <p>✓ Secure account authentication</p>
            <p>✓ Protected booking history</p>
            <p>✓ Two-factor authentication when enabled</p>
          </div>
        </div>

        <div className="p-7 sm:p-10">
          <Link href="/" className="text-sm font-semibold text-orange-600">← Back to website</Link>
          <h2 className="mt-8 font-display text-3xl text-dusk-900">{twoFactorToken ? 'Verify your sign-in' : 'Welcome back'}</h2>
          <p className="mt-2 text-sm leading-6 text-dusk-500">
            {twoFactorToken ? 'Enter the 6-digit code from your authenticator app, or use an unused backup code.' : 'Sign in to manage your travel and bookings.'}
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5" noValidate>
            {!twoFactorToken ? (
              <>
                <Field label="Email" htmlFor="email">
                  <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input-pro" />
                </Field>
                <Field label="Password" htmlFor="password" action={<Link href="/forgot-password" className="text-xs font-semibold text-orange-600">Forgot password?</Link>}>
                  <input id="password" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="input-pro" />
                </Field>
              </>
            ) : (
              <Field label="Authentication code" htmlFor="code">
                <input id="code" inputMode="numeric" autoComplete="one-time-code" autoFocus required minLength={6} maxLength={12} value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" className="input-pro text-center tracking-[0.35em]" />
              </Field>
            )}

            {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

            <button type="submit" disabled={submitting} className="w-full rounded-xl bg-dusk-900 py-3.5 text-sm font-bold text-white hover:bg-dusk-700 disabled:opacity-60">
              {submitting ? 'Please wait…' : twoFactorToken ? 'Verify and continue' : 'Sign in'}
            </button>

            {twoFactorToken && (
              <button type="button" onClick={() => { setTwoFactorToken(null); setCode(''); setError(null); }} className="w-full text-sm font-semibold text-dusk-500 hover:text-dusk-900">
                Start over
              </button>
            )}
          </form>

          {!twoFactorToken && (
            <p className="mt-7 text-sm text-dusk-500">New here? <Link href="/register" className="font-semibold text-orange-600">Create an account</Link></p>
          )}
        </div>
      </div>
    </main>
  );
}

function isTwoFactorChallenge(value: Awaited<ReturnType<typeof apiClient.login>>): value is TwoFactorChallenge {
  return 'twoFactorRequired' in value && value.twoFactorRequired === true;
}

function Field({ label, htmlFor, action, children }: { label: string; htmlFor: string; action?: ReactNode; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block">
      <span className="mb-2 flex items-center justify-between text-sm font-semibold text-dusk-700"><span>{label}</span>{action}</span>
      {children}
    </label>
  );
}
