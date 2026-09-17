'use client';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient, ApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';

export default function RegisterPage() {
  const { setSession } = useAuth();
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const session = await apiClient.register({
        fullName,
        email,
        password,
        phoneNumber,
        address: address.trim() ? address : undefined,
      });
      setSession(session);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit your application.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Apply for an agent account</h1>
        <p className="mt-2 text-sm text-slate-500">
          Agency name (as your full name for now), business email, and a
          password. An admin reviews every application before wallet
          access is enabled — see docs/SECURITY.md § Authorization.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4" noValidate>
          <div>
            <label htmlFor="fullName" className="block text-sm text-slate-700 mb-1.5">Agency / contact name</label>
            <input id="fullName" required value={fullName} onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-md border border-line px-3 py-2.5 focus:border-teal focus:ring-0" />
          </div>
          <div>
            <label htmlFor="email" className="block text-sm text-slate-700 mb-1.5">Business email</label>
            <input id="email" type="email" required autoComplete="email" value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-line px-3 py-2.5 focus:border-teal focus:ring-0" />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm text-slate-700 mb-1.5">Password</label>
            <input id="password" type="password" required minLength={10} autoComplete="new-password"
              value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-line px-3 py-2.5 focus:border-teal focus:ring-0" />
          </div>
          <div>
            <label htmlFor="phoneNumber" className="block text-sm text-slate-700 mb-1.5">Phone number</label>
            <input id="phoneNumber" type="tel" required autoComplete="tel" placeholder="+8801XXXXXXXXX"
              value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)}
              className="w-full rounded-md border border-line px-3 py-2.5 focus:border-teal focus:ring-0" />
          </div>
          <div>
            <label htmlFor="address" className="block text-sm text-slate-700 mb-1.5">
              Business address <span className="text-slate-500">(optional)</span>
            </label>
            <input id="address" autoComplete="street-address"
              value={address} onChange={(e) => setAddress(e.target.value)}
              className="w-full rounded-md border border-line px-3 py-2.5 focus:border-teal focus:ring-0" />
          </div>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={submitting}
            className="w-full rounded-md bg-slate-900 text-base font-medium py-2.5 hover:bg-slate-700 disabled:opacity-60">
            {submitting ? 'Submitting…' : 'Submit application'}
          </button>
        </form>
      </div>
    </main>
  );
}
