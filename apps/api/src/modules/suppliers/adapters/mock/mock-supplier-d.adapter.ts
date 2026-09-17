import { Injectable } from '@nestjs/common';
import { MockFlightSupplierAdapter } from './mock-flight-supplier.adapter';
import { MockAdapterProfile } from './mock-adapter-profile';

/**
 * Southeast Asia GDS-style profile: mid-range pricing, mixed routing.
 * Has a non-zero-capable failure hook (MOCK_SUPPLIER_D_FAILURE_RATE,
 * defaults to 0/off) so the Step 6 search orchestrator's per-supplier
 * timeout/partial-failure handling has a real supplier to test against
 * on demand, without making ordinary searches flaky.
 */
const PROFILE: MockAdapterProfile = {
  supplierCode: 'MOCK_SUPPLIER_D',
  displayName: 'AsiaLink GDS Mock',
  currency: 'USD',
  carriers: ['SQ', 'MH', 'TG', 'GA', 'VN'],
  aircraft: ['A330', 'B737', 'A320'],
  baseFarePerHourUsd: 30,
  feeFlat: 15,
  markupBiasPct: 0,
  fareFamilies: ['Lite', 'Plus'],
  baggage: { checkedKg: 20, carryOnKg: 7 },
  stopBias: 'MIXED',
  latencyMsRange: [400, 1200],
  failureRateEnvVar: 'MOCK_SUPPLIER_D_FAILURE_RATE',
};

@Injectable()
export class MockSupplierDAdapter extends MockFlightSupplierAdapter {
  constructor() {
    super(PROFILE);
  }
}
