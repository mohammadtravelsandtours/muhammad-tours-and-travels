'use client';

import { useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { useAuth } from '@/lib/auth-context';
import { apiClient, ApiError, ManpowerApplicationRow, ManpowerJobRow } from '@/lib/api-client';

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso));
}

const EMPTY_FORM = {
  title: '',
  country: '',
  employer: '',
  category: '',
  positionsAvailable: '',
  salaryMin: '',
  salaryMax: '',
  currency: 'USD',
  contractDurationMonths: '',
  applicationDeadline: '',
  requirements: '',
  benefits: '',
};

const NEXT_STATUS: Record<string, string[]> = {
  SUBMITTED: ['UNDER_REVIEW', 'SHORTLISTED', 'REJECTED'],
  UNDER_REVIEW: ['SHORTLISTED', 'REJECTED'],
  SHORTLISTED: ['INTERVIEW_SCHEDULED', 'REJECTED'],
  INTERVIEW_SCHEDULED: ['SELECTED', 'REJECTED'],
  SELECTED: ['VISA_PROCESSING', 'REJECTED'],
  VISA_PROCESSING: ['DEPLOYED', 'REJECTED'],
  DEPLOYED: [],
  REJECTED: [],
  WITHDRAWN: [],
};

export default function ManpowerAdminPage() {
  const { accessToken } = useAuth();
  const [jobs, setJobs] = useState<ManpowerJobRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [applications, setApplications] = useState<ManpowerApplicationRow[] | null>(null);
  const [applicationsError, setApplicationsError] = useState<string | null>(null);

  function load() {
    if (!accessToken) return;
    apiClient
      .listManpowerJobsAdmin(accessToken)
      .then((r) => setJobs(r.jobs))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load jobs.'));
  }

  useEffect(load, [accessToken]);

  function loadApplications(jobId: string | null) {
    if (!accessToken) return;
    setSelectedJobId(jobId);
    setApplicationsError(null);
    apiClient
      .listManpowerApplicationsAdmin(accessToken, jobId ? { jobId } : undefined)
      .then((r) => setApplications(r.applications))
      .catch((err) => setApplicationsError(err instanceof ApiError ? err.message : 'Could not load applications.'));
  }

  async function createJob() {
    if (!accessToken) return;
    const positionsAvailable = Number(form.positionsAvailable);
    if (!form.title.trim() || !form.country.trim()) {
      setFormError('Title and country are required.');
      return;
    }
    if (!Number.isFinite(positionsAvailable) || positionsAvailable < 1) {
      setFormError('Positions available must be a number of at least 1.');
      return;
    }
    setFormError(null);
    setSubmitting(true);
    try {
      await apiClient.createManpowerJob(accessToken, {
        title: form.title,
        country: form.country,
        employer: form.employer || undefined,
        category: form.category || undefined,
        positionsAvailable,
        salaryMin: form.salaryMin ? Number(form.salaryMin) : undefined,
        salaryMax: form.salaryMax ? Number(form.salaryMax) : undefined,
        currency: form.currency ? form.currency.toUpperCase() : undefined,
        contractDurationMonths: form.contractDurationMonths ? Number(form.contractDurationMonths) : undefined,
        applicationDeadline: form.applicationDeadline || undefined,
        requirements: form.requirements ? form.requirements.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
        benefits: form.benefits ? form.benefits.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
      });
      setForm(EMPTY_FORM);
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not create this job.');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(job: ManpowerJobRow) {
    if (!accessToken) return;
    await apiClient.updateManpowerJob(accessToken, job.id, { active: !job.active });
    load();
  }

  async function moveStatus(application: ManpowerApplicationRow, toStatus: string) {
    if (!accessToken) return;
    await apiClient.updateManpowerApplicationStatus(accessToken, application.id, { toStatus });
    loadApplications(selectedJobId);
  }

  return (
    <AdminShell>
      <h2 className="text-lg font-semibold text-paper-100 mb-1">Manpower — job catalog</h2>
      <p className="text-sm text-paper-500 mb-6">
        Manage browsable overseas job postings and review candidate applications. No fee is charged to candidates —
        this catalog carries no payment fields by design.
      </p>

      <div className="border border-ink-700 rounded-lg p-5 bg-ink-900 mb-8">
        <p className="text-xs text-paper-500 mb-3">New job</p>
        <div className="grid sm:grid-cols-3 gap-2 text-sm">
          <input placeholder="Job title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="bg-ink-800 border border-ink-700 rounded-md px-2 py-2 text-paper-100 sm:col-span-2" />
          <input placeholder="Country" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} className="bg-ink-800 border border-ink-700 rounded-md px-2 py-2 text-paper-100" />

          <input placeholder="Employer (optional)" value={form.employer} onChange={(e) => setForm({ ...form, employer: e.target.value })} className="bg-ink-800 border border-ink-700 rounded-md px-2 py-2 text-paper-100" />
          <input placeholder="Category (e.g. Construction)" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="bg-ink-800 border border-ink-700 rounded-md px-2 py-2 text-paper-100" />
          <label className="text-xs text-paper-500 flex flex-col gap-1">
            Positions available
            <input type="number" min="1" value={form.positionsAvailable} onChange={(e) => setForm({ ...form, positionsAvailable: e.target.value })} className="bg-ink-800 border border-ink-700 rounded-md px-2 py-2 text-paper-100" />
          </label>

          <label className="text-xs text-paper-500 flex flex-col gap-1">
            Currency
            <input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} maxLength={3} className="bg-ink-800 border border-ink-700 rounded-md px-2 py-2 text-paper-100" />
          </label>
          <label className="text-xs text-paper-500 flex flex-col gap-1">
            Salary min / month
            <input type="number" min="0" step="0.01" value={form.salaryMin} onChange={(e) => setForm({ ...form, salaryMin: e.target.value })} className="bg-ink-800 border border-ink-700 rounded-md px-2 py-2 text-paper-100" />
          </label>
          <label className="text-xs text-paper-500 flex flex-col gap-1">
            Salary max / month (optional)
            <input type="number" min="0" step="0.01" value={form.salaryMax} onChange={(e) => setForm({ ...form, salaryMax: e.target.value })} className="bg-ink-800 border border-ink-700 rounded-md px-2 py-2 text-paper-100" />
          </label>

          <label className="text-xs text-paper-500 flex flex-col gap-1">
            Contract length (months)
            <input type="number" min="1" value={form.contractDurationMonths} onChange={(e) => setForm({ ...form, contractDurationMonths: e.target.value })} className="bg-ink-800 border border-ink-700 rounded-md px-2 py-2 text-paper-100" />
          </label>
          <label className="text-xs text-paper-500 flex flex-col gap-1">
            Application deadline (optional)
            <input type="date" value={form.applicationDeadline} onChange={(e) => setForm({ ...form, applicationDeadline: e.target.value })} className="bg-ink-800 border border-ink-700 rounded-md px-2 py-2 text-paper-100" />
          </label>

          <label className="text-xs text-paper-500 flex flex-col gap-1 sm:col-span-3">
            Requirements (comma-separated)
            <input placeholder="Age 21-45, 2+ years experience, valid passport" value={form.requirements} onChange={(e) => setForm({ ...form, requirements: e.target.value })} className="bg-ink-800 border border-ink-700 rounded-md px-2 py-2 text-paper-100" />
          </label>
          <label className="text-xs text-paper-500 flex flex-col gap-1 sm:col-span-3">
            Benefits (comma-separated)
            <input placeholder="Free accommodation, food allowance, flight ticket provided" value={form.benefits} onChange={(e) => setForm({ ...form, benefits: e.target.value })} className="bg-ink-800 border border-ink-700 rounded-md px-2 py-2 text-paper-100" />
          </label>
        </div>

        {formError && <p role="alert" className="text-sm text-danger mt-3">{formError}</p>}

        <button onClick={createJob} disabled={submitting} className="mt-4 rounded-md bg-signal text-ink-950 font-medium px-4 py-2 text-sm hover:bg-signal-dim disabled:opacity-60">
          {submitting ? 'Creating…' : 'Create job'}
        </button>
      </div>

      {error && <p role="alert" className="text-sm text-danger mb-4">{error}</p>}
      {!error && jobs === null && <p className="text-sm text-paper-500">Loading…</p>}

      <div className="space-y-3 mb-10">
        {jobs?.map((j) => (
          <div key={j.id} className="border border-ink-700 rounded-lg p-4 bg-ink-900">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div className="min-w-0">
                <p className="text-paper-100 font-medium break-words">
                  {j.title} <span className="text-paper-500 text-xs">({j.country})</span>
                  {!j.active && <span className="ml-2 text-xs rounded-full bg-danger/20 text-danger px-2 py-0.5">inactive</span>}
                </p>
                <p className="text-xs text-paper-500 mt-1">
                  {j.positionsFilled}/{j.positionsAvailable} positions filled
                  {j.salaryMin != null ? ` · ${formatMoney(j.salaryMin, j.currency ?? 'USD')}${j.salaryMax != null ? `–${formatMoney(j.salaryMax, j.currency ?? 'USD')}` : ''}/mo` : ''}
                  {j.applicationDeadline ? ` · deadline ${formatDate(j.applicationDeadline)}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => loadApplications(j.id)} className="text-xs text-signal hover:text-signal-dim">
                  View applications
                </button>
                <button onClick={() => toggleActive(j)} className="text-xs text-paper-300 hover:text-paper-100 border border-ink-700 rounded-md px-2 py-1">
                  {j.active ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <h2 className="text-lg font-semibold text-paper-100 mb-1">Applications{selectedJobId ? ' (filtered)' : ''}</h2>
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => loadApplications(null)} className="text-xs text-signal hover:text-signal-dim">
          Show all applications
        </button>
      </div>

      {applicationsError && <p role="alert" className="text-sm text-danger mb-4">{applicationsError}</p>}
      {applications === null && !applicationsError && (
        <p className="text-sm text-paper-500">Select &quot;View applications&quot; on a job, or &quot;Show all applications&quot;.</p>
      )}

      <div className="space-y-2">
        {applications?.length === 0 && <p className="text-sm text-paper-500">No applications.</p>}
        {applications?.map((a) => (
          <div key={a.id} className="border border-ink-700 rounded-lg p-4 bg-ink-900 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div className="min-w-0">
                <p className="text-paper-100 font-medium break-words">
                  {a.applicationReference} — {a.applicantFullName} ({a.applicantNationality})
                </p>
                <p className="text-xs text-paper-500 mt-1">
                  {a.job?.title ?? 'Job'} · {a.contactPhone} · {a.contactEmail}
                  {a.yearsOfExperience != null ? ` · ${a.yearsOfExperience} yrs experience` : ''}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs rounded-full bg-ink-800 text-paper-300 px-2 py-1 inline-block mb-2">{a.status}</p>
                <div className="flex flex-wrap gap-1 justify-end">
                  {(NEXT_STATUS[a.status] ?? []).map((next) => (
                    <button
                      key={next}
                      onClick={() => moveStatus(a, next)}
                      className={`text-xs rounded-md px-2 py-1 border ${
                        next === 'REJECTED' ? 'border-danger/40 text-danger hover:bg-danger/10' : 'border-signal/40 text-signal hover:bg-signal/10'
                      }`}
                    >
                      {next.replace('_', ' ').toLowerCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </AdminShell>
  );
}
