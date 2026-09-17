import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from './notifications.service';
import { MockWhatsAppProvider } from './providers/mock-whatsapp.provider';
import { WhatsAppCloudApiProvider } from './providers/whatsapp-cloud-api.provider';
import { WHATSAPP_PROVIDER } from './whatsapp-provider.token';
import { WhatsAppProvider } from './whatsapp-provider.interface';
import { AppConfig } from '../../config/configuration';

const logger = new Logger('NotificationsModule');

/**
 * Same dual-gate shape as PaymentsModule's Stripe/Manual selection: both
 * providers are always constructed, but only one is bound to
 * WHATSAPP_PROVIDER — the symbol every NotificationsService injection
 * point actually depends on. META is only chosen when BOTH
 * `whatsappProviderStrategy === 'META'` AND WhatsApp is actually
 * configured (WHATSAPP_ACCESS_TOKEN/WHATSAPP_PHONE_NUMBER_ID set) —
 * requesting META without credentials falls back to MOCK with a boot
 * warning rather than booting into a messaging path that can only ever
 * fail.
 */
@Module({
  providers: [
    MockWhatsAppProvider,
    WhatsAppCloudApiProvider,
    {
      provide: WHATSAPP_PROVIDER,
      useFactory: (config: ConfigService<AppConfig, true>, mock: MockWhatsAppProvider, meta: WhatsAppCloudApiProvider): WhatsAppProvider => {
        const strategy = config.get('whatsappProviderStrategy', { infer: true });
        if (strategy === 'META') {
          if (meta.isConfigured()) {
            logger.log('WhatsApp provider: META (real Cloud API)');
            return meta;
          }
          logger.warn('WHATSAPP_PROVIDER_STRATEGY=META but WHATSAPP_ACCESS_TOKEN/WHATSAPP_PHONE_NUMBER_ID are not both set — falling back to MockWhatsAppProvider. No real WhatsApp messages will be sent.');
        }
        return mock;
      },
      inject: [ConfigService, MockWhatsAppProvider, WhatsAppCloudApiProvider],
    },
    NotificationsService,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
