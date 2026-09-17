import { Module } from '@nestjs/common';
import { HotelsController } from './hotels.controller';
import { HotelsService } from './hotels.service';
import { HotelSearchOrchestratorService } from './hotel-search-orchestrator.service';
import { HotelSupplierRegistry } from './hotel-supplier-registry.service';
import { HOTEL_SUPPLIER_ADAPTERS } from './hotel-supplier-adapters.token';
import { MockHotelSupplierAAdapter } from './adapters/mock/mock-hotel-supplier-a.adapter';
import { MockHotelSupplierBAdapter } from './adapters/mock/mock-hotel-supplier-b.adapter';
import { HotelSupplierAdapter } from '@mohammad-travels/types';
import { AuditModule } from '../audit/audit.module';
import { WalletModule } from '../wallet/wallet.module';
import { PaymentsModule } from '../payments/payments.module';
import { NotificationsModule } from '../notifications/notifications.module';

/**
 * Registers every known hotel supplier adapter and exposes them only
 * through HotelSupplierRegistry — same "nothing outside this module
 * references a concrete adapter class" discipline as SuppliersModule.
 * Adding a real (non-mock) hotel supplier means adding it to the two
 * lists below.
 */
@Module({
  imports: [AuditModule, WalletModule, PaymentsModule, NotificationsModule],
  controllers: [HotelsController],
  providers: [
    MockHotelSupplierAAdapter,
    MockHotelSupplierBAdapter,
    {
      provide: HOTEL_SUPPLIER_ADAPTERS,
      useFactory: (a: MockHotelSupplierAAdapter, b: MockHotelSupplierBAdapter): HotelSupplierAdapter[] => [a, b],
      inject: [MockHotelSupplierAAdapter, MockHotelSupplierBAdapter],
    },
    HotelSupplierRegistry,
    HotelSearchOrchestratorService,
    HotelsService,
  ],
  exports: [HotelsService, HotelSupplierRegistry],
})
export class HotelsModule {}
