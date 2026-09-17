import { createHash } from 'crypto';
import { NormalizedFlightOffer } from '@mohammad-travels/types';

/**
 * Identifies "the same itinerary/cabin/fare family" regardless of which
 * supplier offered it — see FlightOffer.fingerprint's doc comment in
 * schema.prisma. Two offers with the same fingerprint from different
 * suppliers are the same product to a traveler, so only the cheaper one
 * is kept (see FlightNormalizationService).
 *
 * With independent mock suppliers using random carriers/flight numbers,
 * collisions between different suppliers essentially never happen in
 * this demo — the mechanism exists and is exercised (two fare families
 * from the *same* supplier never collide by construction), but real-
 * world overlap between suppliers is what actually exercises the
 * cross-supplier dedup path.
 */
export function computeFingerprint(offer: NormalizedFlightOffer): string {
  const segmentsKey = offer.segments
    .map((s) => `${s.marketingCarrier}${s.flightNumber}:${s.departureAt}`)
    .join('>');
  return createHash('sha1').update(`${offer.cabin}|${offer.fareFamily}|${segmentsKey}`).digest('hex');
}
