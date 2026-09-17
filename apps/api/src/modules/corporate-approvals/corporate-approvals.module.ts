import { Module } from '@nestjs/common';
import { CorporateApprovalsController } from './corporate-approvals.controller';
import { CorporateApprovalsService } from './corporate-approvals.service';
import { AuditModule } from '../audit/audit.module';
import { BookingsModule } from '../bookings/bookings.module';

@Module({
  imports: [AuditModule, BookingsModule],
  controllers: [CorporateApprovalsController],
  providers: [CorporateApprovalsService],
})
export class CorporateApprovalsModule {}
