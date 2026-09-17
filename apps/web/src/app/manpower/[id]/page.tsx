'use client';

import Link from 'next/link';
import { ReactNode, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { SiteHeader } from '@/components/site-header';
import { ContactWidget } from '@/components/contact-widget';
import { useAuth } from '@/lib/auth-context';
import { apiClient, ApiError } from '@/lib/api-client';
import { ManpowerJob } from '@/lib/manpower-types';
import { formatDate, formatMoney } from '@/lib/format';

export default function ManpowerJobDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, accessToken } = useAuth();

  const [job, setJob] = useState<ManpowerJob | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [applicantFullName, setApplicantFullName] = useState('');
  const [applicantNationality, setApplicantNationality] = useState('');
  const [applicantPassportNumber, setApplicantPassportNumber] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [yearsOfExperience, setYearsOfExperience] = useState('');
  const [currentOccupation, setCurrentOccupation] = useState('');
  const [coverNote, setCoverNote] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');

  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<string | null>(null); // application reference, once submitted

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getManpowerJob(params.id)
      .then((j) => !cancelled && setJob(j))
      .catch((err) => !cancelled && setLoadError(err instanceof ApiError ? err.message : 'Could not load this job.'));
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  useEffect(() => {
    if (user) {
      setApplicantFullName((prev) => prev || user.fullName);
      setContactEmail((prev) => prev || user.email);
    }
  }, [user]);

  function validate(): string | null {
    if (!applicantFullName.trim()) return 'Full name is required.';
    if (!applicantNationality.trim()) return 'Nationality is required.';
    if (!/^\S+@\S+\.\S+$/.test(contactEmail)) return 'Enter a valid contact email.';
    if (!/^\+?[0-9]{7,15}$/.test(contactPhone)) return 'Enter a valid contact phone number (e.g. +8801XXXXXXXXX).';
    return null;
  }

  async function submit() {
    if (!job) return;
    if (!user || !accessToken) {
      router.push(`/login?next=${encodeURIComponent(`/manpower/${job.id}`)}`);
      return;
    }
    const err = validate();
    if (err) {
      setFormError(err);
      return;
    }
    setFormError(null);
    setSubmitting(true);
    try {
      const application = await apiClient.applyForManpowerJob(
        job.id,
        {
          applicantFullName,
          applicantNationality,
          applicantPassportNumber: applicantPassportNumber || undefined,
          dateOfBirth: dateOfBirth || undefined,
          yearsOfExperience: yearsOfExperience ? Number(yearsOfExperience) : undefined,
          currentOccupation: currentOccupation || undefined,
          coverNote: coverNote || undefined,
          contactEmail,
          contactPhone,
        },
        accessToken,
      );
      setSubmitted(application.applicationReference);
    } catch (submitErr) {
      setFormError(submitErr instanceof ApiError ? submitErr.message : 'Could not submit your application. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen">
      <SiteHeader />
      <section className="max-w-3xl mx-auto px-6 pt-10 pb-24">
        {loadError && (
          <p role="alert" className="text-sm text-red-600 bg-white border border-sand rounded-lg p-4">
            {loadError}
          </p>
        )}
        {!loadError && !job && <p className="text-sm text-dusk-500">Loading job…</p>}

        {job && (
          <>
            {job.category && <span className="text-xs rounded-full bg-sand text-dusk-700 px-2.5 py-1 font-medium">{job.category}</span>}
            <h1 className="mt-3 font-display text-3xl text-dusk-900">{job.title}</h1>
            <p className="mt-1 text-sm text-dusk-500">
              {job.country}
              {job.employer ? ` · ${job.employer}` : ''}
            </p>

            <div className="mt-5 grid sm:grid-cols-2 gap-4">
              {job.salaryMin != null && (
                <InfoCard title="Salary">
                  {formatMoney(job.salaryMin, job.currency ?? 'USD')}
                  {job.salaryMax != null && job.salaryMax !== job.salaryMin ? ` – ${formatMoney(job.salaryMax, job.currency ?? 'USD')}` : ''}
                  {' '}per month
                </InfoCard>
              )}
              <InfoCard title="Positions open">{job.positionsRemaining} of {job.positionsAvailable}</InfoCard>
              {job.contractDurationMonths && <InfoCard title="Contract length">{job.contractDurationMonths} months</InfoCard>}
              {job.applicationDeadline && <InfoCard title="Apply by">{formatDate(job.applicationDeadline)}</InfoCard>}
            </div>

            {job.requirements.length > 0 && (
              <div className="mt-4 rounded-2xl bg-white border border-sand shadow-sm p-5">
                <p className="text-sm font-medium text-dusk-900 mb-2">Requirements</p>
                <ul className="text-sm text-dusk-700 list-disc list-inside space-y-0.5">
                  {job.requirements.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}

            {job.benefits.length > 0 && (
              <div className="mt-4 rounded-2xl bg-white border border-sand shadow-sm p-5">
                <p className="text-sm font-medium text-dusk-900 mb-2">What&apos;s provided</p>
                <ul className="text-sm text-dusk-700 list-disc list-inside space-y-0.5">
                  {job.benefits.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              </div>
            )}

            {submitted ? (
              <div className="mt-6 rounded-2xl bg-white border border-sand shadow-sm p-5">
                <p className="text-sm font-medium text-dusk-900">Application submitted</p>
                <p className="mt-1 text-sm text-dusk-500">
                  Your reference is <span className="font-medium text-dusk-900">{submitted}</span>. Track its status
                  from{' '}
                  <Link href="/manpower/applications" className="text-tangerine-dim hover:underline">
                    My applications
                  </Link>
                  .
                </p>
              </div>
            ) : (
              <div className="mt-6 rounded-2xl bg-white border border-sand shadow-sm p-5 space-y-4">
                <p className="text-sm font-medium text-dusk-900">Apply for this position</p>
                <p className="text-xs text-dusk-500 -mt-2">No fee is charged to apply or to be placed.</p>

                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="Full name">
                    <input value={applicantFullName} onChange={(e) => setApplicantFullName(e.target.value)} className="w-full rounded-md border border-sand px-3 py-2 text-sm" />
                  </Field>
                  <Field label="Nationality">
                    <input value={applicantNationality} onChange={(e) => setApplicantNationality(e.target.value)} className="w-full rounded-md border border-sand px-3 py-2 text-sm" />
                  </Field>
                  <Field label="Date of birth (optional)">
                    <input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} className="w-full rounded-md border border-sand px-3 py-2 text-sm" />
                  </Field>
                  <Field label="Passport number (optional)">
                    <input value={applicantPassportNumber} onChange={(e) => setApplicantPassportNumber(e.target.value)} className="w-full rounded-md border border-sand px-3 py-2 text-sm" />
                  </Field>
                  <Field label="Years of experience (optional)">
                    <input type="number" min={0} value={yearsOfExperience} onChange={(e) => setYearsOfExperience(e.target.value)} className="w-full rounded-md border border-sand px-3 py-2 text-sm" />
                  </Field>
                  <Field label="Current occupation (optional)">
                    <input value={currentOccupation} onChange={(e) => setCurrentOccupation(e.target.value)} className="w-full rounded-md border border-sand px-3 py-2 text-sm" />
                  </Field>
                  <Field label="Contact email">
                    <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className="w-full rounded-md border border-sand px-3 py-2 text-sm" />
                  </Field>
                  <Field label="Contact phone">
                    <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="+8801XXXXXXXXX" className="w-full rounded-md border border-sand px-3 py-2 text-sm" />
                  </Field>
                </div>
                <Field label="Cover note (optional)">
                  <textarea value={coverNote} onChange={(e) => setCoverNote(e.target.value)} rows={3} className="w-full rounded-md border border-sand px-3 py-2 text-sm" />
                </Field>

                {formError && <p role="alert" className="text-sm text-red-600">{formError}</p>}

                <button
                  onClick={submit}
                  disabled={submitting || job.positionsRemaining === 0}
                  className="w-full rounded-lg bg-tangerine text-white font-medium px-6 py-3 hover:bg-tangerine-dim disabled:opacity-60"
                >
                  {job.positionsRemaining === 0 ? 'No positions remaining' : submitting ? 'Submitting…' : user ? 'Submit application' : 'Sign in to apply'}
                </button>
              </div>
            )}

            <div className="mt-6">
              <ContactWidget prefillMessage={`Hi, I have a question about the ${job.title} position in ${job.country}.`} />
            </div>
          </>
        )}
      </section>
    </main>
  );
}

function InfoCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl bg-white border border-sand p-4">
      <p className="text-xs font-medium text-dusk-700">{title}</p>
      <p className="mt-1 text-sm text-dusk-500">{children}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-dusk-500 mb-1">{label}</span>
      {children}
    </label>
  );
}
