/**
 * Seeds roles, permissions, and their default mappings from
 * @mohammad-travels/types (the single source of truth for what
 * permissions exist — see packages/types/src/roles.ts), plus one
 * bootstrap SUPER_ADMIN account for local/staging use.
 *
 * Run with: npm run db:seed (after `prisma migrate deploy`)
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { DEFAULT_ROLE_PERMISSIONS, Permission, Role } from '@mohammad-travels/types';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding permissions...');
  for (const permission of Object.values(Permission)) {
    await prisma.permission.upsert({
      where: { name: permission },
      create: { name: permission },
      update: {},
    });
  }

  console.log('Seeding roles...');
  for (const role of Object.values(Role)) {
    await prisma.role.upsert({
      where: { name: role },
      create: { name: role },
      update: {},
    });
  }

  console.log('Wiring default role → permission grants...');
  for (const [roleName, permissions] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
    for (const permissionName of permissions) {
      const permission = await prisma.permission.findUniqueOrThrow({ where: { name: permissionName } });
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        create: { roleId: role.id, permissionId: permission.id },
        update: {},
      });
    }
  }

  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@mohammadtravels.example';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!Now';

  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existingAdmin) {
    console.log(`Creating bootstrap SUPER_ADMIN: ${adminEmail}`);
    const superAdminRole = await prisma.role.findUniqueOrThrow({ where: { name: Role.SUPER_ADMIN } });
    const admin = await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash: await argon2.hash(adminPassword, { type: argon2.argon2id }),
        fullName: 'Platform Super Admin',
      },
    });
    await prisma.userRole.create({ data: { userId: admin.id, roleId: superAdminRole.id } });
    console.log('⚠️  Change this password immediately after first login.');
  } else {
    console.log('Bootstrap admin already exists, skipping.');
  }

  console.log('Seed complete.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
