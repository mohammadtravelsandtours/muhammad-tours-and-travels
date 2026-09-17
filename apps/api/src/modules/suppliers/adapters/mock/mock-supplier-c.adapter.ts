import { Injectable } from '@nestjs/common';
import { MockFlightSupplierAdapter } from './mock-flight-supplier.adapter';
import { MockAdapterProfile } from './mock-adapter-profile';

/** Gulf-hub B2B contract-fare profile: routed via Gulf hubs, higher fees, strong baggage allowance — represents a typical authorized B2B agency contract. */
const PROFILE: MockAdapterProfile = {
  supplierCode: 'MOCK_SUPPLIER_C',
  displayName: 'GulfConnect B2B (mock)',
  currency: 'USD',
  carriers: ['EK', 'EY', 'QR', 'GF', 'WY'],
  aircraft: ['A380', 'B777', 'A350'],
  baseFarePerHourUsd: 38,
  feeFlat: 25,
  markupBiasPct: 0.05,
  fareFamilies: ['Value', 'Flex'],
  baggage: { checkedKg: 40, carryOnKg: 10 },
  stopBias: 'ONE_STOP',
  latencyMsRange: [300, 700],
  failureRateEnvVar: 'MOCK_SUPPLIER_C_FAILURE_RATE',
};

@Injectable()
export class MockSupplierCAdapter extends MockFlightSupplierAdapter {
  constructor() {
    super(PROFILE);
  }
}
