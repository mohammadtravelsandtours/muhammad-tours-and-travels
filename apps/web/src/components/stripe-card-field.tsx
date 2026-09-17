'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { getStripe, getStripePublishableKey, StripeCardElement, StripeInstance } from '@/lib/stripe';

export interface StripeCardFieldHandle {
  /**
   * Returns a single-use Stripe PaymentMethod id to send as
   * paymentMethodToken, or null when Stripe isn't configured for this
   * deployment (nothing to collect — the booking proceeds through the
   * default MANUAL provider instead). Throws with a user-facing message
   * if the card is missing/invalid or Stripe rejects it.
   */
  createPaymentMethod: (billingName: string, billingEmail?: string) => Promise<string | null>;
}

/**
 * Renders nothing at all when NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY isn't
 * set — see lib/stripe.ts. When it is, mounts Stripe's own hosted Card
 * Element (an iframe Stripe controls), so a card number is typed
 * directly into Stripe's iframe and never touches this app's state,
 * network requests, or the backend — only the resulting PaymentMethod
 * id does.
 */
export const StripeCardField = forwardRef<StripeCardFieldHandle, { onReadyChange?: (ready: boolean) => void }>(
  function StripeCardField({ onReadyChange }, ref) {
    const configured = !!getStripePublishableKey();
    const mountRef = useRef<HTMLDivElement | null>(null);
    const stripeRef = useRef<StripeInstance | null>(null);
    const cardRef = useRef<StripeCardElement | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
      if (!configured) return;
      let cancelled = false;
      getStripe()
        .then((stripe) => {
          if (cancelled || !stripe || !mountRef.current) return;
          stripeRef.current = stripe;
          const card = stripe.elements().create('card', {
            style: { base: { fontSize: '15px', color: '#1c1917', '::placeholder': { color: '#a8a29e' } } },
          });
          card.mount(mountRef.current);
          card.on('change', (event) => {
            setError(event.error?.message ?? null);
            onReadyChange?.(event.complete);
          });
          cardRef.current = card;
        })
        .catch(() => setLoadError('Could not load the payment form. Please refresh and try again.'));
      return () => {
        cancelled = true;
        cardRef.current?.unmount();
        cardRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [configured]);

    useImperativeHandle(
      ref,
      () => ({
        async createPaymentMethod(billingName: string, billingEmail?: string) {
          if (!configured) return null;
          const stripe = stripeRef.current;
          const card = cardRef.current;
          if (!stripe || !card) {
            throw new Error('The payment form is still loading — please wait a moment and try again.');
          }
          const result = await stripe.createPaymentMethod({
            type: 'card',
            card,
            billing_details: { name: billingName, email: billingEmail },
          });
          if (result.error || !result.paymentMethod) {
            throw new Error(result.error?.message ?? 'Could not process the card. Please check the details and try again.');
          }
          return result.paymentMethod.id;
        },
      }),
      [configured],
    );

    if (!configured) return null;

    return (
      <div>
        <span className="block text-xs text-dusk-500 mb-1">Card details</span>
        <div ref={mountRef} className="rounded-md border border-sand px-3 py-3 bg-white" />
        {loadError && (
          <p role="alert" className="mt-1 text-xs text-red-600">
            {loadError}
          </p>
        )}
        {!loadError && error && (
          <p role="alert" className="mt-1 text-xs text-red-600">
            {error}
          </p>
        )}
      </div>
    );
  },
);
