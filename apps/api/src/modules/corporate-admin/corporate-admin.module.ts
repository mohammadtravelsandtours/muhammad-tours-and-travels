import { Module } from '@nestjs/common';
import { CorporateAdminController } from './corporate-admin.controller';
import { CorporateAdminService } from './corporate-admin.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [CorporateAdminController],
  providers: [CorporateAdminService],
})
export class CorporateAdminModule {}
