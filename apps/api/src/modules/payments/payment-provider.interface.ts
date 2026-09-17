/**
 * Deliberately mirrors FlightSupplierAdapter's shape (packages/types/src/
 * flights.ts) — same "abstraction first, mock implementation, real
 * gateway plugs in behind the interface later" pattern the mega-prompt
 * requires for suppliers, applied to payments. PaymentsService depends
 * only on this interface, never on a concrete provider — see
 * ManualPaymentProvider for the mock/manual implementation Phase 2
 * ships with (matches Payment.provider's schema.prisma comment:
 * "'MANUAL' in Phase 2; real gateways plug in behind PaymentProvider").
 *
 * A REAL gateway (Stripe, a local payment aggregator, etc.) is NOT
 * IMPLEMENTED here — wiring one in means adding a new class that
 * implements this interface and registering it below, exactly like
 * adding a 6th flight supplier, and it must never accept or log a raw
 * card number/secret; that belongs to the gateway's own hosted
 * fields/redirect flow, never this backend.
 */
export interface ChargeRequest {
  bookingId: string;
  bookingReference: string;
  amount: number;
  currency: string;
  description?: string;
  /**
   * A gateway-issued, single-use token representing a card/payment
   * method already collected by the gateway's OWN hosted fields or
   * redirect flow (e.g. a Stripe PaymentMethod id) — never a raw card
   * number. Optional because PaymentsService's callers (BookingsService)
   * don't yet collect one from the frontend; a real gateway provider
   * (see StripePaymentProvider) must fail the charge clearly with
   * `status: 'FAILED'` when this is absent rather than guessing or
   * silently succeeding.
   */
  paymentMethodToken?: string;
}

export interface ChargeResult {
  status: 'PAID' | 'FAILED';
  providerReference?: string;
  failureReason?: string;
  raw?: Record<string, unknown>;
}

export interface RefundRequest {
  providerReference: string;
  amount: number;
  currency: string;
}

export interface RefundResult {
  status: 'REFUNDED' | 'PARTIALLY_REFUNDED' | 'FAILED';
  amount?: number;
}

export interface PaymentProvider {
  readonly providerCode: string;
  charge(request: ChargeRequest): Promise<ChargeResult>;
  refund?(request: RefundRequest): Promise<RefundResult>;
}
