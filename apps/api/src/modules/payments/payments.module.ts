import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentsService } from './payments.service';
import { ManualPaymentProvider } from './providers/manual-payment.provider';
import { StripePaymentProvider } from './providers/stripe-payment.provider';
import { PAYMENT_PROVIDER } from './payment-provider.token';
import { PaymentProvider } from './payment-provider.interface';
import { AppConfig } from '../../config/configuration';
import { MetricsModule } from '../metrics/metrics.module';

const logger = new Logger('PaymentsModule');

/**
 * Both providers are always constructed (so admin/health tooling can see
 * a StripePaymentProvider exists even when it's inert), but only one is
 * ever bound to PAYMENT_PROVIDER — the symbol every PaymentsService
 * injection point actually depends on. Selection mirrors
 * SuppliersModule's registered-in-code / active-by-config dual gate:
 * STRIPE is only chosen when BOTH `paymentProviderStrategy === 'STRIPE'`
 * AND Stripe is actually configured (STRIPE_SECRET_KEY set) — requesting
 * STRIPE without credentials falls back to MANUAL with a boot warning
 * rather than booting into a payment path that can only ever fail.
 */
@Module({
  imports: [MetricsModule],
  providers: [
    ManualPaymentProvider,
    StripePaymentProvider,
    {
      provide: PAYMENT_PROVIDER,
      useFactory: (config: ConfigService<AppConfig, true>, manual: ManualPaymentProvider, stripe: StripePaymentProvider): PaymentProvider => {
        const strategy = config.get('paymentProviderStrategy', { infer: true });
        if (strategy === 'STRIPE') {
          if (stripe.isConfigured()) {
            logger.log('Payment provider: STRIPE (real gateway)');
            return stripe;
          }
          logger.warn('PAYMENT_PROVIDER_STRATEGY=STRIPE but STRIPE_SECRET_KEY is not set — falling back to ManualPaymentProvider (mock). No real charges will be attempted.');
        }
        return manual;
      },
      inject: [ConfigService, ManualPaymentProvider, StripePaymentProvider],
    },
    PaymentsService,
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
