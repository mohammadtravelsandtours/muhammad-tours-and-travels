'use client';

import { ReactNode, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { B2bHeader } from '@/components/b2b-header';
import { useAuth } from '@/lib/auth-context';
import { apiClient, ApiError, isPriceConfirmationRequired, newIdempotencyKey } from '@/lib/api-client';
import { FlightOffer, PassengerInput, PassengerType } from '@/lib/flight-types';
import { legLabel, legsFor, routeSummary } from '@/lib/itinerary';
import { formatDuration, formatMoney, formatTime, stopsLabel } from '@/lib/format';

const STEPS = ['Travelers', 'Contact', 'Review & confirm'] as const;
const TITLES_BY_TYPE: Record<PassengerType, string[]> = {
  ADULT: ['Mr', 'Mrs', 'Ms', 'Mx'],
  CHILD: ['Mstr', 'Miss'],
  INFANT: ['Mstr', 'Miss'],
};

function blankPassenger(type: PassengerType): PassengerInput {
  return {
    type,
    title: TITLES_BY_TYPE[type][0],
    firstName: '',
    lastName: '',
    dateOfBirth: '',
  };
}

function buildInitialPassengers(counts?: { adults: number; children: number; infants: number }): PassengerInput[] {
  if (!counts) return [blankPassenger('ADULT')];
  const list: PassengerInput[] = [];
  for (let i = 0; i < counts.adults; i++) list.push(blankPassenger('ADULT'));
  for (let i = 0; i < counts.children; i++) list.push(blankPassenger('CHILD'));
  for (let i = 0; i < counts.infants; i++) list.push(blankPassenger('INFANT'));
  return list;
}

/**
 * No payment-gateway step here: unlike apps/web, a B2B booking settles by
 * debiting the agency's own wallet server-side (BookingsService.createBooking)
 * — there's nothing for this page to collect for payment. The only ways
 * POST /bookings can fail that this page needs to show verbatim are the
 * agency-status gate (PENDING_APPROVAL/SUSPENDED) and insufficient
 * wallet/credit — both come back as a plain ApiError message, same as any
 * other booking failure, so they're never special-cased below.
 */
export default function BookOfferPage() {
  const params = useParams<{ offerId: string }>();
  const router = useRouter();
  const { user, accessToken, loading: authLoading } = useAuth();

  const [offer, setOffer] = useState<FlightOffer | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState(0);

  const [passengers, setPassengers] = useState<PassengerInput[]>([]);
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');

  const [reviewError, setReviewError] = useState<string | null>(null);
  const [previewTotal, setPreviewTotal] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [priceConfirm, setPriceConfirm] = useState<{ previousTotal: number; newTotal: number; currency: string } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const idempotencyKey = useMemo(() => newIdempotencyKey(), []);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace(`/login?next=${encodeURIComponent(`/offers/${params.offerId}/book`)}`);
    }
  }, [authLoading, user, router, params.offerId]);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getOffer(params.offerId)
      .then((o) => {
        if (cancelled) return;
        setOffer(o);
        setPassengers(buildInitialPassengers(o.passengerCounts));
      })
      .catch((err) => !cancelled && setLoadError(err instanceof ApiError ? err.message : 'Could not load this fare.'));
    return () => {
      cancelled = true;
    };
  }, [params.offerId]);

  useEffect(() => {
    if (user) {
      setContactName((prev) => prev || user.fullName);
      setContactEmail((prev) => prev || user.email);
    }
  }, [user]);

  function updatePassenger(index: number, patch: Partial<PassengerInput>) {
    setPassengers((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  function validatePassengers(): string | null {
    for (const [i, p] of passengers.entries()) {
      if (!p.firstName.trim() || !p.lastName.trim() || !p.dateOfBirth) {
        return `Passenger ${i + 1}: first name, last name, and date of birth are required.`;
      }
    }
    return null;
  }

  function validateContact(): string | null {
    if (!contactName.trim()) return 'Contact name is required.';
    if (!/^\S+@\S+\.\S+$/.test(contactEmail)) return 'Enter a valid contact email.';
    if (!/^\+?[0-9]{7,15}$/.test(contactPhone)) return 'Enter a valid contact phone number (e.g. +8801XXXXXXXXX).';
    return null;
  }

  async function goToReview() {
    const err = validateContact();
    if (err) {
      setReviewError(err);
      return;
    }
    setReviewError(null);
    setStep(2);
    setPreviewLoading(true);
    try {
      const preview = await apiClient.repriceOffer(params.offerId);
      setPreviewTotal(preview.stillAvailable ? preview.newTotal : null);
      if (!preview.stillAvailable) {
        setReviewError('This fare is no longer available from the supplier. Please search again.');
      } else if (preview.priceChanged) {
        setReviewError(null);
      }
    } catch {
      // The preview is a UX convenience only — POST /bookings always
      // reprices for real regardless, so a failed preview here isn't
      // fatal, just less informative until the actual submit.
      setPreviewTotal(null);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function submitBooking(acceptedTotalFare?: number) {
    if (!offer || !accessToken) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await apiClient.createBooking(
        {
          offerId: offer.id,
          passengers,
          contactName,
          contactEmail,
          contactPhone,
          whatsappNumber: whatsappNumber || undefined,
          acceptedTotalFare,
        },
        accessToken,
        idempotencyKey,
      );
      if (isPriceConfirmationRequired(result)) {
        setPriceConfirm({ previousTotal: result.previousTotal, newTotal: result.newTotal, currency: result.currency });
        return;
      }
      router.push(`/bookings/${result.id}`);
    } catch (err) {
      // Surface the server's message plainly — this is also how an
      // agency-status gate (pending approval / suspended) or an
      // insufficient-wallet-balance rejection reaches the agent, so it
      // must never be swallowed as a generic failure.
      setSubmitError(err instanceof ApiError ? err.message : 'Could not complete the booking. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading || (!user && !loadError)) return null;

  const legs = offer ? legsFor(offer) : [];

  return (
    <main className="min-h-screen">
      <B2bHeader />
      <section className="max-w-3xl mx-auto px-6 pt-10 pb-24">
        {loadError && (
          <p role="alert" className="text-sm text-red-600 bg-white border border-line rounded-lg p-4">
            {loadError}
          </p>
        )}

        {!loadError && !offer && <p className="text-sm text-slate-500">Loading…</p>}

        {offer && (
          <>
            <ol className="flex items-center gap-2 text-xs text-slate-500 mb-6">
              {STEPS.map((label, i) => (
                <li key={label} className={`flex items-center gap-2 ${i === step ? 'text-slate-900 font-medium' : ''}`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center border ${i <= step ? 'bg-teal text-white border-teal' : 'border-line'}`}>
                    {i + 1}
                  </span>
                  {label}
                  {i < STEPS.length - 1 && <span className="text-slate-500">—</span>}
                </li>
              ))}
            </ol>

            <div className="rounded-xl bg-white border border-line p-4 mb-6 text-sm text-slate-700 flex flex-wrap items-center justify-between gap-2">
              <span>
                {routeSummary(legs)}
                {legs.map((leg, i) => (
                  <span key={i}>
                    {' · '}
                    {legLabel(i, legs.length) ? `${legLabel(i, legs.length)} ` : ''}
                    {formatTime(leg.departureAt)} · {formatDuration(leg.durationMinutes)} · {stopsLabel(leg.stops)}
                  </span>
                ))}
              </span>
              <span className="font-medium text-slate-900">{formatMoney(offer.totalFare, offer.currency)}</span>
            </div>

            {step === 0 && (
              <div className="space-y-5">
                {passengers.map((p, i) => (
                  <div key={i} className="rounded-2xl bg-white border border-line shadow-sm p-5">
                    <p className="text-sm font-medium text-slate-900 mb-3">
                      Passenger {i + 1} · {p.type.toLowerCase()}
                    </p>
                    <div className="grid sm:grid-cols-3 gap-3 text-sm">
                      <Field label="Title">
                        <select
                          value={p.title}
                          onChange={(e) => updatePassenger(i, { title: e.target.value })}
                          className="w-full rounded-md border border-line px-3 py-2"
                        >
                          {TITLES_BY_TYPE[p.type].map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="First name">
                        <input value={p.firstName} onChange={(e) => updatePassenger(i, { firstName: e.target.value })} className="w-full rounded-md border border-line px-3 py-2" />
                      </Field>
                      <Field label="Last name">
                        <input value={p.lastName} onChange={(e) => updatePassenger(i, { lastName: e.target.value })} className="w-full rounded-md border border-line px-3 py-2" />
                      </Field>
                      <Field label="Date of birth">
                        <input type="date" value={p.dateOfBirth} onChange={(e) => updatePassenger(i, { dateOfBirth: e.target.value })} className="w-full rounded-md border border-line px-3 py-2" />
                      </Field>
                      <Field label="Nationality (optional)">
                        <input value={p.nationality ?? ''} onChange={(e) => updatePassenger(i, { nationality: e.target.value || undefined })} className="w-full rounded-md border border-line px-3 py-2" />
                      </Field>
                      <Field label="Passport number (optional)">
                        <input value={p.passportNumber ?? ''} onChange={(e) => updatePassenger(i, { passportNumber: e.target.value || undefined })} className="w-full rounded-md border border-line px-3 py-2" />
                      </Field>
                    </div>
                  </div>
                ))}
                <div className="flex justify-end">
                  <button
                    onClick={() => {
                      const err = validatePassengers();
                      if (err) setReviewError(err);
                      else {
                        setReviewError(null);
                        setStep(1);
                      }
                    }}
                    className="rounded-lg bg-slate-900 text-base font-medium px-6 py-2.5 hover:bg-slate-700"
                  >
                    Continue
                  </button>
                </div>
                {reviewError && <p role="alert" className="text-sm text-red-600">{reviewError}</p>}
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                <div className="rounded-2xl bg-white border border-line shadow-sm p-5 grid sm:grid-cols-2 gap-3 text-sm">
                  <Field label="Contact name">
                    <input value={contactName} onChange={(e) => setContactName(e.target.value)} className="w-full rounded-md border border-line px-3 py-2" />
                  </Field>
                  <Field label="Contact email">
                    <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className="w-full rounded-md border border-line px-3 py-2" />
                  </Field>
                  <Field label="Contact phone">
                    <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="+8801XXXXXXXXX" className="w-full rounded-md border border-line px-3 py-2" />
                  </Field>
                  <Field label="WhatsApp number (optional)">
                    <input value={whatsappNumber} onChange={(e) => setWhatsappNumber(e.target.value)} placeholder="+8801XXXXXXXXX" className="w-full rounded-md border border-line px-3 py-2" />
                  </Field>
                </div>
                {reviewError && <p role="alert" className="text-sm text-red-600">{reviewError}</p>}
                <div className="flex justify-between">
                  <button onClick={() => setStep(0)} className="text-sm text-slate-500 hover:text-slate-900">Back</button>
                  <button onClick={goToReview} className="rounded-lg bg-slate-900 text-base font-medium px-6 py-2.5 hover:bg-slate-700">
                    Review booking
                  </button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5">
                <div className="rounded-2xl bg-white border border-line shadow-sm p-5">
                  <p className="text-sm font-medium text-slate-900 mb-2">Travelers</p>
                  <ul className="text-sm text-slate-700 space-y-0.5">
                    {passengers.map((p, i) => (
                      <li key={i}>{p.title} {p.firstName} {p.lastName} · {p.type.toLowerCase()}</li>
                    ))}
                  </ul>
                  <p className="text-sm font-medium text-slate-900 mt-4 mb-2">Contact</p>
                  <p className="text-sm text-slate-700">{contactName} · {contactEmail} · {contactPhone}</p>
                </div>

                <div className="rounded-2xl bg-white border border-line shadow-sm p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-slate-500">
                      {previewLoading ? 'Checking current price with the supplier…' : 'Price re-verified with the supplier'}
                    </p>
                    <p className="text-2xl font-semibold text-slate-900">
                      {formatMoney(previewTotal ?? offer.totalFare, offer.currency)}
                    </p>
                  </div>
                  {previewTotal !== null && previewTotal !== offer.totalFare && (
                    <p className="mt-2 text-xs text-teal-dim">
                      The price has changed since you searched (was {formatMoney(offer.totalFare, offer.currency)}). The
                      final price is always re-confirmed again when you submit.
                    </p>
                  )}
                  <p className="mt-3 text-xs text-slate-500">
                    This amount will be debited from your agency wallet once the booking is confirmed with the supplier.
                  </p>
                </div>

                {reviewError && <p role="alert" className="text-sm text-red-600">{reviewError}</p>}
                {submitError && <p role="alert" className="text-sm text-red-600">{submitError}</p>}

                {priceConfirm ? (
                  <div className="rounded-xl bg-base p-4 text-sm text-slate-700">
                    <p>
                      The supplier's price just changed: previously {formatMoney(priceConfirm.previousTotal, priceConfirm.currency)},
                      now <span className="font-medium">{formatMoney(priceConfirm.newTotal, priceConfirm.currency)}</span>.
                      Would you like to continue at the new price?
                    </p>
                    <div className="mt-3 flex gap-3">
                      <button
                        disabled={submitting}
                        onClick={() => submitBooking(priceConfirm.newTotal)}
                        className="rounded-lg bg-teal text-white font-medium px-5 py-2 hover:bg-teal-dim disabled:opacity-60"
                      >
                        {submitting ? 'Booking…' : `Accept ${formatMoney(priceConfirm.newTotal, priceConfirm.currency)} and book`}
                      </button>
                      <button onClick={() => setPriceConfirm(null)} className="text-sm text-slate-500">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-between">
                    <button onClick={() => setStep(1)} className="text-sm text-slate-500 hover:text-slate-900">Back</button>
                    <button
                      disabled={submitting || previewLoading}
                      onClick={() => submitBooking()}
                      className="rounded-lg bg-teal text-white font-medium px-6 py-3 hover:bg-teal-dim disabled:opacity-60"
                    >
                      {submitting ? 'Booking…' : 'Confirm and book against wallet'}
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
      <span className="block text-xs text-slate-500 mb-1">{label}</span>
      {children}
    </label>
  );
}
