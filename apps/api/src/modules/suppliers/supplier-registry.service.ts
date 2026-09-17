import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { FlightSupplierAdapter } from '@mohammad-travels/types';
import { PrismaService } from '../../prisma/prisma.service';
import { SUPPLIER_ADAPTERS } from './supplier-adapters.token';

export interface ActiveSupplier {
  supplier: { id: string; code: string; priority: number; timeoutMs: number };
  adapter: FlightSupplierAdapter;
}

/**
 * The single place the rest of the platform goes to reach a supplier —
 * nothing outside this module (and nothing in a controller, ever) should
 * import a concrete adapter class directly. See
 * docs/SUPPLIER-INTEGRATION.md: "the core platform depends on
 * FlightSupplierAdapter, never on a specific supplier's implementation."
 *
 * Two independent gates decide whether a supplier is actually callable:
 *  - Registered in code (this process has an adapter instance for it —
 *    fixed at boot, changes only with a deploy).
 *  - Marked `active` in the `suppliers` table (an operational switch an
 *    admin can flip without a deploy, e.g. to pull a misbehaving
 *    supplier out of rotation).
 * `getActiveAdapters()` is the only method the search orchestrator
 * (Step 6) should call — it intersects both.
 */
@Injectable()
export class SupplierRegistry implements OnModuleInit {
  private readonly logger = new Logger(SupplierRegistry.name);
  private readonly adaptersByCode = new Map<string, FlightSupplierAdapter>();

  constructor(
    @Inject(SUPPLIER_ADAPTERS) private readonly adapters: FlightSupplierAdapter[],
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    for (const adapter of this.adapters) {
      if (this.adaptersByCode.has(adapter.supplierCode)) {
        // A duplicate supplierCode is a wiring bug, not something to
        // silently shadow — fail loudly at boot rather than have two
        // adapters race for the same code at request time.
        throw new Error(`SupplierRegistry: duplicate supplierCode "${adapter.supplierCode}" registered`);
      }
      this.adaptersByCode.set(adapter.supplierCode, adapter);
    }
    this.logger.log(
      `Registered ${this.adaptersByCode.size} supplier adapter(s): ${[...this.adaptersByCode.keys()].join(', ')}`,
    );
  }

  /** Every adapter code this process can call, regardless of the database's `active` flag. */
  getAllRegisteredCodes(): string[] {
    return [...this.adaptersByCode.keys()];
  }

  /** Look up one adapter by code — for reprice/booking flows that already know which supplier an offer came from. */
  get(code: string): FlightSupplierAdapter | undefined {
    return this.adaptersByCode.get(code);
  }

  /** Suppliers this process can call right now: registered in code AND active in the database, ordered by priority. */
  async getActiveAdapters(): Promise<ActiveSupplier[]> {
    const registeredCodes = this.getAllRegisteredCodes();
    if (registeredCodes.length === 0) return [];

    const activeSuppliers = await this.prisma.supplier.findMany({
      where: { active: true, code: { in: registeredCodes } },
      orderBy: { priority: 'asc' },
      select: { id: true, code: true, priority: true, timeoutMs: true },
    });

    const resolved: ActiveSupplier[] = [];
    for (const supplier of activeSuppliers) {
      const adapter = this.adaptersByCode.get(supplier.code);
      if (!adapter) continue; // shouldn't happen given the `code: { in: registeredCodes }` filter, but never trust a join blindly
      resolved.push({ supplier, adapter });
    }
    return resolved;
  }
}
