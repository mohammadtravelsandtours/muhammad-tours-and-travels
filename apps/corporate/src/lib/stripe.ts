/**
 * Thin client-side wrapper around Stripe.js — loaded from Stripe's own
 * CDN via a plain <script> tag rather than the `@stripe/stripe-js` npm
 * package, since this monorepo has no reachable npm registry to install
 * a new dependency from (see docs/ROADMAP.md). Stripe.js is the ONLY
 * thing allowed to ever see a card number: this file never does, and
 * neither does anything importing it — the only value that ever leaves
 * the browser is the single-use PaymentMethod id Stripe hands back.
 *
 * Entirely inert (no script is ever injected, nothing renders) unless
 * NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is set at build time, which keeps
 * the default MANUAL-provider checkout flow completely unchanged for
 * every deployment that hasn't opted into a real Stripe account (see
 * PAYMENT_PROVIDER_STRATEGY / STRIPE_SECRET_KEY in .env.example).
 *
 * Identical to apps/web's copy of this file — CORPORATE-channel bookings
 * settle through the same PaymentsService/StripePaymentProvider path as
 * B2C ones (see BookingsService.createBooking), so the client-side
 * collection contract is the same. Kept as a per-app copy rather than a
 * shared package since this monorepo has no workspace-linking mechanism
 * available without a reachable npm registry.
 */

export interface StripePaymentMethodResult {
  paymentMethod?: { id: string };
  error?: { message?: string };
}

export interface StripeCardElement {
  mount: (target: HTMLElement) => void;
  unmount: () => void;
  on: (event: 'change', handler: (e: { complete: boolean; error?: { message: string } }) => void) => void;
}

export interface StripeElements {
  create: (type: 'card', options?: Record<string, unknown>) => StripeCardElement;
}

export interface StripeInstance {
  elements: () => StripeElements;
  createPaymentMethod: (args: {
    type: 'card';
    card: StripeCardElement;
    billing_details?: { name?: string; email?: string };
  }) => Promise<StripePaymentMethodResult>;
}

declare global {
  interface Window {
    Stripe?: (publishableKey: string) => StripeInstance;
  }
}

const STRIPE_JS_URL = 'https://js.stripe.com/v3/';
let stripeJsPromise: Promise<void> | null = null;

function loadStripeJs(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Stripe.js can only load in the browser'));
  if (window.Stripe) return Promise.resolve();
  if (stripeJsPromise) return stripeJsPromise;

  stripeJsPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${STRIPE_JS_URL}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Stripe.js')));
      return;
    }
    const script = document.createElement('script');
    script.src = STRIPE_JS_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Stripe.js'));
    document.head.appendChild(script);
  });
  return stripeJsPromise;
}

/** Undefined when this deployment hasn't opted into a real Stripe account — the card form stays hidden and checkout proceeds exactly as it did before Stripe existed. */
export function getStripePublishableKey(): string | undefined {
  return process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || undefined;
}

/** Resolves to null (never rejects) when Stripe isn't configured — callers treat that as "nothing to collect", not an error. */
export async function getStripe(): Promise<StripeInstance | null> {
  const key = getStripePublishableKey();
  if (!key) return null;
  await loadStripeJs();
  if (!window.Stripe) return null;
  return window.Stripe(key);
}
