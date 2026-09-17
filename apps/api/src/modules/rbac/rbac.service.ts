import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class RbacService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listRoles() {
    return this.prisma.role.findMany({
      include: { permissions: { include: { permission: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async listPermissions() {
    return this.prisma.permission.findMany({ orderBy: { name: 'asc' } });
  }

  /**
   * Search-by-substring user lookup for the admin RBAC screen — the
   * only way to find WHO to assign a role to, since no other admin
   * endpoint lists users at all yet (Users admin CRUD is its own,
   * larger, not-yet-built surface). Deliberately capped and read-only.
   */
  async listUsers(search: string | undefined, take = 20) {
    return this.prisma.user.findMany({
      where: {
        deletedAt: null,
        ...(search
          ? { OR: [{ email: { contains: search, mode: 'insensitive' } }, { fullName: { contains: search, mode: 'insensitive' } }] }
          : {}),
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        isActive: true,
        roles: { select: { role: { select: { id: true, name: true } } } },
      },
      orderBy: { email: 'asc' },
      take: Math.min(take, 50),
    });
  }

  /**
   * Assigns a role to a user. Only ever called behind
   * @RequirePermissions(Permission.ROLES_MANAGE) at the controller —
   * this service does not re-check permissions itself, by design: a
   * service that both enforces and performs authorization tends to grow
   * inconsistent copies of the same rule. Authorization lives in guards.
   */
  async assignRole(actingUserId: string, targetUserId: string, roleName: string) {
    const [user, role] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: targetUserId } }),
      this.prisma.role.findUnique({ where: { name: roleName } }),
    ]);

    if (!user) throw new NotFoundException('User not found');
    if (!role) throw new NotFoundException(`Role '${roleName}' not found`);

    if (roleName === 'SUPER_ADMIN' && actingUserId === targetUserId) {
      // A super admin should never be able to self-elevate further or
      // accidentally strip their own last admin role via this endpoint.
      throw new ForbiddenException('Cannot modify your own SUPER_ADMIN role assignment here');
    }

    await this.prisma.userRole.upsert({
      where: { userId_roleId: { userId: targetUserId, roleId: role.id } },
      create: { userId: targetUserId, roleId: role.id },
      update: {},
    });

    await this.audit.record({
      userId: actingUserId,
      action: 'ROLE_ASSIGNED',
      resource: 'user',
      resourceId: targetUserId,
      newValue: { role: roleName },
    });

    return { userId: targetUserId, role: roleName };
  }

  async revokeRole(actingUserId: string, targetUserId: string, roleName: string) {
    const role = await this.prisma.role.findUnique({ where: { name: roleName } });
    if (!role) throw new NotFoundException(`Role '${roleName}' not found`);

    if (roleName === 'SUPER_ADMIN' && actingUserId === targetUserId) {
      throw new ForbiddenException('Cannot modify your own SUPER_ADMIN role assignment here');
    }

    await this.prisma.userRole.deleteMany({ where: { userId: targetUserId, roleId: role.id } });

    await this.audit.record({
      userId: actingUserId,
      action: 'ROLE_REVOKED',
      resource: 'user',
      resourceId: targetUserId,
      oldValue: { role: roleName },
    });

    return { userId: targetUserId, role: roleName };
  }

  /**
   * Grants a permission to a role — the actual "RBAC management" lever
   * (assignRole/revokeRole above only change which roles a USER has;
   * this changes what a ROLE itself can do). Idempotent: granting an
   * already-granted permission is a no-op, not an error, since a UI
   * checkbox that's already checked shouldn't fail to "check" again.
   */
  async grantPermission(actingUserId: string, roleId: string, permissionId: string) {
    const [role, permission] = await Promise.all([
      this.prisma.role.findUnique({ where: { id: roleId } }),
      this.prisma.permission.findUnique({ where: { id: permissionId } }),
    ]);
    if (!role) throw new NotFoundException('Role not found');
    if (!permission) throw new NotFoundException('Permission not found');

    await this.prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId, permissionId } },
      create: { roleId, permissionId },
      update: {},
    });

    await this.audit.record({
      userId: actingUserId,
      action: 'ROLE_PERMISSION_GRANTED',
      resource: 'role',
      resourceId: roleId,
      newValue: { role: role.name, permission: permission.name },
    });

    return { roleId, permissionId, role: role.name, permission: permission.name };
  }

  /**
   * Revokes a permission from a role. SUPER_ADMIN is refused outright —
   * see the thrown message. This isn't merely a nicety: the only thing
   * that could ever re-grant a permission this endpoint just removed
   * IS the ROLES_MANAGE permission itself, which lives on SUPER_ADMIN.
   * Strip it from SUPER_ADMIN by mistake and nothing short of a direct
   * database write can undo it — refusing is cheap, the failure mode
   * being refused against is not.
   */
  async revokePermission(actingUserId: string, roleId: string, permissionId: string) {
    const [role, permission] = await Promise.all([
      this.prisma.role.findUnique({ where: { id: roleId } }),
      this.prisma.permission.findUnique({ where: { id: permissionId } }),
    ]);
    if (!role) throw new NotFoundException('Role not found');
    if (!permission) throw new NotFoundException('Permission not found');

    if (role.name === 'SUPER_ADMIN') {
      throw new ForbiddenException("SUPER_ADMIN's permissions cannot be edited from this UI — it must always hold every permission");
    }

    await this.prisma.rolePermission.deleteMany({ where: { roleId, permissionId } });

    await this.audit.record({
      userId: actingUserId,
      action: 'ROLE_PERMISSION_REVOKED',
      resource: 'role',
      resourceId: roleId,
      oldValue: { role: role.name, permission: permission.name },
    });

    return { roleId, permissionId, role: role.name, permission: permission.name };
  }
}
