import { Injectable } from '@nestjs/common';
import { MockHotelSupplierAdapter } from './mock-hotel-supplier.adapter';
import { MockHotelAdapterProfile } from './mock-hotel-adapter-profile';

/** Budget-consolidator profile: cheaper, room-only or breakfast-only. */
const PROFILE: MockHotelAdapterProfile = {
  supplierCode: 'MOCK_HOTEL_B',
  displayName: 'BudgetNest (mock)',
  currency: 'USD',
  baseNightlyRate: 40,
  feeFlat: 3,
  markupBiasPct: -0.05,
  roomTypes: ['Economy Room', 'Deluxe Room'],
  boardOptions: ['ROOM_ONLY', 'BREAKFAST'],
  latencyMsRange: [150, 400],
  failureRateEnvVar: 'MOCK_HOTEL_B_FAILURE_RATE',
};

@Injectable()
export class MockHotelSupplierBAdapter extends MockHotelSupplierAdapter {
  constructor() {
    super(PROFILE);
  }
}
