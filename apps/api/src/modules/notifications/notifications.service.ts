import { Inject, Injectable, Logger } from '@nestjs/common';
import { WhatsAppProvider } from './whatsapp-provider.interface';
import { WHATSAPP_PROVIDER } from './whatsapp-provider.token';

/**
 * EMAIL IS STILL DEMO/MOCK for every method here — logs what would be
 * sent instead of actually sending anything. REQUIRES REAL INTEGRATION
 * (an email provider such as SES/SendGrid) before an email reaches a
 * real inbox; wiring one in means implementing a small interface
 * against that provider's API and swapping it in here, exactly like a
 * payment provider or supplier adapter. WHATSAPP is different: since
 * the Hajj/Umrah phase, sendHajjUmrahBookingConfirmed also sends a REAL
 * WhatsApp message through WhatsAppProvider (WHATSAPP_PROVIDER) —
 * MockWhatsAppProvider by default, or WhatsAppCloudApiProvider
 * (Meta's real Cloud API) when WHATSAPP_PROVIDER_STRATEGY=META and
 * credentials are configured (see notifications.module.ts). Never put a
 * real secret (API key) anywhere but an env var.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(@Inject(WHATSAPP_PROVIDER) private readonly whatsapp: WhatsAppProvider) {}

  async sendBookingConfirmed(input: { toEmail: string; toName: string; bookingReference: string; totalAmount: number; currency: string }): Promise<void> {
    this.logger.log(
      `[MOCK NOTIFICATION] Would email ${input.toName} <${input.toEmail}>: "Booking ${input.bookingReference} confirmed — ${input.totalAmount} ${input.currency}"`,
    );
  }

  async sendTicketIssued(input: { toEmail: string; toName: string; bookingReference: string; ticketNumbers: string[] }): Promise<void> {
    this.logger.log(
      `[MOCK NOTIFICATION] Would email ${input.toName} <${input.toEmail}>: "E-tickets issued for ${input.bookingReference}: ${input.ticketNumbers.join(', ')}"`,
    );
  }

  async sendBookingFailed(input: { toEmail: string; toName: string; bookingReference: string; reason?: string }): Promise<void> {
    this.logger.log(
      `[MOCK NOTIFICATION] Would email ${input.toName} <${input.toEmail}>: "Booking ${input.bookingReference} could not be completed${input.reason ? ` (${input.reason})` : ''}"`,
    );
  }

  async sendCorporateApprovalRequested(input: { toEmail: string; bookingReference: string }): Promise<void> {
    this.logger.log(`[MOCK NOTIFICATION] Would email approver <${input.toEmail}>: "New booking ${input.bookingReference} awaiting your approval"`);
  }

  /**
   * Phase 14 — self-service password reset. Mock like every other email
   * here: logs the link instead of sending it. `resetUrl` already
   * contains the plaintext token as a query param (the token itself is
   * only ever stored hashed — see AuthService.requestPasswordReset) and
   * expires after a short, fixed window regardless of whether this
   * "email" is ever actually read.
   */
  async sendPasswordResetRequested(input: { toEmail: string; toName: string; resetUrl: string }): Promise<void> {
    this.logger.log(
      `[MOCK NOTIFICATION] Would email ${input.toName} <${input.toEmail}>: "Reset your password: ${input.resetUrl} (expires in 30 minutes)"`,
    );
  }

  /**
   * Email leg is mock, like every other method here. The WhatsApp leg is
   * real (see this class's doc comment) — a delivery failure here is
   * logged but never thrown, so a WhatsApp outage or missing
   * configuration can never fail the booking/payment call that
   * triggered this notification.
   */
  async sendHajjUmrahBookingConfirmed(input: { toEmail: string; toName: string; toPhone: string; bookingReference: string; amountPaid: number; totalAmount: number; currency: string }): Promise<void> {
    this.logger.log(
      `[MOCK NOTIFICATION] Would email ${input.toName} <${input.toEmail}>: "Hajj/Umrah booking ${input.bookingReference} — ${input.amountPaid}/${input.totalAmount} ${input.currency} paid"`,
    );

    const message = `Assalamu Alaikum ${input.toName}, your Hajj/Umrah booking ${input.bookingReference} is confirmed. ${input.amountPaid} of ${input.totalAmount} ${input.currency} paid so far. — Muhammad Tours and Travels`;
    try {
      const result = await this.whatsapp.sendMessage({ toPhone: input.toPhone, message });
      if (result.status === 'FAILED') {
        this.logger.warn(`WhatsApp notification for booking ${input.bookingReference} was not sent: ${result.failureReason ?? 'unknown reason'}`);
      }
    } catch (err) {
      this.logger.error(`WhatsApp provider threw for booking ${input.bookingReference}: ${(err as Error).message}`);
    }
  }
}
