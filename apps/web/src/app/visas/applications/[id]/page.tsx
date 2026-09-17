'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';
import { useAuth } from '@/lib/auth-context';
import { apiClient, ApiError } from '@/lib/api-client';
import { VISA_STATUS_LABEL, VisaApplication } from '@/lib/visa-types';
import { formatDate, formatDateTime } from '@/lib/format';

export default function VisaApplicationDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, accessToken, loading: authLoading } = useAuth();
  const [application, setApplication] = useState<VisaApplication | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace(`/login?next=${encodeURIComponent(`/visas/applications/${params.id}`)}`);
  }, [authLoading, user, router, params.id]);

  useEffect(() => {
    if (!accessToken) return;
    apiClient
      .getVisaApplication(params.id, accessToken)
      .then(setApplication)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load this application.'));
  }, [accessToken, params.id]);

  if (authLoading || !user) return null;

  return (
    <main className="min-h-screen">
      <SiteHeader />
      <section className="max-w-3xl mx-auto px-6 pt-10 pb-24">
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {!error && !application && <p className="text-sm text-dusk-500">Loading…</p>}

        {application && (
          <>
            <div className="flex items-center justify-between gap-4">
              <div>
                <h1 className="font-display text-2xl text-dusk-900">Application {application.applicationReference}</h1>
                <p className="text-sm text-dusk-500 mt-1">Submitted {formatDateTime(application.createdAt)}</p>
              </div>
              <StatusBadge status={application.status} />
            </div>

            <p className="mt-4 text-sm text-dusk-700 bg-sand/50 rounded-lg px-4 py-3">
              This tracks the status of your application with our team. The final decision to grant or refuse a visa
              is always made by {application.destinationCountry}&apos;s own immigration authorities, not by Mohammad
              Travels &amp; Tours.
            </p>

            {application.status === 'ADDITIONAL_INFO_REQUIRED' && (
              <p className="mt-4 text-sm text-tangerine-dim bg-tangerine/10 rounded-lg px-4 py-3">
                Additional information is needed to continue processing this application
                {application.reviewerNote ? `: ${application.reviewerNote}` : '. Our team will contact you.'}
              </p>
            )}
            {application.status === 'REJECTED' && application.reviewerNote && (
              <p className="mt-4 text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{application.reviewerNote}</p>
            )}
            {application.status === 'APPROVED' && (
              <p className="mt-4 text-sm text-dusk-700 bg-sand/50 rounded-lg px-4 py-3">
                This application has been approved.{application.reviewerNote ? ` ${application.reviewerNote}` : ''}
              </p>
            )}

            <div className="mt-6 grid sm:grid-cols-2 gap-4">
              <div className="rounded-xl bg-white border border-sand p-4">
                <p className="text-xs font-medium text-dusk-700 mb-2">Application</p>
                <p className="text-sm text-dusk-500">Destination: {application.destinationCountry}</p>
                <p className="text-sm text-dusk-500">Visa type: {application.visaType}</p>
                {application.travelDate && <p className="text-sm text-dusk-500">Travel date: {formatDate(application.travelDate)}</p>}
              </div>
              <div className="rounded-xl bg-white border border-sand p-4">
                <p className="text-xs font-medium text-dusk-700 mb-2">Applicant</p>
                <p className="text-sm text-dusk-500">{application.applicantFullName}</p>
                <p className="text-sm text-dusk-500">Passport: {application.applicantPassportNumber}</p>
                <p className="text-sm text-dusk-500">Nationality: {application.applicantNationality}</p>
                <p className="text-xs text-dusk-500 mt-1">{application.contactEmail} · {application.contactPhone}</p>
              </div>
            </div>

            <details className="mt-6 text-xs text-dusk-500">
              <summary className="cursor-pointer font-medium text-dusk-700">Status history</summary>
              <ul className="mt-2 space-y-1">
                {application.statusHistory.map((h, i) => (
                  <li key={i}>
                    {formatDateTime(h.createdAt)}: {h.fromStatus ? `${h.fromStatus} → ` : ''}{h.toStatus}
                    {h.note ? ` (${h.note})` : ''}
                  </li>
                ))}
              </ul>
            </details>

            <Link href="/visas/applications" className="mt-8 inline-block text-sm text-tangerine-dim">
              ← Back to my applications
            </Link>
          </>
        )}
      </section>
    </main>
  );
}

function StatusBadge({ status }: { status: VisaApplication['status'] }) {
  const cls =
    status === 'APPROVED'
      ? 'bg-green-100 text-green-700'
      : status === 'REJECTED'
      ? 'bg-red-100 text-red-700'
      : 'bg-sand text-dusk-700';
  return <span className={`text-xs font-medium rounded-full px-3 py-1 shrink-0 ${cls}`}>{VISA_STATUS_LABEL[status]}</span>;
}
