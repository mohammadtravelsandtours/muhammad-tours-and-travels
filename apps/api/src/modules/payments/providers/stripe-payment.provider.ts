import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../../config/configuration';
import { ChargeRequest, ChargeResult, PaymentProvider, RefundRequest, RefundResult } from '../payment-provider.interface';

/**
 * Real Stripe integration, called directly against Stripe's REST API via
 * `fetch` (no `stripe` SDK dependency — see configuration.ts's doc
 * comment on why that's a legitimate choice here, not a shortcut).
 *
 * Selected only when PAYMENT_PROVIDER_STRATEGY=STRIPE AND
 * STRIPE_SECRET_KEY is set — see payments.module.ts, which falls back to
 * ManualPaymentProvider with a boot warning otherwise, exactly like
 * SupplierRegistry's dual gate for flight suppliers. Even once selected,
 * every `charge()` call still requires the caller to have supplied a
 * `paymentMethodToken` (see ChargeRequest's doc comment) — this backend
 * never collects or sees a raw card number, only a token Stripe's own
 * hosted fields (Stripe.js / Payment Element) produced client-side.
 *
 * NOT EXERCISED AGAINST A LIVE STRIPE ACCOUNT in this build (no network
 * access to api.stripe.com from this environment) — written strictly to
 * Stripe's documented REST contract (PaymentIntents API,
 * https://stripe.com/docs/api/payment_intents) and this codebase's own
 * PaymentProvider contract. Treat as a real-but-unverified adapter: dry
 * run against a Stripe test-mode key before ever pointing it at
 * sk_live_*.
 */
@Injectable()
export class StripePaymentProvider implements PaymentProvider {
  readonly providerCode = 'STRIPE';
  private readonly logger = new Logger(StripePaymentProvider.name);
  private static readonly API_BASE = 'https://api.stripe.com/v1';

  // Stripe (like most card networks) wants zero-decimal currencies
  // (JPY, KRW, ...) passed as a whole integer and every other currency
  // passed as the smallest unit (cents) — see
  // https://stripe.com/docs/currencies#zero-decimal.
  private static readonly ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'HUF', 'TWD', 'UGX', 'BIF', 'DJF', 'GNF', 'KMF', 'MGA', 'PYG', 'RWF', 'VUV', 'XAF', 'XOF', 'XPF']);

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  private get settings() {
    return this.config.get('integrations', { infer: true }).stripe;
  }

  isConfigured(): boolean {
    return !!this.settings;
  }

  async charge(request: ChargeRequest): Promise<ChargeResult> {
    const settings = this.settings;
    if (!settings) {
      return { status: 'FAILED', failureReason: 'Stripe is not configured (STRIPE_SECRET_KEY unset).' };
    }
    if (!request.paymentMethodToken) {
      // Never guess a payment method or fall back to a stored one on the
      // caller's behalf — that decision belongs to the checkout flow,
      // not this adapter.
      return { status: 'FAILED', failureReason: 'No payment method token supplied — cannot charge a real gateway without one.' };
    }

    const amountMinorUnits = this.toMinorUnits(request.amount, request.currency);

    try {
      const intent = await this.call(settings.secretKey, 'POST', '/payment_intents', {
        amount: String(amountMinorUnits),
        currency: request.currency.toLowerCase(),
        payment_method: request.paymentMethodToken,
        confirm: 'true',
        confirmation_method: 'automatic',
        off_session: 'true',
        description: request.description ?? `Booking ${request.bookingReference}`,
        // Stripe surfaces the account's own metadata search by this —
        // useful for reconciling a Stripe dashboard charge back to a
        // booking without us storing anything Stripe-specific ourselves.
        'metadata[bookingId]': request.bookingId,
        'metadata[bookingReference]': request.bookingReference,
      });

      if (intent.status === 'succeeded') {
        return { status: 'PAID', providerReference: intent.id, raw: intent };
      }
      // requires_action / requires_payment_method / canceled / etc. — a
      // real gateway has failure modes a mock never does (3DS challenges,
      // a declined card); this backend has no UI to resume a 3DS
      // challenge yet, so treat anything short of "succeeded" as failed
      // rather than leaving a booking in limbo.
      return {
        status: 'FAILED',
        providerReference: intent.id,
        failureReason: `Stripe PaymentIntent ended in status "${intent.status}" — not confirmed as paid.`,
        raw: intent,
      };
    } catch (err) {
      this.logger.error(`Stripe charge failed for booking ${request.bookingReference}: ${(err as Error).message}`);
      return { status: 'FAILED', failureReason: (err as Error).message };
    }
  }

  async refund(request: RefundRequest): Promise<RefundResult> {
    const settings = this.settings;
    if (!settings) return { status: 'FAILED' };

    try {
      const refund = await this.call(settings.secretKey, 'POST', '/refunds', {
        payment_intent: request.providerReference,
        amount: String(this.toMinorUnits(request.amount, request.currency)),
      });
      if (refund.status === 'succeeded' || refund.status === 'pending') {
        return { status: 'REFUNDED', amount: request.amount };
      }
      return { status: 'FAILED' };
    } catch (err) {
      this.logger.error(`Stripe refund failed for ${request.providerReference}: ${(err as Error).message}`);
      return { status: 'FAILED' };
    }
  }

  private toMinorUnits(amount: number, currency: string): number {
    const isZeroDecimal = StripePaymentProvider.ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase());
    return Math.round(isZeroDecimal ? amount : amount * 100);
  }

  /** Stripe's REST API takes application/x-www-form-urlencoded, not JSON, and authenticates via HTTP Basic with the secret key as the username and an empty password. */
  private async call(secretKey: string, method: string, path: string, form: Record<string, string>): Promise<Record<string, any>> {
    const body = new URLSearchParams(form).toString();
    const res = await fetch(`${StripePaymentProvider.API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    const json = (await res.json().catch(() => ({}))) as Record<string, any>;
    if (!res.ok) {
      const message = json?.error?.message ?? `Stripe API error ${res.status}`;
      throw new Error(message);
    }
    return json;
  }
}
