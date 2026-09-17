import { Module } from '@nestjs/common';
import { SuppliersAdminController } from './suppliers-admin.controller';
import { SuppliersAdminService } from './suppliers-admin.service';
import { AuditModule } from '../audit/audit.module';
import { SuppliersModule } from '../suppliers/suppliers.module';

@Module({
  imports: [AuditModule, SuppliersModule],
  controllers: [SuppliersAdminController],
  providers: [SuppliersAdminService],
})
export class SuppliersAdminModule {}
