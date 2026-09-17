'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { SiteHeader } from '@/components/site-header';
import { ContactWidget } from '@/components/contact-widget';
import { StripeCardField, StripeCardFieldHandle } from '@/components/stripe-card-field';
import { getStripePublishableKey } from '@/lib/stripe';
import { useAuth } from '@/lib/auth-context';
import { apiClient, ApiError, newIdempotencyKey } from '@/lib/api-client';
import { HajjUmrahBooking } from '@/lib/hajj-umrah-types';
import { formatDate, formatMoney } from '@/lib/format';

const STATUS_LABEL: Record<HajjUmrahBooking['status'], string> = {
  PENDING_DEPOSIT: 'Deposit pending',
  DEPOSIT_PAID: 'Deposit paid — balance due before departure',
  PARTIALLY_PAID: 'Partially paid — balance due before departure',
  FULLY_PAID: 'Fully paid',
  CANCELLED: 'Cancelled',
};

export default function HajjUmrahBookingDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, accessToken, loading: authLoading } = useAuth();

  const [booking, setBooking] = useState<HajjUmrahBooking | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [amount, setAmount] = useState('');
  const [payError, setPayError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  const stripeConfigured = useMemo(() => !!getStripePublishableKey(), []);
  const cardFieldRef = useRef<StripeCardFieldHandle>(null);
  const [cardReady, setCardReady] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.replace(`/login?next=${encodeURIComponent(`/hajj-umrah/bookings/${params.id}`)}`);
  }, [authLoading, user, router, params.id]);

  function reload(token: string) {
    apiClient
      .getHajjUmrahBooking(params.id, token)
      .then(setBooking)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : 'Could not load this booking.'));
  }

  useEffect(() => {
    if (accessToken) reload(accessToken);
  }, [accessToken, params.id]);

  async function submitPayment() {
    if (!booking || !accessToken) return;
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setPayError('Enter a valid amount.');
      return;
    }
    if (value > booking.balanceRemaining) {
      setPayError(`Amount cannot exceed the remaining balance of ${formatMoney(booking.balanceRemaining, booking.currency)}.`);
      return;
    }
    setPayError(null);
    setPaying(true);

    let paymentMethodToken: string | undefined;
    try {
      paymentMethodToken = (await cardFieldRef.current?.createPaymentMethod(booking.leadPilgrimName, booking.contactEmail)) ?? undefined;
    } catch (err) {
      setPayError(err instanceof Error ? err.message : 'Could not process the card. Please check the details and try again.');
      setPaying(false);
      return;
    }

    try {
      const updated = await apiClient.addHajjUmrahPayment(booking.id, { amount: value, paymentMethodToken }, accessToken, newIdempotencyKey());
      setBooking(updated);
      setAmount('');
    } catch (err) {
      setPayError(err instanceof ApiError ? err.message : 'Could not process this payment. Please try again.');
    } finally {
      setPaying(false);
    }
  }

  if (authLoading || !user) return null;

  return (
    <main className="min-h-screen">
      <SiteHeader />
      <section className="max-w-2xl mx-auto px-6 pt-10 pb-24">
        {loadError && (
          <p role="alert" className="text-sm text-red-600 bg-white border border-sand rounded-lg p-4">
            {loadError}
          </p>
        )}
        {!loadError && !booking && <p className="text-sm text-dusk-500">Loading booking…</p>}

        {booking && (
          <>
            <div className="flex items-center justify-between gap-3">
              <h1 className="font-display text-2xl text-dusk-900">Booking {booking.bookingReference}</h1>
              <span className="text-xs rounded-full bg-sand text-dusk-700 px-2.5 py-1 font-medium">{STATUS_LABEL[booking.status]}</span>
            </div>

            {booking.package && (
              <p className="mt-1 text-sm text-dusk-500">
                {booking.package.title} · {formatDate(booking.package.departureDate)} — {formatDate(booking.package.returnDate)}
              </p>
            )}

            <div className="mt-5 rounded-2xl bg-white border border-sand shadow-sm p-5 text-sm space-y-2">
              <Row label="Lead pilgrim">{booking.leadPilgrimName}</Row>
              <Row label="Pilgrims">{booking.pilgrims}</Row>
              <Row label="Contact">{booking.contactEmail} · {booking.contactPhone}</Row>
              <Row label="Total">{formatMoney(booking.totalAmount, booking.currency)}</Row>
              <Row label="Paid so far">{formatMoney(booking.amountPaid, booking.currency)}</Row>
              <Row label="Balance remaining">{formatMoney(booking.balanceRemaining, booking.currency)}</Row>
            </div>

            {booking.payments.length > 0 && (
              <div className="mt-4 rounded-2xl bg-white border border-sand shadow-sm p-5">
                <p className="text-sm font-medium text-dusk-900 mb-2">Payment history</p>
                <div className="space-y-1.5 text-sm">
                  {booking.payments.map((p) => (
                    <div key={p.id} className="flex items-center justify-between">
                      <span className="text-dusk-500">
                        {formatDate(p.createdAt)} · {p.status.toLowerCase()}
                      </span>
                      <span className="text-dusk-900 font-medium">{formatMoney(p.amount, p.currency)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {booking.status !== 'FULLY_PAID' && booking.status !== 'CANCELLED' && (
              <div className="mt-4 rounded-2xl bg-white border border-sand shadow-sm p-5 space-y-3">
                <p className="text-sm font-medium text-dusk-900">Make a payment</p>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={`Up to ${booking.balanceRemaining}`}
                  className="w-full rounded-md border border-sand px-3 py-2 text-sm"
                />
                {stripeConfigured && (
                  <div>
                    <p className="text-xs text-dusk-500 mb-2">Card details</p>
                    <StripeCardField ref={cardFieldRef} onReadyChange={setCardReady} />
                  </div>
                )}
                {payError && <p role="alert" className="text-sm text-red-600">{payError}</p>}
                <button
                  onClick={submitPayment}
                  disabled={paying || (stripeConfigured && !cardReady)}
                  className="rounded-lg bg-tangerine text-white font-medium px-6 py-2.5 hover:bg-tangerine-dim disabled:opacity-60"
                >
                  {paying ? 'Processing…' : 'Submit payment'}
                </button>
              </div>
            )}

            <div className="mt-6">
              <ContactWidget prefillMessage={`Hi, I have a question about my Hajj/Umrah booking ${booking.bookingReference}.`} />
            </div>
          </>
        )}
      </section>
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-dusk-500">{label}</span>
      <span className="text-dusk-900 font-medium text-right">{children}</span>
    </div>
  );
}
