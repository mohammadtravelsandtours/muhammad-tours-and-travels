/**
 * A FlightOffer's `segments` are stored as ONE flat, sequence-ordered
 * list across every searched leg (see FlightNormalizationService /
 * MockFlightSupplierAdapter.buildOffer) — a round trip's outbound and
 * return segments sit in the same array with no marker separating them,
 * and likewise for each leg of a MULTI_CITY search. That is the right
 * shape to persist (a real ticket is one flat sequence of coupons), but
 * it is the wrong shape to *display*: a traveler needs to see "outbound"
 * and "return" (or each multi-city leg) as separate blocks, and a
 * genuine same-leg connection (e.g. a 90-minute layover in DXB) must
 * never be confused with the multi-day gap between an outbound arrival
 * and a return departure on a round trip — the two look identical in a
 * flat list (segment N's destination === segment N+1's origin) but mean
 * completely different things to a traveler.
 *
 * This function reconstructs the searched legs from the flat segment
 * list by walking segments in order and closing a leg the moment its
 * destination matches the *searched* leg's destination — using the
 * origin/destination the traveler actually searched for (FlightSearch's
 * own segments) as the ground truth for where one leg ends and the next
 * begins, rather than guessing from timing gaps.
 */

export interface ItinerarySegmentLike {
  sequence: number;
  origin: string;
  destination: string;
  departureAt: string; // ISO 8601
  arrivalAt: string; // ISO 8601
}

export interface ItineraryLegBoundary {
  origin: string;
  destination: string;
}

export interface ItineraryLayover {
  /** IATA code of the connecting airport. */
  airport: string;
  minutes: number;
}

export interface FlightLeg<TSegment extends ItinerarySegmentLike> {
  origin: string;
  destination: string;
  /** First segment's departure time for this leg. */
  departureAt: string;
  /** Last segment's arrival time for this leg. */
  arrivalAt: string;
  /** This leg's own flight+layover time — never includes ground time between legs. */
  durationMinutes: number;
  /** segments.length - 1 for this leg alone (never the offer-wide total). */
  stops: number;
  segments: TSegment[];
  layovers: ItineraryLayover[];
}

/**
 * Groups a FlightOffer's flat `segments` back into the legs the
 * traveler searched for. `legs` should be the origin/destination pairs
 * from the original search request (FlightSearchRequest.segments /
 * FlightSearch.segments) — one entry per leg, in the same order the
 * search was submitted.
 *
 * Defensive by design: if the segment data doesn't cleanly match the
 * searched legs (a malformed or unexpected supplier response), this
 * returns as many complete legs as it can rather than throwing — a
 * display-layer helper should degrade gracefully, never break the page.
 */
export function groupSegmentsByLeg<TSegment extends ItinerarySegmentLike>(
  legs: ItineraryLegBoundary[],
  segments: TSegment[],
): FlightLeg<TSegment>[] {
  const sorted = [...segments].sort((a, b) => a.sequence - b.sequence);
  const result: FlightLeg<TSegment>[] = [];
  let cursor = 0;

  for (const leg of legs) {
    if (cursor >= sorted.length) break;

    const legSegments: TSegment[] = [];
    while (cursor < sorted.length) {
      const segment = sorted[cursor];
      legSegments.push(segment);
      cursor += 1;
      // Case-insensitive: FlightSearchSegment (the boundary) is
      // normalized to uppercase at persist time, but a FlightOffer's
      // own physical segments preserve whatever case the originating
      // request used — comparing case-insensitively keeps leg
      // boundaries matching correctly regardless of that inconsistency.
      if (segment.destination.toUpperCase() === leg.destination.toUpperCase()) break;
    }
    if (legSegments.length === 0) continue;

    const layovers: ItineraryLayover[] = [];
    for (let i = 0; i < legSegments.length - 1; i++) {
      const minutes = Math.round(
        (new Date(legSegments[i + 1].departureAt).getTime() - new Date(legSegments[i].arrivalAt).getTime()) / 60_000,
      );
      layovers.push({ airport: legSegments[i].destination, minutes });
    }

    const durationMinutes = Math.round(
      (new Date(legSegments[legSegments.length - 1].arrivalAt).getTime() -
        new Date(legSegments[0].departureAt).getTime()) /
        60_000,
    );

    result.push({
      origin: leg.origin,
      destination: leg.destination,
      departureAt: legSegments[0].departureAt,
      arrivalAt: legSegments[legSegments.length - 1].arrivalAt,
      durationMinutes,
      stops: legSegments.length - 1,
      segments: legSegments,
      layovers,
    });
  }

  return result;
}
