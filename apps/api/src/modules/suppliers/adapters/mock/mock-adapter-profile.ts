import { CabinClass } from '@mohammad-travels/types';

/**
 * Everything that makes one mock supplier genuinely different from
 * another lives here — the adapter class itself (mock-flight-supplier.adapter.ts)
 * is shared logic that just reads whichever profile it's constructed with.
 */
export interface MockAdapterProfile {
  supplierCode: string;
  displayName: string;
  currency: string;
  /** IATA 2-letter carrier codes this supplier sells fares for. */
  carriers: string[];
  aircraft: string[];
  /** Rough base fare per hour of flight time, before this supplier's markup bias and cabin/pax multipliers. Mock economics, not a real fare model. */
  baseFarePerHourUsd: number;
  feeFlat: number;
  /** Flavors this supplier's pricing relative to the others (e.g. a consolidator runs cheaper, a Gulf-carrier B2B fare runs dearer). */
  markupBiasPct: number;
  fareFamilies: [cheaper: string, flexible: string];
  baggage: { checkedKg?: number; carryOnKg?: number; note?: string };
  stopBias: 'NONSTOP' | 'ONE_STOP' | 'MIXED';
  latencyMsRange: [number, number];
  /** Env var name read at request time (not construction time) for a 0..1 simulated failure rate — defaults to 0, so ordinary searches never fail unless a developer deliberately dials it up to exercise Step 6's partial-failure handling. */
  failureRateEnvVar: string;
}

export const CABIN_MULTIPLIER: Record<CabinClass, number> = {
  ECONOMY: 1,
  PREMIUM_ECONOMY: 1.6,
  BUSINESS: 3.2,
  FIRST: 5.5,
};
