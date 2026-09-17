'use client';

import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { SiteHeader } from '@/components/site-header';
import { StripeCardField, StripeCardFieldHandle } from '@/components/stripe-card-field';
import { getStripePublishableKey } from '@/lib/stripe';
import { useAuth } from '@/lib/auth-context';
import { apiClient, ApiError, isHotelPriceConfirmationRequired, newIdempotencyKey } from '@/lib/api-client';
import { HotelOffer } from '@/lib/hotel-types';
import { formatMoney } from '@/lib/format';

const STEPS = ['Guest & contact', 'Review & confirm'] as const;

export default function BookHotelOfferPage() {
  const params = useParams<{ offerId: string }>();
  const router = useRouter();
  const { user, accessToken, loading: authLoading } = useAuth();

  const [offer, setOffer] = useState<HotelOffer | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState(0);

  const [rooms, setRooms] = useState(1);
  const [guestName, setGuestName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');

  const [reviewError, setReviewError] = useState<string | null>(null);
  const [previewTotal, setPreviewTotal] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [priceConfirm, setPriceConfirm] = useState<{ previousTotal: number; newTotal: number; currency: string } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const idempotencyKey = useMemo(() => newIdempotencyKey(), []);
  const stripeConfigured = useMemo(() => !!getStripePublishableKey(), []);
  const cardFieldRef = useRef<StripeCardFieldHandle>(null);
  const [cardReady, setCardReady] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace(`/login?next=${encodeURIComponent(`/hotels/offers/${params.offerId}/book`)}`);
    }
  }, [authLoading, user, router, params.offerId]);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getHotelOffer(params.offerId)
      .then((o) => {
        if (cancelled) return;
        setOffer(o);
      })
      .catch((err) => !cancelled && setLoadError(err instanceof ApiError ? err.message : 'Could not load this rate.'));
    return () => {
      cancelled = true;
    };
  }, [params.offerId]);

  useEffect(() => {
    if (user) {
      setGuestName((prev) => prev || user.fullName);
      setContactEmail((prev) => prev || user.email);
    }
  }, [user]);

  function validateGuest(): string | null {
    if (!guestName.trim()) return 'Guest name is required.';
    if (!/^\S+@\S+\.\S+$/.test(contactEmail)) return 'Enter a valid contact email.';
    if (!/^\+?[0-9]{7,15}$/.test(contactPhone)) return 'Enter a valid contact phone number (e.g. +8801XXXXXXXXX).';
    return null;
  }

  async function goToReview() {
    const err = validateGuest();
    if (err) {
      setReviewError(err);
      return;
    }
    setReviewError(null);
    setStep(1);
    setPreviewLoading(true);
    try {
      const preview = await apiClient.repriceHotelOffer(params.offerId, rooms);
      setPreviewTotal(preview.stillAvailable ? preview.newTotal : null);
      if (!preview.stillAvailable) {
        setReviewError('This rate is no longer available from the supplier. Please search again.');
      } else if (preview.priceChanged) {
        setReviewError(null);
      }
    } catch {
      // The preview is a UX convenience only — POST /hotels/bookings always
      // reprices for real regardless, so a failed preview here isn't
      // fatal, just less informative until the actual submit.
      setPreviewTotal(null);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function submitBooking(acceptedTotalAmount?: number) {
    if (!offer || !accessToken) return;
    setSubmitting(true);
    setSubmitError(null);
    let paymentMethodToken: string | undefined;
    try {
      paymentMethodToken = (await cardFieldRef.current?.createPaymentMethod(guestName, contactEmail)) ?? undefined;
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not process the card. Please check the details and try again.');
      setSubmitting(false);
      return;
    }
    try {
      const result = await apiClient.createHotelBooking(
        { offerId: offer.id, rooms, guestName, contactEmail, contactPhone, acceptedTotalAmount, paymentMethodToken },
        accessToken,
        idempotencyKey,
      );
      if (isHotelPriceConfirmationRequired(result)) {
        setPriceConfirm({ previousTotal: result.previousTotal, newTotal: result.newTotal, currency: result.currency });
        return;
      }
      router.push(`/hotels/bookings/${result.id}`);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Could not complete the booking. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading || (!user && !loadError)) return null;

  return (
    <main className="min-h-screen">
      <SiteHeader />
      <section className="max-w-3xl mx-auto px-6 pt-10 pb-24">
        {loadError && (
          <p role="alert" className="text-sm text-red-600 bg-white border border-sand rounded-lg p-4">
            {loadError}
          </p>
        )}

        {!loadError && !offer && <p className="text-sm text-dusk-500">Loading…</p>}

        {offer && (
          <>
            <ol className="flex items-center gap-2 text-xs text-dusk-500 mb-6">
              {STEPS.map((label, i) => (
                <li key={label} className={`flex items-center gap-2 ${i === step ? 'text-dusk-900 font-medium' : ''}`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center border ${i <= step ? 'bg-tangerine text-white border-tangerine' : 'border-sand'}`}>
                    {i + 1}
                  </span>
                  {label}
                  {i < STEPS.length - 1 && <span className="text-dusk-500">—</span>}
                </li>
              ))}
            </ol>

            <div className="rounded-xl bg-white border border-sand p-4 mb-6 text-sm text-dusk-700 flex items-center justify-between">
              <span>
                {offer.property?.name} · {offer.property?.city} · {offer.roomType} · {offer.nights} night{offer.nights === 1 ? '' : 's'}
              </span>
              <span className="font-medium text-dusk-900">{formatMoney(offer.totalFare, offer.currency)} / room</span>
            </div>

            {step === 0 && (
              <div className="space-y-5">
                <div className="rounded-2xl bg-white border border-sand shadow-sm p-5 grid sm:grid-cols-2 gap-3 text-sm">
                  <Field label="Number of rooms">
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setRooms((r) => Math.max(1, r - 1))} className="w-8 h-8 rounded-full border border-sand text-dusk-700 leading-none disabled:opacity-40" disabled={rooms <= 1}>
                        −
                      </button>
                      <span className="text-dusk-900 font-medium w-6 text-center">{rooms}</span>
                      <button type="button" onClick={() => setRooms((r) => Math.min(9, r + 1))} className="w-8 h-8 rounded-full border border-sand text-dusk-700 leading-none disabled:opacity-40" disabled={rooms >= 9}>
                        +
                      </button>
                    </div>
                  </Field>
                  <Field label="Guest name">
                    <input value={guestName} onChange={(e) => setGuestName(e.target.value)} className="w-full rounded-md border border-sand px-3 py-2" />
                  </Field>
                  <Field label="Contact email">
                    <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className="w-full rounded-md border border-sand px-3 py-2" />
                  </Field>
                  <Field label="Contact phone">
                    <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="+8801XXXXXXXXX" className="w-full rounded-md border border-sand px-3 py-2" />
                  </Field>
                </div>
                {reviewError && <p role="alert" className="text-sm text-red-600">{reviewError}</p>}
                <div className="flex justify-end">
                  <button onClick={goToReview} className="rounded-lg bg-dusk-900 text-ground font-medium px-6 py-2.5 hover:bg-dusk-700">
                    Review booking
                  </button>
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-5">
                <div className="rounded-2xl bg-white border border-sand shadow-sm p-5">
                  <p className="text-sm font-medium text-dusk-900 mb-2">Guest &amp; contact</p>
                  <p className="text-sm text-dusk-700">{guestName} · {contactEmail} · {contactPhone}</p>
                  <p className="text-sm text-dusk-700 mt-1">{rooms} room{rooms === 1 ? '' : 's'}</p>
                </div>

                <div className="rounded-2xl bg-white border border-sand shadow-sm p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-dusk-500">
                      {previewLoading ? 'Checking current price with the supplier…' : 'Price re-verified with the supplier'}
                    </p>
                    <p className="font-display text-2xl text-dusk-900">
                      {formatMoney(previewTotal ?? offer.totalFare * rooms, offer.currency)}
                    </p>
                  </div>
                  {previewTotal !== null && previewTotal !== offer.totalFare * rooms && (
                    <p className="mt-2 text-xs text-tangerine-dim">
                      The price has changed since you searched. The final price is always re-confirmed again when you
                      submit.
                    </p>
                  )}
                </div>

                {stripeConfigured && (
                  <div className="rounded-2xl bg-white border border-sand shadow-sm p-5">
                    <StripeCardField ref={cardFieldRef} onReadyChange={setCardReady} />
                  </div>
                )}

                {reviewError && <p role="alert" className="text-sm text-red-600">{reviewError}</p>}
                {submitError && <p role="alert" className="text-sm text-red-600">{submitError}</p>}

                {priceConfirm ? (
                  <div className="rounded-xl bg-sand/50 p-4 text-sm text-dusk-700">
                    <p>
                      The supplier&apos;s price just changed: previously {formatMoney(priceConfirm.previousTotal, priceConfirm.currency)},
                      now <span className="font-medium">{formatMoney(priceConfirm.newTotal, priceConfirm.currency)}</span>.
                      Would you like to continue at the new price?
                    </p>
                    <div className="mt-3 flex gap-3">
                      <button
                        disabled={submitting || (stripeConfigured && !cardReady)}
                        onClick={() => submitBooking(priceConfirm.newTotal)}
                        className="rounded-lg bg-tangerine text-white font-medium px-5 py-2 hover:bg-tangerine-dim disabled:opacity-60"
                      >
                        {submitting ? 'Booking…' : `Accept ${formatMoney(priceConfirm.newTotal, priceConfirm.currency)} and book`}
                      </button>
                      <button onClick={() => setPriceConfirm(null)} className="text-sm text-dusk-500">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-between">
                    <button onClick={() => setStep(0)} className="text-sm text-dusk-500 hover:text-dusk-900">Back</button>
                    <button
                      disabled={submitting || previewLoading || (stripeConfigured && !cardReady)}
                      onClick={() => submitBooking()}
                      className="rounded-lg bg-tangerine text-white font-medium px-6 py-3 hover:bg-tangerine-dim disabled:opacity-60"
                    >
                      {submitting ? 'Booking…' : 'Confirm and book'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </section>
    </main>
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
