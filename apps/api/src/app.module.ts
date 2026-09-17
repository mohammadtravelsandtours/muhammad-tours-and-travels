import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import configuration, { AppConfig } from './config/configuration';
import { envValidationSchema } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { AuditModule } from './modules/audit/audit.module';
import { HealthModule } from './modules/health/health.module';
import { AirportsModule } from './modules/airports/airports.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { FlightsModule } from './modules/flights/flights.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { PricingAdminModule } from './modules/pricing-admin/pricing-admin.module';
import { SuppliersAdminModule } from './modules/suppliers-admin/suppliers-admin.module';
import { CorporateApprovalsModule } from './modules/corporate-approvals/corporate-approvals.module';
import { AiAssistantModule } from './modules/ai-assistant/ai-assistant.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { AgenciesAdminModule } from './modules/agencies-admin/agencies-admin.module';
import { CorporateAdminModule } from './modules/corporate-admin/corporate-admin.module';
import { TravelPolicyModule } from './modules/travel-policy/travel-policy.module';
import { HotelsModule } from './modules/hotels/hotels.module';
import { VisasModule } from './modules/visas/visas.module';
import { PackagesModule } from './modules/packages/packages.module';
import { HajjUmrahModule } from './modules/hajj-umrah/hajj-umrah.module';
import { ManpowerModule } from './modules/manpower/manpower.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { MetricsModule } from './modules/metrics/metrics.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: false },
    }),
    // Global, per-IP rate limiting — RATE_LIMIT_TTL_SECONDS/
    // RATE_LIMIT_MAX_REQUESTS (default 60s / 120 requests). @nestjs/
    // throttler v5's `ttl` is milliseconds, while this app's own config
    // surface (configuration.ts's `rateLimit.ttl`) is kept in seconds to
    // match every other duration in this codebase — converted here at
    // the one place that needs it. HealthController opts out with
    // @SkipThrottle() so orchestrator liveness probes are never rate
    // limited.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const rateLimit = config.get('rateLimit', { infer: true });
        return [{ ttl: rateLimit.ttl * 1000, limit: rateLimit.limit }];
      },
    }),
    PrismaModule,
    RedisModule,
    AuditModule,
    AuthModule,
    UsersModule,
    RbacModule,
    HealthModule,
    AirportsModule,
    SuppliersModule,
    FlightsModule,
    BookingsModule,
    WalletModule,
    PricingAdminModule,
    SuppliersAdminModule,
    CorporateApprovalsModule,
    AiAssistantModule,
    IntegrationsModule,
    AgenciesAdminModule,
    CorporateAdminModule,
    TravelPolicyModule,
    HotelsModule,
    VisasModule,
    PackagesModule,
    HajjUmrahModule,
    ManpowerModule,
    AnalyticsModule,
    MetricsModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
