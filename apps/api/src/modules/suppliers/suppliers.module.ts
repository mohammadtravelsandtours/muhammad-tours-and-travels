import { Module } from '@nestjs/common';
import { SupplierRegistry } from './supplier-registry.service';
import { SUPPLIER_ADAPTERS } from './supplier-adapters.token';
import { MockSupplierAAdapter } from './adapters/mock/mock-supplier-a.adapter';
import { MockSupplierBAdapter } from './adapters/mock/mock-supplier-b.adapter';
import { MockSupplierCAdapter } from './adapters/mock/mock-supplier-c.adapter';
import { MockSupplierDAdapter } from './adapters/mock/mock-supplier-d.adapter';
import { MockSupplierEAdapter } from './adapters/mock/mock-supplier-e.adapter';
import { AmadeusFlightSupplierAdapter } from './adapters/real/amadeus-flight-supplier.adapter';
import { FlightSupplierAdapter } from '@mohammad-travels/types';

/**
 * Registers every known supplier adapter and exposes them only through
 * SupplierRegistry. Adding a 6th supplier (mock or real) means adding it
 * to the two lists below — nothing outside this module should ever
 * reference a concrete adapter class.
 *
 * AmadeusFlightSupplierAdapter (real, code AMADEUS_GDS) is always
 * registered here — this list is "known to the deploy", not "safe to
 * call" — but ships seeded `active: false` in the `suppliers` table
 * (see database/seeds/data/suppliers.ts), so SupplierRegistry's dual
 * gate (registered AND active) keeps it out of live search until an
 * admin flips it on, by which point AMADEUS_API_KEY/SECRET must also be
 * set or every call it makes fails closed with "not configured".
 */
@Module({
  providers: [
    MockSupplierAAdapter,
    MockSupplierBAdapter,
    MockSupplierCAdapter,
    MockSupplierDAdapter,
    MockSupplierEAdapter,
    AmadeusFlightSupplierAdapter,
    {
      provide: SUPPLIER_ADAPTERS,
      useFactory: (
        a: MockSupplierAAdapter,
        b: MockSupplierBAdapter,
        c: MockSupplierCAdapter,
        d: MockSupplierDAdapter,
        e: MockSupplierEAdapter,
        amadeus: AmadeusFlightSupplierAdapter,
      ): FlightSupplierAdapter[] => [a, b, c, d, e, amadeus],
      inject: [
        MockSupplierAAdapter,
        MockSupplierBAdapter,
        MockSupplierCAdapter,
        MockSupplierDAdapter,
        MockSupplierEAdapter,
        AmadeusFlightSupplierAdapter,
      ],
    },
    SupplierRegistry,
  ],
  exports: [SupplierRegistry],
})
export class SuppliersModule {}
