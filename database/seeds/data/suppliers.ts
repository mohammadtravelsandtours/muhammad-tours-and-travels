/**
 * The supplier rows referenced by
 * apps/api/src/modules/suppliers/adapters/**. `code` must match each
 * adapter's `supplierCode` exactly — SupplierRegistry intersects this
 * table's `active` rows with the adapters registered in code, by code.
 */
export interface SupplierSeed {
  code: string;
  name: string;
  type: 'MOCK' | 'GDS' | 'NDC';
  priority: number;
  currency: string;
  timeoutMs: number;
  /**
   * Whether SupplierRegistry may call this supplier at all — the
   * operational half of the dual gate (the other half is "registered in
   * code", fixed at deploy). Defaults to `true` when omitted, so the 5
   * existing mocks don't need to spell it out. AMADEUS_GDS ships `false`
   * — a real GDS/NDC call is never made until an admin deliberately
   * turns it on (and AMADEUS_API_KEY/SECRET are set — see
   * apps/api/src/config/configuration.ts).
   */
  active?: boolean;
  /**
   * Which env var prefix (e.g. "AMADEUS") this supplier's real
   * credentials live under, purely informational for admins looking at
   * the suppliers table — the adapter itself reads ConfigService, not
   * this column.
   */
  credentialEnvPrefix?: string;
  baseUrl?: string;
}

export const SUPPLIERS: SupplierSeed[] = [
  { code: 'MOCK_SUPPLIER_A', name: 'SkyBridge Fares (mock)', type: 'MOCK', priority: 10, currency: 'USD', timeoutMs: 4000 },
  { code: 'MOCK_SUPPLIER_B', name: 'ValueWing Consolidator (mock)', type: 'MOCK', priority: 20, currency: 'USD', timeoutMs: 4000 },
  { code: 'MOCK_SUPPLIER_C', name: 'GulfConnect B2B (mock)', type: 'MOCK', priority: 15, currency: 'USD', timeoutMs: 5000 },
  { code: 'MOCK_SUPPLIER_D', name: 'AsiaLink GDS Mock', type: 'MOCK', priority: 30, currency: 'USD', timeoutMs: 6000 },
  { code: 'MOCK_SUPPLIER_E', name: 'RegionalFly NDC Mock', type: 'MOCK', priority: 40, currency: 'USD', timeoutMs: 8000 },
  {
    code: 'AMADEUS_GDS',
    name: 'Amadeus Self-Service (real GDS/NDC)',
    type: 'NDC',
    priority: 5,
    currency: 'USD',
    timeoutMs: 8000,
    active: false,
    credentialEnvPrefix: 'AMADEUS',
    baseUrl: 'https://test.api.amadeus.com',
  },
];
