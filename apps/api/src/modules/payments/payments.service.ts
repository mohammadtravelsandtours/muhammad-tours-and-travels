import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentProvider } from './payment-provider.interface';
import { PAYMENT_PROVIDER } from './payment-provider.token';
import { MetricsService } from '../metrics/metrics.service';

/**
 * B2C/CORPORATE bookings are settled through here (a Payment row);
 * B2B bookings are settled through WalletService instead (an agency's
 * own funds, never a card) — see BookingsService.createBooking, which
 * picks one or the other based on whether the actor has an agencyId.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly metrics: MetricsService,
  ) {}

  /** Idempotent on bookingId's own idempotencyKey — a retried booking request must never charge twice. */
  async chargeForBooking(bookingId: string, bookingReference: string, amount: number, currency: string, idempotencyKey: string, paymentMethodToken?: string) {
    const existing = await this.prisma.payment.findUnique({ where: { idempotencyKey } });
    if (existing) return existing;

    const payment = await this.prisma.payment.create({
      data: {
        bookingId,
        provider: this.provider.providerCode,
        amount,
        currency,
        status: 'PENDING',
        idempotencyKey,
      },
    });

    try {
      const result = await this.provider.charge({ bookingId, bookingReference, amount, currency, description: `Booking ${bookingReference}`, paymentMethodToken });
      this.metrics.incrementCounter('payments_processed_total', { provider: this.provider.providerCode, status: result.status });
      return this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: result.status,
          providerReference: result.providerReference ?? null,
        },
      });
    } catch (err) {
      this.logger.error(`Payment provider ${this.provider.providerCode} threw for booking ${bookingReference}: ${(err as Error).message}`);
      this.metrics.incrementCounter('payments_processed_total', { provider: this.provider.providerCode, status: 'FAILED' });
      return this.prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
    }
  }

  /**
   * Called from BookingsService.performCancellation for a non-wallet
   * (B2C/CORPORATE) booking. Looks up the booking's own payment rather
   * than taking an amount/reference from the caller, so a cancellation
   * can never refund more than was actually charged. Not idempotent by
   * a caller-supplied key the way chargeForBooking is — a booking is
   * only ever cancelled once (the state machine's terminal states
   * prevent a second attempt), so retrying this specific call is not a
   * normal path the way a retried booking request is.
   */
  async refundPayment(bookingId: string, amount: number, currency: string) {
    const payment = await this.prisma.payment.findFirst({ where: { bookingId }, orderBy: { createdAt: 'desc' } });
    return this.settleRefund(payment, bookingId, amount, currency);
  }

  /**
   * Hotel-booking counterpart of chargeForBooking — writes hotelBookingId
   * instead of bookingId on the same payments table, so hotels settle
   * through the exact same provider/ledger path as flights (see Payment's
   * doc comment in schema.prisma). Idempotent the same way.
   */
  async chargeForHotelBooking(hotelBookingId: string, bookingReference: string, amount: number, currency: string, idempotencyKey: string, paymentMethodToken?: string) {
    const existing = await this.prisma.payment.findUnique({ where: { idempotencyKey } });
    if (existing) return existing;

    const payment = await this.prisma.payment.create({
      data: {
        hotelBookingId,
        provider: this.provider.providerCode,
        amount,
        currency,
        status: 'PENDING',
        idempotencyKey,
      },
    });

    try {
      const result = await this.provider.charge({ bookingId: hotelBookingId, bookingReference, amount, currency, description: `Hotel booking ${bookingReference}`, paymentMethodToken });
      this.metrics.incrementCounter('payments_processed_total', { provider: this.provider.providerCode, status: result.status });
      return this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: result.status, providerReference: result.providerReference ?? null },
      });
    } catch (err) {
      this.logger.error(`Payment provider ${this.provider.providerCode} threw for hotel booking ${bookingReference}: ${(err as Error).message}`);
      this.metrics.incrementCounter('payments_processed_total', { provider: this.provider.providerCode, status: 'FAILED' });
      return this.prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
    }
  }

  /** Hotel-booking counterpart of refundPayment — see its doc comment. */
  async refundHotelPayment(hotelBookingId: string, amount: number, currency: string) {
    const payment = await this.prisma.payment.findFirst({ where: { hotelBookingId }, orderBy: { createdAt: 'desc' } });
    return this.settleRefund(payment, hotelBookingId, amount, currency);
  }

  /**
   * Hajj/Umrah counterpart of chargeForBooking/chargeForHotelBooking —
   * writes hajjUmrahBookingId instead (see Payment's doc comment in
   * schema.prisma). Unlike the other two, this is called MORE THAN ONCE
   * against the same target id over the booking's lifetime (the initial
   * deposit, then any later installments) — each call still only ever
   * charges once per its own idempotencyKey, exactly like the other two;
   * a fresh key per call is what makes repeat charges against the same
   * booking intentional rather than accidental double-charges. See
   * HajjUmrahService.createBooking / addPayment for the two call sites.
   */
  async chargeForHajjUmrahBooking(hajjUmrahBookingId: string, bookingReference: string, amount: number, currency: string, idempotencyKey: string, paymentMethodToken?: string) {
    const existing = await this.prisma.payment.findUnique({ where: { idempotencyKey } });
    if (existing) return existing;

    const payment = await this.prisma.payment.create({
      data: {
        hajjUmrahBookingId,
        provider: this.provider.providerCode,
        amount,
        currency,
        status: 'PENDING',
        idempotencyKey,
      },
    });

    try {
      const result = await this.provider.charge({ bookingId: hajjUmrahBookingId, bookingReference, amount, currency, description: `Hajj/Umrah booking ${bookingReference}`, paymentMethodToken });
      this.metrics.incrementCounter('payments_processed_total', { provider: this.provider.providerCode, status: result.status });
      return this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: result.status, providerReference: result.providerReference ?? null },
      });
    } catch (err) {
      this.logger.error(`Payment provider ${this.provider.providerCode} threw for Hajj/Umrah booking ${bookingReference}: ${(err as Error).message}`);
      this.metrics.incrementCounter('payments_processed_total', { provider: this.provider.providerCode, status: 'FAILED' });
      return this.prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
    }
  }

  private async settleRefund(
    payment: { id: string; status: string; providerReference: string | null } | null,
    targetId: string,
    amount: number,
    currency: string,
  ) {
    if (!payment) {
      this.logger.warn(`No payment record for ${targetId} — nothing for the provider to refund (the original charge may itself have failed).`);
      return null;
    }
    if (payment.status !== 'PAID') {
      this.logger.warn(`Payment ${payment.id} for ${targetId} is ${payment.status}, not PAID — skipping the provider refund call.`);
      return payment;
    }
    if (!this.provider.refund) {
      throw new Error(`Payment provider ${this.provider.providerCode} does not support refunds`);
    }

    const result = await this.provider.refund({ providerReference: payment.providerReference ?? '', amount, currency });
    return this.prisma.payment.update({ where: { id: payment.id }, data: { status: result.status } });
  }
}
