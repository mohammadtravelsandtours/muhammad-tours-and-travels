import { Module } from '@nestjs/common';
import { TravelPolicyAdminController, MyCostCentersController } from './travel-policy.controller';
import { TravelPolicyService } from './travel-policy.service';
import { AuditModule } from '../audit/audit.module';
import { FxModule } from '../fx/fx.module';

@Module({
  imports: [AuditModule, FxModule],
  controllers: [TravelPolicyAdminController, MyCostCentersController],
  providers: [TravelPolicyService],
  exports: [TravelPolicyService],
})
export class TravelPolicyModule {}
