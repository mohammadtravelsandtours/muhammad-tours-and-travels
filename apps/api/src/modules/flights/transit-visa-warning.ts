import { NormalizedFlightOffer } from '@mohammad-travels/types';

/**
 * Deliberately conservative. This is NOT a visa/immigration
 * determination engine and must never be presented as one — whether a
 * transit visa is actually required depends on the passenger's
 * nationality, the specific connecting country's rules, layover
 * duration, and whether they leave the airside area, none of which this
 * function determines. It only flags "this itinerary has a connection,
 * and you gave us a nationality" as a generic heads-up to go verify —
 * and stays silent (returns null) whenever it doesn't have enough to
 * say even that much, rather than guessing.
 */
export function buildTransitVisaWarning(
  offer: NormalizedFlightOffer,
  nationality?: string,
): Record<string, unknown> | null {
  if (!nationality) return null;
  if (offer.segments.length <= 1) return null; // nonstop — nothing to transit through

  const connectionPoints = offer.segments.slice(0, -1).map((s) => s.destination);

  return {
    hasConnections: true,
    connectionPoints,
    isLegalAdvice: false,
    disclaimer:
      "This itinerary includes one or more connections. Depending on your nationality and the connecting country's rules, a transit visa may be required even if you don't leave the airport. This is general guidance only, not a visa determination — confirm requirements with the relevant embassy or your airline before booking.",
  };
}
