import { Injectable } from '@nestjs/common';
import { MockFlightSupplierAdapter } from './mock-flight-supplier.adapter';
import { MockAdapterProfile } from './mock-adapter-profile';

/**
 * Bangladesh/South Asia regional NDC-style profile: cheapest regional
 * routing, slowest simulated latency (a smaller/legacy connection), and
 * genuinely unknown baggage data for this fare — set as `note`, never
 * invented as a number. Also carries a failure-rate hook, same purpose
 * as Supplier D's.
 */
const PROFILE: MockAdapterProfile = {
  supplierCode: 'MOCK_SUPPLIER_E',
  displayName: 'RegionalFly NDC Mock',
  currency: 'USD',
  carriers: ['BG', 'BS', 'AI', 'UL', 'RA'],
  aircraft: ['B737', 'A320', 'Q400'],
  baseFarePerHourUsd: 20,
  feeFlat: 10,
  markupBiasPct: -0.05,
  fareFamilies: ['Regional Saver', 'Regional Flex'],
  baggage: { carryOnKg: 5, note: 'Baggage information unavailable from this supplier for this fare — confirm with the airline before travel.' },
  stopBias: 'ONE_STOP',
  latencyMsRange: [500, 1500],
  failureRateEnvVar: 'MOCK_SUPPLIER_E_FAILURE_RATE',
};

@Injectable()
export class MockSupplierEAdapter extends MockFlightSupplierAdapter {
  constructor() {
    super(PROFILE);
  }
}
