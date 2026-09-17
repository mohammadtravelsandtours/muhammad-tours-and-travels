import { Injectable, Logger } from '@nestjs/common';
import { ChargeRequest, ChargeResult, PaymentProvider, RefundRequest, RefundResult } from '../payment-provider.interface';

/**
 * DEMO / MOCK — simulates the "manual/offline payment collection"
 * process schema.prisma's Payment.provider comment names as Phase 2's
 * placeholder ("MANUAL" in Phase 2; real gateways plug in behind
 * PaymentProvider). It always succeeds instantly; it does not talk to
 * any real payment network, collect a card number, or move real money.
 * REQUIRES REAL PAYMENT GATEWAY INTEGRATION before this platform can
 * process an actual charge.
 */
@Injectable()
export class ManualPaymentProvider implements PaymentProvider {
  readonly providerCode = 'MANUAL';
  private readonly logger = new Logger(ManualPaymentProvider.name);

  async charge(request: ChargeRequest): Promise<ChargeResult> {
    this.logger.log(`[MOCK PAYMENT] Recording manual payment of ${request.amount} ${request.currency} for booking ${request.bookingReference}`);
    return {
      status: 'PAID',
      providerReference: `MANUAL-${request.bookingReference}`,
      raw: { note: 'DEMO/MOCK provider — no real payment gateway is connected', simulatedAt: new Date().toISOString() },
    };
  }

  async refund(request: RefundRequest): Promise<RefundResult> {
    this.logger.log(`[MOCK PAYMENT] Recording manual refund of ${request.amount} ${request.currency} for ${request.providerReference}`);
    return { status: 'REFUNDED', amount: request.amount };
  }
}
