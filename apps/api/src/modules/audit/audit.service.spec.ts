import { AuditService } from './audit.service';

/**
 * The one piece of real logic in AuditService.list() worth a
 * regression test: financial-resource redaction. 'wallet' rows must
 * never reach a caller without audit:read:financial, whether they
 * asked for "everything" or explicitly filtered down to 'wallet'
 * itself (the latter must come back empty, not an error and not some
 * other resource's rows).
 */
function makeFakePrisma(rows: any[]) {
  return {
    auditLog: {
      findMany: jest.fn(async ({ where, take }: any) => {
        const matches = rows.filter((r) => {
          if (where.userId && r.userId !== where.userId) return false;
          if (where.action && r.action !== where.action) return false;
          if (where.resource && typeof where.resource === 'string' && r.resource !== where.resource) return false;
          if (where.resource && where.resource.notIn && where.resource.notIn.includes(r.resource)) return false;
          return true;
        });
        return matches.slice(0, take);
      }),
    },
  };
}

const ROWS = [
  { id: 'a1', resource: 'wallet', action: 'WALLET_ADJUSTED', userId: 'u1', createdAt: new Date() },
  { id: 'a2', resource: 'booking', action: 'BOOKING_TICKETED', userId: 'u1', createdAt: new Date() },
  { id: 'a3', resource: 'role', action: 'ROLE_PERMISSION_GRANTED', userId: 'u2', createdAt: new Date() },
];

describe('AuditService.list — financial redaction', () => {
  it('hides financial-resource rows from a caller without audit:read:financial', async () => {
    const service = new AuditService(makeFakePrisma(ROWS) as any);

    const result = await service.list({ includeFinancial: false }, { take: 10 });

    expect(result.entries.length).toBe(2); // booking + role, wallet excluded
    expect(result.entries.every((e: any) => e.resource !== 'wallet')).toBe(true);
  });

  it('shows financial-resource rows to a caller with audit:read:financial', async () => {
    const service = new AuditService(makeFakePrisma(ROWS) as any);

    const result = await service.list({ includeFinancial: true }, { take: 10 });

    expect(result.entries.length).toBe(3);
  });

  it('returns an empty page (not an error, not other resources) for an explicit wallet filter without permission', async () => {
    const service = new AuditService(makeFakePrisma(ROWS) as any);

    const result = await service.list({ resource: 'wallet', includeFinancial: false }, { take: 10 });

    expect(result.entries.length).toBe(0);
    expect(result.nextCursor).toBe(null);
  });

  it('honors an explicit wallet filter for a caller with permission', async () => {
    const service = new AuditService(makeFakePrisma(ROWS) as any);

    const result = await service.list({ resource: 'wallet', includeFinancial: true }, { take: 10 });

    expect(result.entries.length).toBe(1);
  });
});
