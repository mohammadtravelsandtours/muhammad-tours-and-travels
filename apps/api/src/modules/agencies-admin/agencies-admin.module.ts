import { Module } from '@nestjs/common';
import { AgenciesAdminController } from './agencies-admin.controller';
import { AgenciesAdminService } from './agencies-admin.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [AgenciesAdminController],
  providers: [AgenciesAdminService],
})
export class AgenciesAdminModule {}
