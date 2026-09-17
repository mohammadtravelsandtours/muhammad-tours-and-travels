import { Module } from '@nestjs/common';
import { PricingAdminController } from './pricing-admin.controller';
import { PricingAdminService } from './pricing-admin.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [PricingAdminController],
  providers: [PricingAdminService],
})
export class PricingAdminModule {}
