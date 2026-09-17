import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { HotelSupplierAdapter } from '@mohammad-travels/types';
import { HOTEL_SUPPLIER_ADAPTERS } from './hotel-supplier-adapters.token';

/**
 * Hotel counterpart of suppliers/supplier-registry.service.ts's
 * SupplierRegistry, deliberately simpler: hotel suppliers have no
 * `suppliers` database row (see HotelSearch's schema.prisma doc comment
 * for why), so there is no operational active/inactive switch or
 * per-supplier timeout config to intersect against — every adapter
 * registered in code is always considered active. Adding a real
 * (non-mock) hotel supplier later and wanting an admin on/off switch is
 * a reasonable time to fold this into the same `suppliers` table
 * SupplierRegistry uses instead of maintaining two parallel registries.
 */
@Injectable()
export class HotelSupplierRegistry implements OnModuleInit {
  private readonly logger = new Logger(HotelSupplierRegistry.name);
  private readonly adaptersByCode = new Map<string, HotelSupplierAdapter>();

  constructor(@Inject(HOTEL_SUPPLIER_ADAPTERS) private readonly adapters: HotelSupplierAdapter[]) {}

  onModuleInit(): void {
    for (const adapter of this.adapters) {
      if (this.adaptersByCode.has(adapter.supplierCode)) {
        throw new Error(`HotelSupplierRegistry: duplicate supplierCode "${adapter.supplierCode}" registered`);
      }
      this.adaptersByCode.set(adapter.supplierCode, adapter);
    }
    this.logger.log(`Registered ${this.adaptersByCode.size} hotel supplier adapter(s): ${[...this.adaptersByCode.keys()].join(', ')}`);
  }

  get(code: string): HotelSupplierAdapter | undefined {
    return this.adaptersByCode.get(code);
  }

  getAll(): HotelSupplierAdapter[] {
    return [...this.adaptersByCode.values()];
  }
}
