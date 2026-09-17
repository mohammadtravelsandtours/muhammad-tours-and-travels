import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';
import { MetricsInterceptor } from './metrics.interceptor';

/**
 * Registers the global HTTP metrics interceptor (APP_INTERCEPTOR
 * providers apply app-wide regardless of which module declares them,
 * exactly like LoggingInterceptor/HttpExceptionFilter in app.module.ts —
 * kept here instead so this module is fully self-contained) and exposes
 * MetricsService for any other module that wants to record a
 * business-level counter (see PaymentsModule/BookingsModule).
 */
@Module({
  controllers: [MetricsController],
  providers: [MetricsService, { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor }],
  exports: [MetricsService],
})
export class MetricsModule {}
