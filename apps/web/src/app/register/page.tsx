'use client';

import { FormEvent, ReactNode, Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiClient, ApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';

export default function RegisterPage() {
  return <Suspense fallback={<div className="min-h-screen bg-slate-50" />}><RegisterForm /></Suspense>;
}

function RegisterForm() {
  const { setSession } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [form, setForm] = useState({ fullName: '', email: '', password: '', phoneNumber: '', address: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const passwordScore = [
    form.password.length >= 10,
    /[A-Z]/.test(form.password),
    /[a-z]/.test(form.password),
    /\d/.test(form.password),
    /[^A-Za-z0-9]/.test(form.password),
  ].filter(Boolean).length;

  function update(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (form.password.length < 10 || passwordScore < 4) {
      setError('Use at least 10 characters with upper/lowercase letters, a number and a symbol.');
      return;
    }
    if (!/^\+?[0-9\s().-]{7,20}$/.test(form.phoneNumber)) {
      setError('Enter a valid phone number.');
      return;
    }

    setSubmitting(true);
    try {
      const session = await apiClient.register({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        password: form.password,
        phoneNumber: form.phoneNumber.trim(),
        address: form.address.trim() || undefined,
      });
      setSession(session);
      const next = searchParams.get('next');
      router.push(next && next.startsWith('/') ? next : '/account');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create your account. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-12 sm:py-20">
      <div className="mx-auto max-w-2xl rounded-3xl border border-slate-200 bg-white p-7 shadow-xl sm:p-10">
        <Link href="/" className="text-sm font-semibold text-orange-600">← Back to website</Link>
        <h1 className="mt-8 font-display text-3xl text-dusk-900">Create your account</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-dusk-500">Create a customer account to search, book and manage your trips securely.</p>

        <form onSubmit={handleSubmit} className="mt-8 grid gap-5 sm:grid-cols-2" noValidate>
          <Field label="Full name" htmlFor="fullName">
            <input id="fullName" required autoComplete="name" value={form.fullName} onChange={(e) => update('fullName', e.target.value)} className="input-pro" />
          </Field>
          <Field label="Phone number" htmlFor="phone">
            <input id="phone" required type="tel" autoComplete="tel" placeholder="+8801XXXXXXXXX" value={form.phoneNumber} onChange={(e) => update('phoneNumber', e.target.value)} className="input-pro" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Email" htmlFor="email">
              <input id="email" required type="email" autoComplete="email" value={form.email} onChange={(e) => update('email', e.target.value)} className="input-pro" />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Password" htmlFor="password">
              <div className="relative">
                <input id="password" required minLength={10} type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={form.password} onChange={(e) => update('password', e.target.value)} className="input-pro pr-20" />
                <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-dusk-500">{showPassword ? 'Hide' : 'Show'}</button>
              </div>
              <div className="mt-3 flex gap-1">
                {[1, 2, 3, 4, 5].map((level) => <span key={level} className={`h-1.5 flex-1 rounded-full ${level <= passwordScore ? 'bg-orange-500' : 'bg-slate-100'}`} />)}
              </div>
              <p className="mt-2 text-xs text-dusk-500">Use 10+ characters, uppercase and lowercase letters, a number and a symbol.</p>
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Address (optional)" htmlFor="address">
              <input id="address" autoComplete="street-address" value={form.address} onChange={(e) => update('address', e.target.value)} className="input-pro" />
            </Field>
          </div>

          {error && <p role="alert" className="sm:col-span-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

          <div className="sm:col-span-2">
            <button type="submit" disabled={submitting} className="w-full rounded-xl bg-dusk-900 py-3.5 text-sm font-bold text-white hover:bg-dusk-700 disabled:opacity-60">
              {submitting ? 'Creating account…' : 'Create customer account'}
            </button>
          </div>
        </form>

        <p className="mt-7 text-sm text-dusk-500">Already have an account? <Link href="/login" className="font-semibold text-orange-600">Sign in</Link></p>
      </div>
    </main>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return <label htmlFor={htmlFor} className="block"><span className="mb-2 block text-sm font-semibold text-dusk-700">{label}</span>{children}</label>;
}
