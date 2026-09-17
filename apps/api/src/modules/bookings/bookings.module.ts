import { Module } from '@nestjs/common';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { BookingStateMachineService } from './booking-state-machine.service';
import { SuppliersModule } from '../suppliers/suppliers.module';
import { AuditModule } from '../audit/audit.module';
import { WalletModule } from '../wallet/wallet.module';
import { PaymentsModule } from '../payments/payments.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { TravelPolicyModule } from '../travel-policy/travel-policy.module';

@Module({
  imports: [SuppliersModule, AuditModule, WalletModule, PaymentsModule, NotificationsModule, IntegrationsModule, TravelPolicyModule],
  controllers: [BookingsController],
  providers: [BookingsService, BookingStateMachineService],
  exports: [BookingsService, BookingStateMachineService],
})
export class BookingsModule {}
