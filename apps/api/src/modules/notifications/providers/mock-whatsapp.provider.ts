import { Injectable, Logger } from '@nestjs/common';
import { WhatsAppMessageRequest, WhatsAppMessageResult, WhatsAppProvider } from '../whatsapp-provider.interface';

/**
 * DEMO / MOCK — logs what would be sent instead of actually sending
 * anything, the default until WHATSAPP_PROVIDER_STRATEGY=META is set
 * AND real credentials are configured (see notifications.module.ts).
 */
@Injectable()
export class MockWhatsAppProvider implements WhatsAppProvider {
  readonly providerCode = 'MOCK';
  private readonly logger = new Logger(MockWhatsAppProvider.name);

  async sendMessage(request: WhatsAppMessageRequest): Promise<WhatsAppMessageResult> {
    this.logger.log(`[MOCK WHATSAPP] Would send to ${request.toPhone}: "${request.message}"`);
    return { status: 'SENT', providerMessageId: `MOCK-${Date.now()}` };
  }
}
