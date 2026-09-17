import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../../config/configuration';
import { WhatsAppMessageRequest, WhatsAppMessageResult, WhatsAppProvider } from '../whatsapp-provider.interface';

/**
 * Real Meta WhatsApp Cloud API integration, called directly via `fetch`
 * against the Graph API's messages endpoint — same "no vendor SDK, just
 * fetch against a documented REST API" choice as StripePaymentProvider/
 * AmadeusFlightSupplierAdapter (see those classes' own doc comments for
 * why that's a legitimate choice here, not a shortcut).
 *
 * Selected only when WHATSAPP_PROVIDER_STRATEGY=META AND
 * integrations.whatsapp is configured (WHATSAPP_ACCESS_TOKEN +
 * WHATSAPP_PHONE_NUMBER_ID both set) — see notifications.module.ts,
 * which falls back to MockWhatsAppProvider with a boot warning
 * otherwise, exactly like PaymentsModule's Stripe/Manual dual gate.
 *
 * Sends a free-form text message, which Meta only allows within the
 * 24-hour "customer service window" after the customer last messaged
 * the business number, OR via a pre-approved message template outside
 * that window — this implementation always sends a plain text message
 * (type: "text") and does NOT implement template messages, so a
 * message to a customer who has never messaged the business's WhatsApp
 * number first, or more than 24h after their last message, will be
 * rejected by Meta's API outside that window in a real deployment. That
 * is a real limitation of this implementation, not of the interface —
 * see docs/ROADMAP.md.
 *
 * NOT EXERCISED AGAINST A LIVE META ACCOUNT in this build (no network
 * access to graph.facebook.com from this environment) — written
 * strictly to Meta's documented Cloud API contract
 * (https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages)
 * and this codebase's own WhatsAppProvider contract. Treat as a
 * real-but-unverified adapter: dry run against a Meta test number
 * before pointing it at a production WhatsApp Business number.
 */
@Injectable()
export class WhatsAppCloudApiProvider implements WhatsAppProvider {
  readonly providerCode = 'META';
  private readonly logger = new Logger(WhatsAppCloudApiProvider.name);
  private static readonly API_BASE = 'https://graph.facebook.com/v19.0';

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  private get settings() {
    return this.config.get('integrations', { infer: true }).whatsapp;
  }

  isConfigured(): boolean {
    return !!this.settings;
  }

  async sendMessage(request: WhatsAppMessageRequest): Promise<WhatsAppMessageResult> {
    const settings = this.settings;
    if (!settings) {
      return { status: 'FAILED', failureReason: 'WhatsApp Cloud API is not configured (WHATSAPP_ACCESS_TOKEN/WHATSAPP_PHONE_NUMBER_ID unset).' };
    }

    // Meta wants digits only (no "+", spaces, or dashes) in the "to" field.
    const to = request.toPhone.replace(/[^0-9]/g, '');

    try {
      const res = await fetch(`${WhatsAppCloudApiProvider.API_BASE}/${settings.phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${settings.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: request.message },
        }),
      });

      const json = (await res.json().catch(() => ({}))) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      if (!res.ok) {
        const failureReason = json?.error?.message ?? `WhatsApp Cloud API error ${res.status}`;
        this.logger.error(`WhatsApp send to ${to} failed: ${failureReason}`);
        return { status: 'FAILED', failureReason };
      }

      const messageId = json?.messages?.[0]?.id as string | undefined;
      return { status: 'SENT', providerMessageId: messageId };
    } catch (err) {
      this.logger.error(`WhatsApp Cloud API request threw for ${to}: ${(err as Error).message}`);
      return { status: 'FAILED', failureReason: (err as Error).message };
    }
  }
}
