import { ForbiddenException } from '@nestjs/common';
import { RbacService } from './rbac.service';

/**
 * Covers the one hard safety rail in this service: SUPER_ADMIN's
 * permissions can never be edited through revokePermission(), because
 * the only thing that could ever restore a permission stripped from it
 * is ROLES_MANAGE itself, which lives on that same role — see the
 * method's own doc comment for the full reasoning.
 */
function makeFakePrisma(roles: Record<string, { id: string; name: string }>, permissions: Record<string, { id: string; name: string }>) {
  const grants = new Set<string>(); // `${roleId}:${permissionId}`
  return {
    role: {
      findUnique: jest.fn(async ({ where }: any) => Object.values(roles).find((r) => r.id === where.id) ?? null),
    },
    permission: {
      findUnique: jest.fn(async ({ where }: any) => Object.values(permissions).find((p) => p.id === where.id) ?? null),
    },
    rolePermission: {
      upsert: jest.fn(async ({ where }: any) => {
        grants.add(`${where.roleId_permissionId.roleId}:${where.roleId_permissionId.permissionId}`);
        return {};
      }),
      deleteMany: jest.fn(async ({ where }: any) => {
        grants.delete(`${where.roleId}:${where.permissionId}`);
        return { count: 1 };
      }),
    },
    _grants: grants,
  };
}

describe('RbacService.revokePermission', () => {
  it('refuses to revoke any permission from SUPER_ADMIN', async () => {
    const prisma = makeFakePrisma(
      { superAdmin: { id: 'role-super', name: 'SUPER_ADMIN' } },
      { rolesManage: { id: 'perm-roles', name: 'roles:manage' } },
    );
    const service = new RbacService(prisma as any, { record: jest.fn() } as any);

    await expect(service.revokePermission('actor-1', 'role-super', 'perm-roles')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.rolePermission.deleteMany.mock.calls).toHaveLength(0); // the guard must throw before ever touching the DB
  });

  it('allows revoking a permission from a non-SUPER_ADMIN role', async () => {
    const prisma = makeFakePrisma(
      { financeRole: { id: 'role-finance', name: 'FINANCE' } },
      { walletAdjust: { id: 'perm-wallet', name: 'wallet:adjust' } },
    );
    prisma._grants.add('role-finance:perm-wallet');
    const audit = { record: jest.fn() };
    const service = new RbacService(prisma as any, audit as any);

    const result = await service.revokePermission('actor-1', 'role-finance', 'perm-wallet');

    expect(result.role).toBe('FINANCE');
    expect(prisma._grants.has('role-finance:perm-wallet')).toBe(false);
  });
});

describe('RbacService.grantPermission', () => {
  it('is idempotent — granting an already-granted permission does not error', async () => {
    const prisma = makeFakePrisma(
      { financeRole: { id: 'role-finance', name: 'FINANCE' } },
      { walletAdjust: { id: 'perm-wallet', name: 'wallet:adjust' } },
    );
    const service = new RbacService(prisma as any, { record: jest.fn() } as any);

    await service.grantPermission('actor-1', 'role-finance', 'perm-wallet');
    const second = await service.grantPermission('actor-1', 'role-finance', 'perm-wallet');

    expect(second.permission).toBe('wallet:adjust');
    expect(prisma._grants.has('role-finance:perm-wallet')).toBe(true);
  });
});
