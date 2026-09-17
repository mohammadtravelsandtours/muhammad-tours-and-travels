/**
 * Seeds airport/airline reference data (see ./data/airports.ts and
 * ./data/airlines.ts). Idempotent — safe to re-run; upserts by the
 * unique iataCode.
 *
 * Run with: npm run db:seed:reference-data
 */
import { PrismaClient } from '@prisma/client';
import { AIRPORTS } from './data/airports';
import { AIRLINES } from './data/airlines';
import { HOTEL_PROPERTIES } from './data/hotel-properties';

const prisma = new PrismaClient();

async function main() {
  console.log(`Seeding ${AIRPORTS.length} airports...`);
  for (const airport of AIRPORTS) {
    await prisma.airport.upsert({
      where: { iataCode: airport.iataCode },
      create: airport,
      update: airport,
    });
  }

  console.log(`Seeding ${AIRLINES.length} airlines...`);
  for (const airline of AIRLINES) {
    await prisma.airline.upsert({
      where: { iataCode: airline.iataCode },
      create: airline,
      update: airline,
    });
  }

  // HotelProperty has no natural unique business key to upsert on, so
  // this is a plain insert-if-missing-by-name+city rather than a real
  // upsert — fine for a small hand-curated demo seed, re-running it just
  // skips rows already present.
  console.log(`Seeding ${HOTEL_PROPERTIES.length} hotel properties...`);
  for (const property of HOTEL_PROPERTIES) {
    const existing = await prisma.hotelProperty.findFirst({ where: { name: property.name, city: property.city } });
    if (!existing) {
      await prisma.hotelProperty.create({ data: property });
    }
  }

  console.log('Reference data seed complete.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
