import { Injectable } from '@nestjs/common';
import { MockHotelSupplierAdapter } from './mock-hotel-supplier.adapter';
import { MockHotelAdapterProfile } from './mock-hotel-adapter-profile';

/** Full-service chain-style profile: pricier, broader board options. */
const PROFILE: MockHotelAdapterProfile = {
  supplierCode: 'MOCK_HOTEL_A',
  displayName: 'StaySuite Hotels (mock)',
  currency: 'USD',
  baseNightlyRate: 60,
  feeFlat: 6,
  markupBiasPct: 0.1,
  roomTypes: ['Standard Room', 'Executive Suite'],
  boardOptions: ['ROOM_ONLY', 'BREAKFAST', 'HALF_BOARD'],
  latencyMsRange: [200, 500],
  failureRateEnvVar: 'MOCK_HOTEL_A_FAILURE_RATE',
};

@Injectable()
export class MockHotelSupplierAAdapter extends MockHotelSupplierAdapter {
  constructor() {
    super(PROFILE);
  }
}
