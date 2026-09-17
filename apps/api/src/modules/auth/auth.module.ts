import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { LoginThrottleGuard } from './login-throttle.guard';
import { TwoFactorThrottleGuard } from './two-factor-throttle.guard';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PassportModule, JwtModule.register({}), AuditModule, NotificationsModule],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, LocalStrategy, LoginThrottleGuard, TwoFactorThrottleGuard],
  exports: [AuthService],
})
export class AuthModule {}
