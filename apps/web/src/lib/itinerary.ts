import { FlightOffer, OfferLeg } from './flight-types';

/**
 * "Departing"/"Returning" for a 2-leg (round trip) offer, "Flight N" for
 * a MULTI_CITY leg, or null for a single-leg (ONE_WAY) offer where no
 * label is needed at all.
 */
export function legLabel(index: number, total: number): string | null {
  if (total <= 1) return null;
  if (total === 2) return index === 0 ? 'Departing' : 'Returning';
  return `Flight ${index + 1}`;
}

/**
 * Falls back to one pseudo-leg spanning every segment only against an
 * older API response that hasn't sent `legs` yet, so a stale cache
 * entry degrades to the old flat behavior instead of crashing.
 */
export function legsFor(offer: FlightOffer): OfferLeg[] {
  if (offer.legs && offer.legs.length > 0) return offer.legs;
  if (offer.segments.length === 0) return [];
  return [
    {
      origin: offer.segments[0].origin,
      destination: offer.segments[offer.segments.length - 1].destination,
      departureAt: offer.segments[0].departureAt,
      arrivalAt: offer.segments[offer.segments.length - 1].arrivalAt,
      durationMinutes: offer.totalDurationMinutes,
      stops: offer.stops,
      segments: offer.segments,
      layovers: [],
    },
  ];
}

/** "JFK → LHR" one-way, "JFK ⇄ LHR" a symmetric round trip, or the full waypoint chain for multi-city. */
export function routeSummary(legs: OfferLeg[]): string {
  if (legs.length === 0) return '';
  if (legs.length === 2 && legs[0].origin === legs[1].destination && legs[0].destination === legs[1].origin) {
    return `${legs[0].origin} ⇄ ${legs[0].destination}`;
  }
  return [legs[0].origin, ...legs.map((l) => l.destination)].join(' → ');
}
