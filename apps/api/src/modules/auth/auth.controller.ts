import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AuthenticatedUser } from '@mohammad-travels/types';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ConfirmTwoFactorDto, DisableTwoFactorDto, VerifyTwoFactorDto } from './dto/two-factor.dto';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { LoginThrottleGuard } from './login-throttle.guard';
import { TwoFactorThrottleGuard } from './two-factor-throttle.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    const user = await this.authService.register(dto);
    const tokens = await this.authService.issueTokens(user);
    return { user, ...tokens };
  }

  @UseGuards(LoginThrottleGuard, LocalAuthGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Req() req: Request & { user: AuthenticatedUser }) {
    // req.user was populated by LocalStrategy after LocalAuthGuard ran it.
    // beginLogin branches internally on whether this account has 2FA
    // enabled — see its doc comment for why that's safe to do generically
    // here rather than duplicating the check in every app's login page.
    return this.authService.beginLogin(req.user, req.headers['user-agent']);
  }

  /** Redeems a beginLogin() 2FA challenge with a TOTP or backup code and returns real tokens, same shape as a plain login. */
  @UseGuards(TwoFactorThrottleGuard)
  @Post('2fa/verify')
  @HttpCode(HttpStatus.OK)
  async verifyTwoFactor(@Body() dto: VerifyTwoFactorDto) {
    return this.authService.verifyTwoFactorAndIssueTokens(dto.twoFactorToken, dto.code);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/enable')
  async enableTwoFactor(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.enableTwoFactor(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/confirm')
  @HttpCode(HttpStatus.NO_CONTENT)
  async confirmTwoFactor(@CurrentUser() user: AuthenticatedUser, @Body() dto: ConfirmTwoFactorDto) {
    await this.authService.confirmTwoFactor(user.id, dto.code);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  async disableTwoFactor(@CurrentUser() user: AuthenticatedUser, @Body() dto: DisableTwoFactorDto) {
    await this.authService.disableTwoFactor(user.id, dto.password);
  }

  @UseGuards(JwtAuthGuard)
  @Get('sessions')
  async listSessions(@CurrentUser() user: AuthenticatedUser) {
    return { sessions: await this.authService.listSessions(user.id) };
  }

  @UseGuards(JwtAuthGuard)
  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeSession(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.authService.revokeSession(user.id, id);
  }

  /** Always 204, whether or not the email belongs to a real account — see AuthService.requestPasswordReset. */
  @Post('password-reset/request')
  @HttpCode(HttpStatus.NO_CONTENT)
  async requestPasswordReset(@Body() dto: RequestPasswordResetDto) {
    await this.authService.requestPasswordReset(dto.email);
  }

  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.NO_CONTENT)
  async confirmPasswordReset(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.token, dto.newPassword);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@CurrentUser() user: AuthenticatedUser, @Body() dto: RefreshDto) {
    await this.authService.logout(user.id, dto.refreshToken);
  }
}
