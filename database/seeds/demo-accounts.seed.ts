/**
 * Demo/staging-only accounts that exercise the gates and workflows added
 * in Phase 3/5/6 — nothing in the real app creates a B2B agency, a
 * corporate account, or their supporting rows on its own (self-registration
 * only creates a PENDING_APPROVAL agency; a Corporate is admin-provisioned
 * via CorporateAdminModule) — so without this script there is no ACTIVE
 * agency to book against and no configured TravelPolicy to auto-approve or
 * escalate a booking. Deliberately NOT chained into `db:seed` (unlike
 * reference-data/suppliers): demo login credentials are not something to
 * create by default in every environment, staging included, without an
 * explicit `npm run db:seed:demo`.
 *
 * Idempotent — safe to re-run; upserts/find-or-creates by email/name.
 * Run with: npm run db:seed:demo (after db:seed and db:seed:reference-data)
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'DemoPass123!';

async function ensureUser(email: string, fullName: string, roleName: string) {
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: { email, fullName, passwordHash: await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id }) },
    });
  }
  const role = await prisma.role.findUnique({ where: { name: roleName } });
  if (role) {
    const existingGrant = await prisma.userRole.findUnique({ where: { userId_roleId: { userId: user.id, roleId: role.id } } }).catch(() => null);
    if (!existingGrant) {
      await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    }
  }
  return user;
}

async function main() {
  // ── B2B: one ACTIVE agency with a funded wallet ──────────────────────
  console.log('Seeding demo B2B agency...');
  let agency = await prisma.b2BAgency.findFirst({ where: { name: 'Demo Travel Partners' } });
  if (!agency) {
    agency = await prisma.b2BAgency.create({
      data: { name: 'Demo Travel Partners', status: 'ACTIVE', country: 'BD', currency: 'USD', creditLimit: 500, creditEnabled: true, approvedAt: new Date() },
    });
  } else if (agency.status !== 'ACTIVE') {
    agency = await prisma.b2BAgency.update({ where: { id: agency.id }, data: { status: 'ACTIVE', approvedAt: agency.approvedAt ?? new Date() } });
  }

  const wallet = await prisma.wallet.upsert({
    where: { agencyId: agency.id },
    create: { agencyId: agency.id, currency: agency.currency, balance: 2000 },
    update: {},
  });
  if (Number(wallet.balance) === 0) {
    // Keep the ledger invariant intact (balance == sum of its own
    // transactions — see WalletService's doc comment) rather than just
    // setting wallets.balance directly.
    await prisma.$transaction([
      prisma.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'DEPOSIT',
          credit: 2000,
          previousBalance: 0,
          newBalance: 2000,
          currency: wallet.currency,
          description: 'Demo seed deposit',
          idempotencyKey: `seed:deposit:${agency.id}`,
        },
      }),
      prisma.wallet.update({ where: { id: wallet.id }, data: { balance: 2000 } }),
    ]);
  }

  const agentUser = await ensureUser('agent@demo.mohammadtravels.example', 'Demo Agency Admin', 'B2B_AGENCY_ADMIN');
  const existingAgent = await prisma.agent.findUnique({ where: { userId: agentUser.id } });
  if (!existingAgent) {
    await prisma.agent.create({ data: { userId: agentUser.id, agencyId: agency.id, title: 'Owner' } });
  }
  console.log(`  Agency "${agency.name}" is ACTIVE with a ${wallet.currency} 2000 wallet. Login: agent@demo.mohammadtravels.example`);

  const b2bAgentUser = await ensureUser('b2bagent@demo.mohammadtravels.example', 'Demo B2B Agent', 'B2B_AGENT');
  const existingB2BAgent = await prisma.agent.findUnique({ where: { userId: b2bAgentUser.id } });
  if (!existingB2BAgent) {
    await prisma.agent.create({ data: { userId: b2bAgentUser.id, agencyId: agency.id, title: 'Travel Agent' } });
  }

  // ── B2C customer ─────────────────────────────────────────────────────
  const customerUser = await ensureUser('customer@demo.mohammadtravels.example', 'Demo Customer', 'B2C_CUSTOMER');
  const existingCustomer = await prisma.customer.findUnique({ where: { userId: customerUser.id } });
  if (!existingCustomer) {
    await prisma.customer.create({ data: { userId: customerUser.id, phone: '+8801700000000', country: 'BD' } });
  }

  // ── Operations / Finance demo staff ──────────────────────────────────
  await ensureUser('ops@demo.mohammadtravels.example', 'Demo Operations', 'OPS_SUPPORT');
  await ensureUser('finance@demo.mohammadtravels.example', 'Demo Finance', 'FINANCE');

  // ── Corporate: one company with a cost center and a configured policy ──
  console.log('Seeding demo corporate account...');
  let corporate = await prisma.corporate.findFirst({ where: { name: 'Demo Corporate Ltd' } });
  if (!corporate) {
    corporate = await prisma.corporate.create({ data: { name: 'Demo Corporate Ltd' } });
  }

  let department = await prisma.department.findFirst({ where: { corporateId: corporate.id, name: 'Sales' } });
  if (!department) {
    department = await prisma.department.create({ data: { corporateId: corporate.id, name: 'Sales' } });
  }

  let costCenter = await prisma.costCenter.findUnique({ where: { corporateId_code: { corporateId: corporate.id, code: 'SALES-01' } } }).catch(() => null);
  if (!costCenter) {
    costCenter = await prisma.costCenter.create({ data: { corporateId: corporate.id, code: 'SALES-01', name: 'Sales Travel' } });
  }

  await prisma.travelPolicy.upsert({
    where: { corporateId: corporate.id },
    create: {
      corporateId: corporate.id,
      name: 'Standard policy',
      maxCabin: 'BUSINESS',
      blockOverMaxCabin: true,
      softFareCapAmount: 1500,
      hardFareCapAmount: 4000,
      currency: 'USD',
    },
    update: {},
  });

  const employeeUser = await ensureUser('employee@demo.mohammadtravels.example', 'Demo Employee', 'CORPORATE_EMPLOYEE');
  const existingEmployee = await prisma.employee.findUnique({ where: { userId: employeeUser.id } });
  if (!existingEmployee) {
    await prisma.employee.create({ data: { userId: employeeUser.id, corporateId: corporate.id, departmentId: department.id, costCenterId: costCenter.id, title: 'Sales Rep' } });
  }

  const approverUser = await ensureUser('approver@demo.mohammadtravels.example', 'Demo Approver', 'CORPORATE_APPROVER');
  const existingApprover = await prisma.employee.findUnique({ where: { userId: approverUser.id } });
  if (!existingApprover) {
    await prisma.employee.create({ data: { userId: approverUser.id, corporateId: corporate.id, departmentId: department.id, title: 'Sales Manager' } });
  }

  console.log(`  Corporate "${corporate.name}" has a policy (BUSINESS max, $1500 soft / $4000 hard USD cap) and cost center ${costCenter.code}.`);
  console.log('  Logins: employee@demo.mohammadtravels.example (books), approver@demo.mohammadtravels.example (approves)');
  console.log('  Additional logins: b2bagent@demo.mohammadtravels.example, customer@demo.mohammadtravels.example, ops@demo.mohammadtravels.example, finance@demo.mohammadtravels.example');
  console.log(`  All demo accounts share the password: ${DEMO_PASSWORD} (override with SEED_DEMO_PASSWORD)`);
  console.log('Demo accounts seed complete.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
