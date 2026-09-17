import { Injectable } from '@nestjs/common';
import { MockFlightSupplierAdapter } from './mock-flight-supplier.adapter';
import { MockAdapterProfile } from './mock-adapter-profile';

/** Full-service legacy-carrier profile: pricier, mostly nonstop, generous baggage, no simulated failures by default. */
const PROFILE: MockAdapterProfile = {
  supplierCode: 'MOCK_SUPPLIER_A',
  displayName: 'SkyBridge Fares (mock)',
  currency: 'USD',
  carriers: ['BG', 'EK', 'QR', 'SQ'],
  aircraft: ['A350', 'A380', 'B777', 'B787'],
  baseFarePerHourUsd: 42,
  feeFlat: 18,
  markupBiasPct: 0.08,
  fareFamilies: ['Economy Saver', 'Economy Flex'],
  baggage: { checkedKg: 30, carryOnKg: 7 },
  stopBias: 'NONSTOP',
  latencyMsRange: [200, 500],
  failureRateEnvVar: 'MOCK_SUPPLIER_A_FAILURE_RATE',
};

@Injectable()
export class MockSupplierAAdapter extends MockFlightSupplierAdapter {
  constructor() {
    super(PROFILE);
  }
}
