import { Module } from '@nestjs/common';
import { HajjUmrahController, HajjUmrahAdminController } from './hajj-umrah.controller';
import { HajjUmrahService } from './hajj-umrah.service';
import { AuditModule } from '../audit/audit.module';
import { PaymentsModule } from '../payments/payments.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [AuditModule, PaymentsModule, NotificationsModule],
  controllers: [HajjUmrahController, HajjUmrahAdminController],
  providers: [HajjUmrahService],
  exports: [HajjUmrahService],
})
export class HajjUmrahModule {}
