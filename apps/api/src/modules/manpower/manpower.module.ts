import { Module } from '@nestjs/common';
import { ManpowerController, ManpowerAdminController } from './manpower.controller';
import { ManpowerService } from './manpower.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [ManpowerController, ManpowerAdminController],
  providers: [ManpowerService],
  exports: [ManpowerService],
})
export class ManpowerModule {}
