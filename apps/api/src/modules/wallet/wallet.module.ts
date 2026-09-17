import { Module } from '@nestjs/common';
import { WalletController, AdminWalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [WalletController, AdminWalletController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
