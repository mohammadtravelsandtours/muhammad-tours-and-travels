/**
 * Same "personality lives in data, not code" pattern as
 * suppliers/adapters/mock/mock-adapter-profile.ts — MockHotelSupplierAdapter
 * is the shared engine, this is what makes MOCK_HOTEL_A feel different
 * from MOCK_HOTEL_B (price level, room names, latency).
 */
export interface MockHotelAdapterProfile {
  supplierCode: string;
  displayName: string;
  currency: string;
  /** Rough nightly rate for a standard room at a mid-market property, before this supplier's markup bias and the property's own star-rating multiplier. Mock economics, not a real rate model. */
  baseNightlyRate: number;
  feeFlat: number;
  markupBiasPct: number;
  roomTypes: [standard: string, upgraded: string];
  boardOptions: Array<'ROOM_ONLY' | 'BREAKFAST' | 'HALF_BOARD' | 'FULL_BOARD'>;
  latencyMsRange: [number, number];
  /** Env var read at request time for a 0..1 simulated failure rate — see the flight mock adapter's identical field for why this exists. */
  failureRateEnvVar: string;
}
