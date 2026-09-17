import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { AuthenticatedUser, AuthTokens, RegisterInput } from '@mohammad-travels/types';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { buildOtpAuthUri, generateBackupCodes, generateTotpSecret, verifyTotp } from './totp.util';

interface AccessTokenPayload {
  sub: string;
}

/** Signed with jwt.refreshSecret (never jwt.accessSecret) — see the doc comment on beginLogin for why that distinction is the whole security property this relies on. */
interface TwoFactorChallengePayload {
  sub: string;
  purpose: '2fa_challenge';
  deviceLabel?: string;
}

const PASSWORD_RESET_TTL_MINUTES = 30;
const TWO_FACTOR_CHALLENGE_TTL = '5m';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async register(input: RegisterInput): Promise<AuthenticatedUser> {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
    if (existing) {
      // Deliberately vague — do not reveal whether an email is registered.
      throw new ConflictException('Unable to register with the provided details');
    }

    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    // Self-registration only ever creates a B2C customer or a brand-new B2B
    // agency (with the registrant as its founding admin) — inviting
    // additional B2B_AGENT members into an *existing* agency is a Phase 2+
    // agency-admin action, not a public registration path, so it isn't
    // handled here.
    const roleName = input.accountType === 'B2C_CUSTOMER' ? 'B2C_CUSTOMER' : 'B2B_AGENCY_ADMIN';

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: input.email.toLowerCase(),
          passwordHash,
          fullName: input.fullName,
          phoneNumber: input.phoneNumber,
          address: input.address,
        },
      });

      const role = await tx.role.findUnique({ where: { name: roleName } });
      if (role) {
        await tx.userRole.create({ data: { userId: created.id, roleId: role.id } });
      }

      if (input.accountType === 'B2C_CUSTOMER') {
        await tx.customer.create({ data: { userId: created.id } });
      } else {
        // PHASE 2: Agent is a membership row, not a standalone actor — a
        // self-registering agent needs an agency to belong to, so we create
        // one (pending approval, named after the registrant for now — the
        // agency admin can rename it later) and make them its first member.
        const agency = await tx.b2BAgency.create({
          data: { name: input.fullName, status: 'PENDING_APPROVAL' },
        });
        await tx.agent.create({
          data: { userId: created.id, agencyId: agency.id, title: 'Owner' },
        });
        await tx.wallet.create({
          data: { agencyId: agency.id, currency: 'USD' },
        });
      }

      return created;
    });

    await this.audit.record({
      userId: user.id,
      action: 'USER_REGISTERED',
      resource: 'user',
      resourceId: user.id,
      newValue: { email: user.email, accountType: input.accountType },
    });

    return this.loadAuthenticatedUser(user.id);
  }

  /** Used by LocalStrategy. Constant-shape response whether the email exists or not, to resist enumeration. */
  async validateCredentials(email: string, password: string): Promise<AuthenticatedUser | null> {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !user.isActive || user.deletedAt) {
      // Still run a hash comparison against a dummy value so response
      // timing doesn't leak whether the account exists.
      await argon2.hash('constant-time-decoy-password');
      return null;
    }

    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) {
      return null;
    }

    return this.loadAuthenticatedUser(user.id);
  }

  async issueTokens(user: AuthenticatedUser, deviceLabel?: string): Promise<AuthTokens> {
    const accessTtl = this.config.get<string>('jwt.accessTtl');
    const refreshTtl = this.config.get<string>('jwt.refreshTtl');

    const accessToken = await this.jwt.signAsync(
      { sub: user.id } as AccessTokenPayload,
      { secret: this.config.get<string>('jwt.accessSecret'), expiresIn: accessTtl },
    );

    const refreshTokenValue = randomUUID() + randomUUID();
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, jti: refreshTokenValue },
      { secret: this.config.get<string>('jwt.refreshSecret'), expiresIn: refreshTtl },
    );

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(refreshTokenValue),
        deviceLabel: deviceLabel ?? null,
        expiresAt: addDuration(new Date(), refreshTtl as string),
      },
    });

    // A "completed login" is exactly a moment a token pair is actually
    // issued — for a 2FA account that's only reached after
    // verifyTwoFactorAndIssueTokens, never at the password-only step.
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    return {
      accessToken,
      refreshToken,
      expiresIn: parseDurationToSeconds(accessTtl as string),
    };
  }

  /**
   * Called by the login route after LocalAuthGuard has already verified
   * the password. Branches on whether the account has 2FA enabled:
   * - Not enabled: issues real tokens immediately, exactly like before
   *   this phase.
   * - Enabled: issues nothing yet. Instead returns a short-lived
   *   "challenge" token, signed with jwt.refreshSecret rather than
   *   jwt.accessSecret. That distinction is the entire security
   *   property this relies on — JwtStrategy only ever accepts tokens
   *   signed with jwt.accessSecret, so this challenge token is
   *   cryptographically incapable of being used as a Bearer access
   *   token against any protected route, even though it's a normal JWT
   *   in every other respect. Only verifyTwoFactorAndIssueTokens can
   *   redeem it, and only after the TOTP/backup code checks out.
   */
  async beginLogin(
    user: AuthenticatedUser,
    deviceLabel?: string,
  ): Promise<{ twoFactorRequired: true; twoFactorToken: string } | ({ user: AuthenticatedUser } & AuthTokens)> {
    const record = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });

    if (!record.twoFactorEnabled) {
      const tokens = await this.issueTokens(user, deviceLabel);
      return { user, ...tokens };
    }

    const twoFactorToken = await this.jwt.signAsync(
      { sub: user.id, purpose: '2fa_challenge', deviceLabel } as TwoFactorChallengePayload,
      { secret: this.config.get<string>('jwt.refreshSecret'), expiresIn: TWO_FACTOR_CHALLENGE_TTL },
    );
    return { twoFactorRequired: true, twoFactorToken };
  }

  /** Redeems a beginLogin() 2FA challenge token, accepting either a live TOTP code or an unused backup code. */
  async verifyTwoFactorAndIssueTokens(twoFactorToken: string, code: string): Promise<{ user: AuthenticatedUser } & AuthTokens> {
    let payload: TwoFactorChallengePayload;
    try {
      payload = await this.jwt.verifyAsync(twoFactorToken, { secret: this.config.get<string>('jwt.refreshSecret') });
    } catch {
      throw new UnauthorizedException('This 2FA challenge has expired. Please sign in again.');
    }
    if (payload.purpose !== '2fa_challenge') {
      throw new UnauthorizedException('Invalid 2FA challenge.');
    }

    const record = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!record || !record.isActive || record.deletedAt || !record.twoFactorEnabled || !record.twoFactorSecret) {
      throw new UnauthorizedException('Invalid 2FA challenge.');
    }

    const validTotp = verifyTotp(record.twoFactorSecret, code);
    const backupCodeHash = validTotp ? null : this.hashToken(code.trim().toLowerCase());
    const usedBackupCode = !validTotp && record.twoFactorBackupCodes.includes(backupCodeHash as string);

    if (!validTotp && !usedBackupCode) {
      throw new UnauthorizedException('Incorrect authentication code.');
    }

    if (usedBackupCode) {
      // One-time use — remove it the moment it's spent.
      await this.prisma.user.update({
        where: { id: record.id },
        data: { twoFactorBackupCodes: record.twoFactorBackupCodes.filter((c) => c !== backupCodeHash) },
      });
    }

    const user = await this.loadAuthenticatedUser(record.id);
    const tokens = await this.issueTokens(user, payload.deviceLabel);
    return { user, ...tokens };
  }

  /**
   * Generates and stores a new secret + backup codes immediately, but
   * leaves twoFactorEnabled false until confirmTwoFactor() proves the
   * operator's authenticator app actually has it — otherwise a typo'd
   * QR scan could lock the account out on its very next login. Calling
   * this again before confirming simply replaces the pending secret.
   */
  async enableTwoFactor(userId: string): Promise<{ secret: string; otpauthUri: string; backupCodes: string[] }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const secret = generateTotpSecret();
    const backupCodes = generateBackupCodes();
    const hashedBackupCodes = backupCodes.map((c) => this.hashToken(c.toLowerCase()));

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: secret, twoFactorBackupCodes: hashedBackupCodes, twoFactorEnabled: false },
    });

    return { secret, otpauthUri: buildOtpAuthUri(secret, user.email), backupCodes };
  }

  async confirmTwoFactor(userId: string, code: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.twoFactorSecret) {
      throw new UnauthorizedException('Start 2FA setup first.');
    }
    if (!verifyTotp(user.twoFactorSecret, code)) {
      throw new UnauthorizedException('Incorrect code. Check your authenticator app and try again.');
    }
    await this.prisma.user.update({ where: { id: userId }, data: { twoFactorEnabled: true } });
    await this.audit.record({ userId, action: 'TWO_FACTOR_ENABLED', resource: 'user', resourceId: userId });
  }

  async disableTwoFactor(userId: string, password: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) {
      throw new UnauthorizedException('Incorrect password.');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorBackupCodes: [] },
    });
    await this.audit.record({ userId, action: 'TWO_FACTOR_DISABLED', resource: 'user', resourceId: userId });
  }

  async listSessions(userId: string): Promise<Array<{ id: string; deviceLabel: string | null; issuedAt: Date; expiresAt: Date }>> {
    return this.prisma.refreshToken.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { issuedAt: 'desc' },
      select: { id: true, deviceLabel: true, issuedAt: true, expiresAt: true },
    });
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count === 0) {
      throw new NotFoundException('Session not found, or already signed out.');
    }
  }

  /**
   * Always resolves successfully whether or not the email belongs to a
   * real account — the same anti-enumeration posture validateCredentials
   * already follows — so the response never reveals which emails are
   * registered.
   */
  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !user.isActive || user.deletedAt) return;

    const rawToken = randomBytes(32).toString('hex');
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(rawToken),
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000),
      },
    });

    const webAppUrl = this.config.get<string>('webAppUrl');
    await this.notifications.sendPasswordResetRequested({
      toEmail: user.email,
      toName: user.fullName,
      resetUrl: `${webAppUrl}/reset-password?token=${rawToken}`,
    });

    await this.audit.record({ userId: user.id, action: 'PASSWORD_RESET_REQUESTED', resource: 'user', resourceId: user.id });
  }

  /** Also revokes every existing refresh token for the account — a reset password should end every session it didn't come from, not just future ones. */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const tokenHash = this.hashToken(token);
    const record = await this.prisma.passwordResetToken.findFirst({
      where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!record) {
      throw new UnauthorizedException('This reset link is invalid or has expired. Please request a new one.');
    }

    const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      this.prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      this.prisma.refreshToken.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);

    await this.audit.record({ userId: record.userId, action: 'PASSWORD_RESET_COMPLETED', resource: 'user', resourceId: record.userId });
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    let payload: { sub: string; jti: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.get<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const tokenHash = this.hashToken(payload.jti);
    const stored = await this.prisma.refreshToken.findFirst({
      where: { userId: payload.sub, tokenHash, revokedAt: null },
    });

    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token no longer valid');
    }

    // Rotate: revoke the presented token, issue a brand new pair. This
    // means a stolen-and-reused refresh token is detectable — if it's
    // presented again after rotation, it will already be revoked.
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const user = await this.loadAuthenticatedUser(payload.sub);
    return this.issueTokens(user, stored.deviceLabel ?? undefined);
  }

  async logout(userId: string, refreshToken: string): Promise<void> {
    try {
      const payload = await this.jwt.verifyAsync<{ jti: string }>(refreshToken, {
        secret: this.config.get<string>('jwt.refreshSecret'),
      });
      await this.prisma.refreshToken.updateMany({
        where: { userId, tokenHash: this.hashToken(payload.jti), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } catch {
      // Already invalid/expired — logout is idempotent either way.
    }
  }

  private async loadAuthenticatedUser(userId: string): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
      },
    });

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      roles: user.roles.map((r) => r.role.name),
      permissions: Array.from(
        new Set(user.roles.flatMap((r) => r.role.permissions.map((rp) => rp.permission.name))),
      ),
    };
  }

  private hashToken(token: string): string {
    // Refresh tokens are stored hashed (SHA-256) — never in plaintext —
    // so a database read alone can't be replayed as a live session.
    return createHash('sha256').update(token).digest('hex');
  }
}

function parseDurationToSeconds(duration: string): number {
  const match = /^(\d+)([smhd])$/.exec(duration);
  if (!match) return 900;
  const value = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return value * multipliers[unit];
}

function addDuration(base: Date, duration: string): Date {
  return new Date(base.getTime() + parseDurationToSeconds(duration) * 1000);
}
