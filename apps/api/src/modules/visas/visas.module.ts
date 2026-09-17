import { Module } from '@nestjs/common';
import { VisasController, VisasAdminController } from './visas.controller';
import { VisasService } from './visas.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [VisasController, VisasAdminController],
  providers: [VisasService],
  exports: [VisasService],
})
export class VisasModule {}
