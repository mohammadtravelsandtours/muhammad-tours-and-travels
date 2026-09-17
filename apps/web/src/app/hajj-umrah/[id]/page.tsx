'use client';

import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { SiteHeader } from '@/components/site-header';
import { ContactWidget } from '@/components/contact-widget';
import { StripeCardField, StripeCardFieldHandle } from '@/components/stripe-card-field';
import { getStripePublishableKey } from '@/lib/stripe';
import { useAuth } from '@/lib/auth-context';
import { apiClient, ApiError, newIdempotencyKey } from '@/lib/api-client';
import { HajjUmrahPackage } from '@/lib/hajj-umrah-types';
import { formatDate, formatMoney } from '@/lib/format';

/** Client-side ESTIMATE only, shown before submit — the server always computes and enforces the real minimum (see HajjUmrahService.calculateMinimumDeposit); this never gates what can be submitted. */
function estimateMinimumDeposit(pkg: HajjUmrahPackage, pilgrims: number): number {
  const total = pkg.totalAmount * pilgrims;
  const raw = pkg.depositType === 'PERCENTAGE' ? (total * pkg.depositValue) / 100 : pkg.depositValue * pilgrims;
  return Math.round(raw * 100) / 100;
}

export default function HajjUmrahPackageDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, accessToken } = useAuth();

  const [pkg, setPkg] = useState<HajjUmrahPackage | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [pilgrims, setPilgrims] = useState(1);
  const [leadPilgrimName, setLeadPilgrimName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [payMore, setPayMore] = useState(false);
  const [customAmount, setCustomAmount] = useState('');

  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const idempotencyKey = useMemo(() => newIdempotencyKey(), []);
  const stripeConfigured = useMemo(() => !!getStripePublishableKey(), []);
  const cardFieldRef = useRef<StripeCardFieldHandle>(null);
  const [cardReady, setCardReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getHajjUmrahPackage(params.id)
      .then((p) => !cancelled && setPkg(p))
      .catch((err) => !cancelled && setLoadError(err instanceof ApiError ? err.message : 'Could not load this package.'));
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  useEffect(() => {
    if (user) {
      setLeadPilgrimName((prev) => prev || user.fullName);
      setContactEmail((prev) => prev || user.email);
    }
  }, [user]);

  const total = pkg ? pkg.totalAmount * pilgrims : 0;
  const minimumDeposit = pkg ? estimateMinimumDeposit(pkg, pilgrims) : 0;

  function validate(): string | null {
    if (!leadPilgrimName.trim()) return 'Lead pilgrim name is required.';
    if (!/^\S+@\S+\.\S+$/.test(contactEmail)) return 'Enter a valid contact email.';
    if (!/^\+?[0-9]{7,15}$/.test(contactPhone)) return 'Enter a valid contact phone number (e.g. +8801XXXXXXXXX).';
    if (payMore) {
      const amount = Number(customAmount);
      if (!Number.isFinite(amount) || amount < minimumDeposit) {
        return `The amount you pay now must be at least the minimum deposit of ${formatMoney(minimumDeposit, pkg!.currency)}.`;
      }
    }
    return null;
  }

  async function submit() {
    if (!pkg) return;
    if (!user || !accessToken) {
      router.push(`/login?next=${encodeURIComponent(`/hajj-umrah/${pkg.id}`)}`);
      return;
    }
    const err = validate();
    if (err) {
      setFormError(err);
      return;
    }
    setFormError(null);
    setSubmitting(true);

    let paymentMethodToken: string | undefined;
    try {
      paymentMethodToken = (await cardFieldRef.current?.createPaymentMethod(leadPilgrimName, contactEmail)) ?? undefined;
    } catch (cardErr) {
      setFormError(cardErr instanceof Error ? cardErr.message : 'Could not process the card. Please check the details and try again.');
      setSubmitting(false);
      return;
    }

    try {
      const booking = await apiClient.createHajjUmrahBooking(
        {
          packageId: pkg.id,
          pilgrims,
          leadPilgrimName,
          contactPhone,
          contactEmail,
          paymentAmount: payMore ? Number(customAmount) : undefined,
          paymentMethodToken,
        },
        accessToken,
        idempotencyKey,
      );
      router.push(`/hajj-umrah/bookings/${booking.id}`);
    } catch (submitErr) {
      setFormError(submitErr instanceof ApiError ? submitErr.message : 'Could not complete the booking. Please try again.');
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
        {!loadError && !pkg && <p className="text-sm text-dusk-500">Loading package…</p>}

        {pkg && (
          <>
            <span className="text-xs rounded-full bg-sand text-dusk-700 px-2.5 py-1 font-medium">{pkg.type}</span>
            <h1 className="mt-3 font-display text-3xl text-dusk-900">{pkg.title}</h1>
            {pkg.description && <p className="mt-2 text-sm text-dusk-700">{pkg.description}</p>}

            <div className="mt-5 grid sm:grid-cols-2 gap-4">
              <InfoCard title="Dates">
                {formatDate(pkg.departureDate)} — {formatDate(pkg.returnDate)} ({pkg.durationNights} nights)
              </InfoCard>
              <InfoCard title="Seats remaining">{pkg.seatsRemaining} of {pkg.capacity}</InfoCard>
              {pkg.makkahHotel && <InfoCard title="Makkah hotel">{pkg.makkahHotel}</InfoCard>}
              {pkg.madinahHotel && <InfoCard title="Madinah hotel">{pkg.madinahHotel}</InfoCard>}
            </div>

            {pkg.inclusions.length > 0 && (
              <div className="mt-4 rounded-2xl bg-white border border-sand shadow-sm p-5">
                <p className="text-sm font-medium text-dusk-900 mb-2">What&apos;s included</p>
                <ul className="text-sm text-dusk-700 list-disc list-inside space-y-0.5">
                  {pkg.inclusions.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-6 rounded-2xl bg-white border border-sand shadow-sm p-5 space-y-4">
              <p className="text-sm font-medium text-dusk-900">Reserve your seat</p>

              <Field label="Number of pilgrims">
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setPilgrims((v) => Math.max(1, v - 1))} className="w-8 h-8 rounded-full border border-sand text-dusk-700 leading-none disabled:opacity-40" disabled={pilgrims <= 1}>
                    −
                  </button>
                  <span className="text-dusk-900 font-medium w-6 text-center">{pilgrims}</span>
                  <button
                    type="button"
                    onClick={() => setPilgrims((v) => Math.min(pkg.seatsRemaining, v + 1))}
                    className="w-8 h-8 rounded-full border border-sand text-dusk-700 leading-none disabled:opacity-40"
                    disabled={pilgrims >= pkg.seatsRemaining}
                  >
                    +
                  </button>
                </div>
              </Field>

              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Lead pilgrim name">
                  <input value={leadPilgrimName} onChange={(e) => setLeadPilgrimName(e.target.value)} className="w-full rounded-md border border-sand px-3 py-2 text-sm" />
                </Field>
                <Field label="Contact email">
                  <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className="w-full rounded-md border border-sand px-3 py-2 text-sm" />
                </Field>
                <Field label="Contact phone">
                  <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="+8801XXXXXXXXX" className="w-full rounded-md border border-sand px-3 py-2 text-sm" />
                </Field>
              </div>

              <div className="rounded-xl bg-sand/40 p-4 text-sm space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-dusk-500">Total ({pilgrims} pilgrim{pilgrims === 1 ? '' : 's'})</span>
                  <span className="font-medium text-dusk-900">{formatMoney(total, pkg.currency)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-dusk-500">Minimum deposit due now</span>
                  <span className="font-medium text-dusk-900">{formatMoney(minimumDeposit, pkg.currency)}</span>
                </div>
                <p className="text-xs text-dusk-500">
                  Pay the minimum deposit now to reserve your seat, then pay the remaining balance in installments any
                  time before departure.
                </p>
                <label className="flex items-center gap-2 text-xs text-dusk-700 pt-1">
                  <input type="checkbox" checked={payMore} onChange={(e) => setPayMore(e.target.checked)} />
                  I&apos;d like to pay more than the minimum deposit now
                </label>
                {payMore && (
                  <input
                    type="number"
                    min={minimumDeposit}
                    step="0.01"
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                    placeholder={`At least ${minimumDeposit}`}
                    className="w-full rounded-md border border-sand px-3 py-2 text-sm"
                  />
                )}
              </div>

              {stripeConfigured && (
                <div>
                  <p className="text-xs text-dusk-500 mb-2">Card details</p>
                  <StripeCardField ref={cardFieldRef} onReadyChange={setCardReady} />
                </div>
              )}

              {formError && <p role="alert" className="text-sm text-red-600">{formError}</p>}

              <button
                onClick={submit}
                disabled={submitting || pkg.seatsRemaining === 0 || (stripeConfigured && !cardReady)}
                className="w-full rounded-lg bg-tangerine text-white font-medium px-6 py-3 hover:bg-tangerine-dim disabled:opacity-60"
              >
                {pkg.seatsRemaining === 0
                  ? 'Fully booked'
                  : submitting
                    ? 'Reserving…'
                    : user
                      ? `Pay ${formatMoney(payMore && customAmount ? Number(customAmount) || minimumDeposit : minimumDeposit, pkg.currency)} and reserve`
                      : 'Sign in to reserve your seat'}
              </button>
            </div>

            <div className="mt-6">
              <ContactWidget prefillMessage={`Hi, I have a question about the ${pkg.title} package.`} />
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
