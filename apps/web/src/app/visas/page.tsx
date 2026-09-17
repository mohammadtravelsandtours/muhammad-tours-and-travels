'use client';

import { FormEvent, ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SiteHeader } from '@/components/site-header';
import { useAuth } from '@/lib/auth-context';
import { apiClient, ApiError } from '@/lib/api-client';

function todayPlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function VisaApplyPage() {
  const { user, accessToken, loading: authLoading } = useAuth();
  const router = useRouter();

  const [destinationCountry, setDestinationCountry] = useState('');
  const [visaType, setVisaType] = useState('');
  const [travelDate, setTravelDate] = useState('');
  const [applicantFullName, setApplicantFullName] = useState('');
  const [applicantPassportNumber, setApplicantPassportNumber] = useState('');
  const [applicantNationality, setApplicantNationality] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login?next=/visas');
  }, [authLoading, user, router]);

  useEffect(() => {
    if (user) {
      setApplicantFullName((prev) => prev || user.fullName);
      setContactEmail((prev) => prev || user.email);
    }
  }, [user]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (destinationCountry.trim().length < 2) return setError('Enter the destination country.');
    if (visaType.trim().length < 2) return setError('Enter the type of visa (e.g. Tourist, Business, Umrah).');
    if (!applicantFullName.trim()) return setError('Enter the applicant’s full name as it appears on their passport.');
    if (applicantPassportNumber.trim().length < 4) return setError('Enter a valid passport number.');
    if (applicantNationality.trim().length < 2) return setError('Enter the applicant’s nationality.');
    if (!/^\S+@\S+\.\S+$/.test(contactEmail)) return setError('Enter a valid contact email.');
    if (!/^\+?[0-9]{7,15}$/.test(contactPhone)) return setError('Enter a valid contact phone number (e.g. +8801XXXXXXXXX).');

    if (!accessToken) return;
    setSubmitting(true);
    try {
      const application = await apiClient.applyForVisa(
        {
          destinationCountry: destinationCountry.trim(),
          visaType: visaType.trim(),
          travelDate: travelDate || undefined,
          applicantFullName: applicantFullName.trim(),
          applicantPassportNumber: applicantPassportNumber.trim(),
          applicantNationality: applicantNationality.trim(),
          contactEmail,
          contactPhone,
        },
        accessToken,
      );
      router.push(`/visas/applications/${application.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit this application. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading || !user) return null;

  return (
    <main className="min-h-screen">
      <SiteHeader />
      <section className="max-w-2xl mx-auto px-6 pt-10 pb-24">
        <h1 className="font-display text-3xl text-dusk-900">Apply for a visa</h1>
        <p className="mt-2 text-sm text-dusk-500">
          This submits an application for our team to review and forward. A visa is granted or refused by the
          destination country&apos;s authorities, not by Muhammad Tours and Travels — this page tracks status, it does
          not guarantee an outcome.
        </p>
        <p className="mt-3 text-sm">
          <Link href="/visas/applications" className="text-tangerine-dim">View your past applications</Link>
        </p>

        <form onSubmit={handleSubmit} className="mt-8 rounded-2xl bg-white border border-sand shadow-sm p-5 space-y-4" noValidate>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Destination country">
              <input value={destinationCountry} onChange={(e) => setDestinationCountry(e.target.value)} maxLength={60} className="w-full rounded-md border border-sand px-3 py-2" />
            </Field>
            <Field label="Visa type">
              <input value={visaType} onChange={(e) => setVisaType(e.target.value)} placeholder="e.g. TOURIST, BUSINESS, UMRAH" maxLength={40} className="w-full rounded-md border border-sand px-3 py-2" />
            </Field>
            <Field label="Intended travel date (optional)">
              <input type="date" min={todayPlus(0)} value={travelDate} onChange={(e) => setTravelDate(e.target.value)} className="w-full rounded-md border border-sand px-3 py-2" />
            </Field>
            <Field label="Applicant nationality">
              <input value={applicantNationality} onChange={(e) => setApplicantNationality(e.target.value)} maxLength={60} className="w-full rounded-md border border-sand px-3 py-2" />
            </Field>
            <Field label="Applicant full name (as on passport)">
              <input value={applicantFullName} onChange={(e) => setApplicantFullName(e.target.value)} maxLength={150} className="w-full rounded-md border border-sand px-3 py-2" />
            </Field>
            <Field label="Passport number">
              <input value={applicantPassportNumber} onChange={(e) => setApplicantPassportNumber(e.target.value)} maxLength={20} className="w-full rounded-md border border-sand px-3 py-2" />
            </Field>
            <Field label="Contact email">
              <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className="w-full rounded-md border border-sand px-3 py-2" />
            </Field>
            <Field label="Contact phone">
              <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="+8801XXXXXXXXX" className="w-full rounded-md border border-sand px-3 py-2" />
            </Field>
          </div>

          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full sm:w-auto rounded-lg bg-tangerine text-white font-medium px-8 py-3 hover:bg-tangerine-dim disabled:opacity-60"
          >
            {submitting ? 'Submitting…' : 'Submit application'}
          </button>
        </form>
      </section>
    </main>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="block text-xs text-dusk-500 mb-1">{label}</span>
      {children}
    </label>
  );
}
