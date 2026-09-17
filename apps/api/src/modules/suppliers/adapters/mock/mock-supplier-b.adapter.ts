import { Injectable } from '@nestjs/common';
import { MockFlightSupplierAdapter } from './mock-flight-supplier.adapter';
import { MockAdapterProfile } from './mock-adapter-profile';

/** Low-cost consolidator profile: cheapest base fare, more connections, checked baggage not included (known and stated, not "unavailable"). */
const PROFILE: MockAdapterProfile = {
  supplierCode: 'MOCK_SUPPLIER_B',
  displayName: 'ValueWing Consolidator (mock)',
  currency: 'USD',
  carriers: ['AK', 'FZ', 'G9', 'BS'],
  aircraft: ['A320', 'B737'],
  baseFarePerHourUsd: 24,
  feeFlat: 12,
  markupBiasPct: -0.1,
  fareFamilies: ['Basic', 'Standard'],
  baggage: { carryOnKg: 7, note: 'Checked baggage is not included in this fare — add it during booking if needed.' },
  stopBias: 'MIXED',
  latencyMsRange: [150, 400],
  failureRateEnvVar: 'MOCK_SUPPLIER_B_FAILURE_RATE',
};

@Injectable()
export class MockSupplierBAdapter extends MockFlightSupplierAdapter {
  constructor() {
    super(PROFILE);
  }
}
