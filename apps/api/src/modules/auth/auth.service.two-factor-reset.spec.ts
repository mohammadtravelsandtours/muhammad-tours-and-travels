import * as argon2 from 'argon2';
import { createHash } from 'crypto';
import { AuthService } from './auth.service';
import { generateTotp, generateTotpSecret } from './totp.util';

/**
 * Covers the Phase 14 additions to AuthService: 2FA challenge/verify,
 * 2FA enable/confirm/disable, and self-service password reset. Uses the
 * real TOTP implementation (generateTotp/generateTotpSecret) rather than
 * mocking it, so this also exercises the real crypto path end-to-end,
 * not just AuthService's branching around it.
 *
 * NOT registered in /tmp/claude-0/verify-suite/run.mjs, matching the
 * pre-existing (also-unregistered) auth.service.spec.ts one directory
 * over: AuthService imports @nestjs/jwt, @nestjs/config, and argon2,
 * none of which have a shim in this sandbox's node_modules (only
 * @nestjs/common does) — see docs/ROADMAP.md's Phase 14 entry. This
 * spec is written for the project's real CI (see .github/workflows/ci.yml),
 * where those packages are actually installed.
 */
function makeService(overrides: {
  twoFactorEnabled?: boolean;
  twoFactorSecret?: string | null;
  twoFactorBackupCodes?: string[];
  passwordHash?: string;
} = {}) {
  const userId = 'user-1';
  const user: any = {
    id: userId,
    email: 'admin@example.com',
    fullName: 'Admin One',
    isActive: true,
    deletedAt: null,
    passwordHash: overrides.passwordHash ?? 'irrelevant-hash',
    twoFactorEnabled: overrides.twoFactorEnabled ?? false,
    twoFactorSecret: overrides.twoFactorSecret ?? null,
    twoFactorBackupCodes: overrides.twoFactorBackupCodes ?? [],
  };

  const refreshTokens: any[] = [];
  const passwordResetTokens: any[] = [];
  const auditCalls: unknown[] = [];
  const notificationCalls: unknown[] = [];

  const prisma: any = {
    user: {
      findUnique: jest.fn(async ({ where }: any) => (where.id === userId || where.email === user.email ? { ...user } : null)),
      findUniqueOrThrow: jest.fn(async ({ where }: any) => {
        if (where.id !== userId) throw new Error('not found');
        return { ...user };
      }),
      update: jest.fn(async ({ data }: any) => {
        Object.assign(user, data);
        return { ...user };
      }),
    },
    refreshToken: {
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `rt-${refreshTokens.length + 1}`, revokedAt: null, ...data };
        refreshTokens.push(row);
        return row;
      }),
      findMany: jest.fn(async () => refreshTokens.filter((t) => t.revokedAt === null)),
      updateMany: jest.fn(async ({ where, data }: any) => {
        let count = 0;
        for (const t of refreshTokens) {
          if (t.userId === where.userId && t.revokedAt === null) {
            Object.assign(t, data);
            count++;
          }
        }
        return { count };
      }),
    },
    passwordResetToken: {
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `prt-${passwordResetTokens.length + 1}`, usedAt: null, ...data };
        passwordResetTokens.push(row);
        return row;
      }),
      findFirst: jest.fn(async ({ where }: any) =>
        passwordResetTokens.find((t) => t.tokenHash === where.tokenHash && t.usedAt === null && t.expiresAt > new Date()) ?? null,
      ),
      update: jest.fn(async ({ where, data }: any) => {
        const row = passwordResetTokens.find((t) => t.id === where.id);
        Object.assign(row, data);
        return row;
      }),
    },
    $transaction: jest.fn(async (arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma))),
  };

  // A tiny real-enough JwtService stand-in: signs/verifies HMAC JWTs
  // keyed by the secret passed at call time, exactly how the real
  // @nestjs/jwt would behave for this code path (which always passes an
  // explicit `secret`).
  const jwt: any = {
    signAsync: jest.fn(async (payload: any, options: { secret: string; expiresIn: string }) =>
      Buffer.from(JSON.stringify({ payload, secret: options.secret, expiresIn: options.expiresIn })).toString('base64url'),
    ),
    verifyAsync: jest.fn(async (token: string, options: { secret: string }) => {
      const decoded = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
      if (decoded.secret !== options.secret) throw new Error('bad signature');
      return decoded.payload;
    }),
  };

  const configValues: Record<string, string> = {
    'jwt.accessSecret': 'access-secret',
    'jwt.refreshSecret': 'refresh-secret',
    'jwt.accessTtl': '15m',
    'jwt.refreshTtl': '30d',
    webAppUrl: 'https://app.example.com',
  };
  const config: any = { get: jest.fn((key: string) => configValues[key]) };

  const audit = { record: jest.fn(async (entry: unknown) => void auditCalls.push(entry)) };
  const notifications = {
    sendPasswordResetRequested: jest.fn(async (input: unknown) => void notificationCalls.push(input)),
  };

  const service = new AuthService(prisma, jwt, config, audit as any, notifications as any);
  return { service, prisma, user, refreshTokens, passwordResetTokens, auditCalls, notificationCalls, notifications };
}

const authenticatedUserStub = (overrides: Partial<{ id: string }> = {}) => ({
  id: 'user-1',
  email: 'admin@example.com',
  fullName: 'Admin One',
  roles: ['SUPER_ADMIN'],
  permissions: [],
  ...overrides,
});

describe('AuthService.beginLogin', () => {
  it('issues real tokens immediately for an account without 2FA', async () => {
    const { service } = makeService({ twoFactorEnabled: false });
    const result = await service.beginLogin(authenticatedUserStub());
    expect('twoFactorRequired' in result).toBe(false);
    expect((result as any).accessToken).toBeDefined();
  });

  it('returns a 2FA challenge, and issues no tokens, for an account with 2FA enabled', async () => {
    const { service, refreshTokens } = makeService({ twoFactorEnabled: true, twoFactorSecret: generateTotpSecret() });
    const result = await service.beginLogin(authenticatedUserStub());
    expect((result as any).twoFactorRequired).toBe(true);
    expect(typeof (result as any).twoFactorToken).toBe('string');
    expect(refreshTokens).toHaveLength(0);
  });
});

describe('AuthService.verifyTwoFactorAndIssueTokens', () => {
  it('issues tokens for a correct TOTP code', async () => {
    const secret = generateTotpSecret();
    const { service } = makeService({ twoFactorEnabled: true, twoFactorSecret: secret });
    const { twoFactorToken } = (await service.beginLogin(authenticatedUserStub())) as any;

    const code = generateTotp(secret);
    const result = await service.verifyTwoFactorAndIssueTokens(twoFactorToken, code);
    expect(result.accessToken).toBeDefined();
    expect(result.user.id).toBe('user-1');
  });

  it('rejects an incorrect code', async () => {
    const secret = generateTotpSecret();
    const { service } = makeService({ twoFactorEnabled: true, twoFactorSecret: secret });
    const { twoFactorToken } = (await service.beginLogin(authenticatedUserStub())) as any;

    await expect(service.verifyTwoFactorAndIssueTokens(twoFactorToken, '000000')).rejects.toThrow();
  });

  it('accepts a valid backup code exactly once, then rejects it on reuse', async () => {
    const secret = generateTotpSecret();
    const backupCode = 'aaaa-bbbb-cc';
    const { service, user } = makeService({
      twoFactorEnabled: true,
      twoFactorSecret: secret,
      twoFactorBackupCodes: [createHash('sha256').update(backupCode).digest('hex')],
    });
    const { twoFactorToken } = (await service.beginLogin(authenticatedUserStub())) as any;

    const result = await service.verifyTwoFactorAndIssueTokens(twoFactorToken, backupCode);
    expect(result.accessToken).toBeDefined();
    expect(user.twoFactorBackupCodes).toHaveLength(0);

    const { twoFactorToken: secondToken } = (await service.beginLogin(authenticatedUserStub())) as any;
    await expect(service.verifyTwoFactorAndIssueTokens(secondToken, backupCode)).rejects.toThrow();
  });

  it('rejects a garbage/expired challenge token', async () => {
    const { service } = makeService();
    await expect(service.verifyTwoFactorAndIssueTokens('not-a-real-token', '123456')).rejects.toThrow();
  });
});

describe('AuthService 2FA setup lifecycle', () => {
  it('enableTwoFactor stores a pending secret without enabling it yet', async () => {
    const { service, user } = makeService();
    const setup = await service.enableTwoFactor('user-1');
    expect(setup.backupCodes).toHaveLength(8);
    expect(setup.otpauthUri.startsWith('otpauth://totp/')).toBe(true);
    expect(user.twoFactorEnabled).toBe(false);
    expect(user.twoFactorSecret).toBe(setup.secret);
  });

  it('confirmTwoFactor enables 2FA only given a correct code', async () => {
    const { service, user } = makeService();
    const setup = await service.enableTwoFactor('user-1');
    await service.confirmTwoFactor('user-1', generateTotp(setup.secret));
    expect(user.twoFactorEnabled).toBe(true);
  });

  it('confirmTwoFactor rejects a wrong code and leaves 2FA disabled', async () => {
    const { service, user } = makeService();
    await service.enableTwoFactor('user-1');
    await expect(service.confirmTwoFactor('user-1', '000000')).rejects.toThrow();
    expect(user.twoFactorEnabled).toBe(false);
  });

  it('disableTwoFactor clears the secret and backup codes given the correct password', async () => {
    const passwordHash = await argon2.hash('correct-horse-battery-staple', { type: argon2.argon2id });
    const { service, user } = makeService({ twoFactorEnabled: true, twoFactorSecret: generateTotpSecret(), passwordHash });
    await service.disableTwoFactor('user-1', 'correct-horse-battery-staple');
    expect(user.twoFactorEnabled).toBe(false);
    expect(user.twoFactorSecret).toBeNull();
    expect(user.twoFactorBackupCodes).toHaveLength(0);
  });

  it('disableTwoFactor rejects the wrong password and leaves 2FA untouched', async () => {
    const passwordHash = await argon2.hash('correct-horse-battery-staple', { type: argon2.argon2id });
    const { service, user } = makeService({ twoFactorEnabled: true, twoFactorSecret: generateTotpSecret(), passwordHash });
    await expect(service.disableTwoFactor('user-1', 'wrong-password')).rejects.toThrow();
    expect(user.twoFactorEnabled).toBe(true);
  });
});

describe('AuthService password reset', () => {
  it('creates a reset token and sends the (mock) email for a known address', async () => {
    const { service, passwordResetTokens, notificationCalls } = makeService();
    await service.requestPasswordReset('admin@example.com');
    expect(passwordResetTokens).toHaveLength(1);
    expect(notificationCalls).toHaveLength(1);
  });

  it('resolves without creating a token for an unknown address (anti-enumeration)', async () => {
    const { service, passwordResetTokens, notificationCalls } = makeService();
    await service.requestPasswordReset('nobody@example.com');
    expect(passwordResetTokens).toHaveLength(0);
    expect(notificationCalls).toHaveLength(0);
  });

  it('rejects an invalid/unknown reset token', async () => {
    const { service } = makeService();
    await expect(service.resetPassword('not-a-real-token', 'new-password-123')).rejects.toThrow();
  });

  it('updates the password, marks the token used, and revokes existing sessions on a valid reset', async () => {
    const { service, user, refreshTokens, passwordResetTokens, notificationCalls } = makeService();
    const originalHash = user.passwordHash;
    refreshTokens.push({ id: 'rt-existing', userId: 'user-1', revokedAt: null });

    // Goes through requestPasswordReset (rather than reaching into
    // AuthService's private token-hashing) to get a raw token whose
    // hash actually matches what resetPassword will look up — the
    // (mock) notification is the only place the raw token ever appears.
    await service.requestPasswordReset('admin@example.com');
    const resetUrl = (notificationCalls[0] as { resetUrl: string }).resetUrl;
    const rawToken = new URL(resetUrl).searchParams.get('token') as string;

    await service.resetPassword(rawToken, 'a-brand-new-password');

    expect(user.passwordHash).not.toBe(originalHash);
    expect(passwordResetTokens[0].usedAt).not.toBeNull();
    expect(refreshTokens.find((t) => t.id === 'rt-existing').revokedAt).not.toBeNull();
  });
});
