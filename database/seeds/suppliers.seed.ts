/**
 * Seeds the supplier rows (see ./data/suppliers.ts) and a corresponding
 * UNKNOWN SupplierHealth row for each — idempotent, upserts by the
 * unique `code`.
 *
 * Run with: npm run db:seed:suppliers
 */
import { PrismaClient } from '@prisma/client';
import { SUPPLIERS } from './data/suppliers';

const prisma = new PrismaClient();

async function main() {
  console.log(`Seeding ${SUPPLIERS.length} suppliers...`);
  for (const supplier of SUPPLIERS) {
    // `active` defaults to true when the seed entry omits it, matching
    // the existing mock suppliers' always-on behavior; only a supplier
    // that explicitly opts out (e.g. AMADEUS_GDS: active: false) starts
    // disabled.
    const active = supplier.active ?? true;
    const row = await prisma.supplier.upsert({
      where: { code: supplier.code },
      create: {
        code: supplier.code,
        name: supplier.name,
        type: supplier.type,
        priority: supplier.priority,
        currency: supplier.currency,
        timeoutMs: supplier.timeoutMs,
        active,
        baseUrl: supplier.baseUrl,
        credentialEnvPrefix: supplier.credentialEnvPrefix,
        // Real suppliers with an env-var credential prefix aren't
        // "configured" just because a seed row exists — that only
        // becomes true once the operator actually sets those env vars,
        // which this script has no way to check. MOCK suppliers need no
        // real credentials at all.
        credentialStatus: 'NOT_CONFIGURED',
      },
      update: {
        name: supplier.name,
        priority: supplier.priority,
        currency: supplier.currency,
        timeoutMs: supplier.timeoutMs,
        baseUrl: supplier.baseUrl,
        credentialEnvPrefix: supplier.credentialEnvPrefix,
        // Deliberately NOT updating `active` on an existing row — once a
        // supplier exists, whether it's live is an operational decision
        // an admin makes in the app, not something a re-run of this
        // seed script should silently flip back.
      },
    });

    await prisma.supplierHealth.upsert({
      where: { supplierId: row.id },
      create: { supplierId: row.id, status: 'UNKNOWN' },
      update: {},
    });
  }

  console.log('Supplier seed complete.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
