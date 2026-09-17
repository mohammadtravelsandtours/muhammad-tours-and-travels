import * as argon2 from 'argon2';
import { AuthService } from './auth.service';

/**
 * Focused unit test on the credential-validation path — the most
 * security-sensitive piece of Phase 1. Prisma/JWT/Audit are mocked so
 * this runs in milliseconds with no database, per the testing pyramid:
 * fast unit tests for logic, integration tests (see /tests/integration
 * once Phase 2 adds them) for the real Postgres+Redis wiring.
 */
describe('AuthService.validateCredentials', () => {
  const activeUser = {
    id: 'user-1',
    email: 'agent@example.com',
    fullName: 'Test Agent',
    isActive: true,
    deletedAt: null,
    passwordHash: '',
  };

  let prisma: { user: { findUnique: jest.Mock; findUniqueOrThrow: jest.Mock } };
  let authService: AuthService;

  beforeAll(async () => {
    activeUser.passwordHash = await argon2.hash('correct-horse-battery-staple', {
      type: argon2.argon2id,
    });
  });

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ ...activeUser, roles: [] }),
      },
    };

    authService = new AuthService(
      prisma as any,
      {} as any, // JwtService — not exercised by this path
      { get: () => undefined } as any, // ConfigService
      { record: jest.fn() } as any, // AuditService
      { sendPasswordResetRequested: jest.fn() } as any, // NotificationsService
    );
  });

  it('returns the authenticated user for correct credentials', async () => {
    prisma.user.findUnique.mockResolvedValue(activeUser);

    const result = await authService.validateCredentials(
      'agent@example.com',
      'correct-horse-battery-staple',
    );

    expect(result?.id).toBe('user-1');
  });

  it('returns null for a wrong password', async () => {
    prisma.user.findUnique.mockResolvedValue(activeUser);

    const result = await authService.validateCredentials('agent@example.com', 'wrong-password');

    expect(result).toBeNull();
  });

  it('returns null (not an error) for a non-existent email', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const result = await authService.validateCredentials('nobody@example.com', 'irrelevant');

    expect(result).toBeNull();
  });

  it('returns null for a deactivated user even with the correct password', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...activeUser, isActive: false });

    const result = await authService.validateCredentials(
      'agent@example.com',
      'correct-horse-battery-staple',
    );

    expect(result).toBeNull();
  });
});
