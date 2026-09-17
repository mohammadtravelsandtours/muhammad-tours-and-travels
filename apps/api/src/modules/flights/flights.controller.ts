import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { AuthenticatedUser, ItineraryLegBoundary, SearchChannel, groupSegmentsByLeg } from '@mohammad-travels/types';
import { SearchFlightsDto } from './dto/search-flights.dto';
import { FlightSearchOrchestratorService } from './flight-search-orchestrator.service';
import { PrismaService } from '../../prisma/prisma.service';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SupplierRegistry } from '../suppliers/supplier-registry.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller('flights')
export class FlightsController {
  constructor(
    private readonly orchestrator: FlightSearchOrchestratorService,
    private readonly prisma: PrismaService,
    private readonly supplierRegistry: SupplierRegistry,
  ) {}

  /**
   * Unauthenticated-friendly by design (OptionalJwtAuthGuard) — a B2C
   * visitor can search before creating an account. A recognized B2B or
   * Corporate user gets their channel-appropriate markup context; agency
   * resolution for B2B markup is deferred to the booking flow (Step 10+)
   * where the acting agent's membership is actually needed — search
   * itself works the same either way.
   */
  @UseGuards(OptionalJwtAuthGuard)
  @Post('search')
  async search(@Body() dto: SearchFlightsDto, @CurrentUser() user?: AuthenticatedUser) {
    const channel = deriveChannel(user);

    const result = await this.orchestrator.search({
      request: {
        tripType: dto.tripType,
        cabin: dto.cabin,
        segments: dto.segments,
        adults: dto.adults,
        children: dto.children,
        infants: dto.infants,
        currency: dto.currency,
        nationality: dto.nationality,
      },
      channel,
      requestedByUserId: user?.id,
    });

    // Not uppercased here: this must match whatever case the adapters
    // actually built the offers' physical segments in, which is
    // whatever case `dto.segments` itself was in (see
    // groupSegmentsByLeg's case-insensitive match — this stays as
    // close to that source of truth as possible regardless).
    const legBoundaries: ItineraryLegBoundary[] = dto.segments.map((s) => ({
      origin: s.origin,
      destination: s.destination,
    }));

    return {
      searchId: result.searchId,
      segments: dto.segments,
      offerCount: result.offers.length,
      offers: result.offers.map((o) => serializeOffer(o, legBoundaries)),
    };
  }

  @Get('search/:searchId')
  async getSearch(@Param('searchId') searchId: string) {
    assertUuid(searchId, 'searchId');

    const search = await this.prisma.flightSearch.findUnique({
      where: { id: searchId },
      include: {
        segments: { orderBy: { sequence: 'asc' } },
        supplierRuns: { include: { supplier: { select: { code: true, name: true } } } },
        offers: { include: { segments: { orderBy: { sequence: 'asc' } } }, orderBy: { totalFare: 'asc' } },
      },
    });
    if (!search) throw new NotFoundException('Search not found or has expired');

    const legBoundaries: ItineraryLegBoundary[] = search.segments.map((s) => ({
      origin: s.origin,
      destination: s.destination,
    }));

    return {
      searchId: search.id,
      status: search.status,
      expiresAt: search.expiresAt,
      segments: search.segments.map((s) => ({ origin: s.origin, destination: s.destination, departureDate: s.departureDate })),
      supplierRuns: search.supplierRuns.map((r) => ({
        supplierCode: r.supplier.code,
        supplierName: r.supplier.name,
        status: r.status,
        latencyMs: r.latencyMs,
        offerCount: r.offerCount,
        errorMessage: r.errorMessage,
      })),
      offerCount: search.offers.length,
      offers: search.offers.map((o) => serializeOffer(o, legBoundaries)),
    };
  }

  @Get('offers/:offerId')
  async getOffer(@Param('offerId') offerId: string) {
    assertUuid(offerId, 'offerId');

    const offer = await this.prisma.flightOffer.findUnique({
      where: { id: offerId },
      include: {
        segments: { orderBy: { sequence: 'asc' } },
        supplier: { select: { code: true, name: true } },
        // Pax counts live on the search, not the offer — the booking
        // form needs them to know how many passenger records to collect,
        // so they're surfaced here (offer-detail view only, not the
        // results list, to keep that response lean). The search's own
        // segments (leg origin/destination, NOT the offer's flat
        // physical segments) are pulled in too, purely so this endpoint
        // can tell the outbound leg from the return leg — see
        // groupSegmentsByLeg's doc comment for why that distinction
        // can't be recovered from the offer's segments alone.
        search: {
          select: {
            adults: true,
            children: true,
            infants: true,
            segments: { select: { origin: true, destination: true }, orderBy: { sequence: 'asc' } },
          },
        },
      },
    });
    if (!offer) throw new NotFoundException('Offer not found or has expired');

    const legBoundaries: ItineraryLegBoundary[] = (offer.search?.segments ?? []).map((s) => ({
      origin: s.origin,
      destination: s.destination,
    }));

    return serializeOffer(offer, legBoundaries, true);
  }

  /**
   * UX convenience only — lets the review screen show an updated price
   * before the traveler commits. This is NOT the authoritative check:
   * POST /bookings always reprices again itself regardless of what this
   * endpoint returned, since a client-side reprice a few seconds old is
   * not something a booking should ever be trusted to skip re-verifying.
   */
  @Post('offers/:offerId/reprice')
  async reprice(@Param('offerId') offerId: string) {
    assertUuid(offerId, 'offerId');

    const offer = await this.prisma.flightOffer.findUnique({
      where: { id: offerId },
      include: { supplier: { select: { code: true } } },
    });
    if (!offer) throw new NotFoundException('Offer not found or has expired');

    const adapter = this.supplierRegistry.get(offer.supplier.code);
    if (!adapter) throw new NotFoundException(`Supplier ${offer.supplier.code} is no longer available`);

    const result = await adapter.repriceFlight({
      supplierOfferId: offer.supplierOfferId,
      passengerCounts: { adults: 1 }, // exact pax counts are re-derived from the real passenger list at booking time; this endpoint only previews availability/price direction
    });

    const previousTotal = Number(offer.baseFare) + Number(offer.taxes) + Number(offer.fees) + Number(offer.markupAmount);
    const newTotal = result.stillAvailable ? (result.newTotal ?? previousTotal) + Number(offer.markupAmount) : null;

    return {
      offerId,
      stillAvailable: result.stillAvailable,
      priceChanged: result.priceChanged,
      previousTotal: Math.round(previousTotal * 100) / 100,
      newTotal: newTotal !== null ? Math.round(newTotal * 100) / 100 : null,
      currency: offer.currency,
    };
  }
}

function deriveChannel(user?: AuthenticatedUser): SearchChannel {
  if (!user) return 'B2C';
  if (user.roles.includes('B2B_AGENCY_ADMIN') || user.roles.includes('B2B_AGENT')) return 'B2B';
  if (user.roles.includes('CORPORATE_EMPLOYEE') || user.roles.includes('CORPORATE_APPROVER')) return 'CORPORATE';
  return 'B2C';
}

function assertUuid(value: string, field: string): void {
  if (!UUID_RE.test(value)) {
    throw new BadRequestException(`${field} is not a valid id`);
  }
}

/**
 * `legBoundaries` — the searched leg origin/destinations, in order — is
 * what lets this reconstruct outbound/return/multi-city legs from the
 * offer's flat segment list (see groupSegmentsByLeg's doc comment).
 * Every call site above supplies it from data it already has on hand
 * (the request DTO, or the search's own persisted segments), so this
 * never needs an extra query of its own. Passing `[]` (only possible if
 * a future call site forgets to supply it) degrades to an empty `legs`
 * array rather than throwing — the flat `segments` list, unaffected
 * either way, remains a correct fallback for any caller not yet updated
 * to read `legs`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeOffer(offer: any, legBoundaries: ItineraryLegBoundary[] = [], includeSupplier = false) {
  const segments = (offer.segments ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .slice()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .sort((a: any, b: any) => a.sequence - b.sequence)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((s: any) => ({
      sequence: s.sequence,
      marketingCarrier: s.marketingCarrier,
      operatingCarrier: s.operatingCarrier,
      flightNumber: s.flightNumber,
      origin: s.origin,
      destination: s.destination,
      departureAt: new Date(s.departureAt).toISOString(),
      arrivalAt: new Date(s.arrivalAt).toISOString(),
      durationMinutes: s.durationMinutes,
      aircraft: s.aircraft,
      bookingClass: s.bookingClass,
    }));

  const legs = legBoundaries.length > 0 ? groupSegmentsByLeg(legBoundaries, segments) : [];

  return {
    id: offer.id,
    ...(includeSupplier ? { supplierCode: offer.supplier?.code } : {}),
    ...(offer.search
      ? { passengerCounts: { adults: offer.search.adults, children: offer.search.children, infants: offer.search.infants } }
      : {}),
    isMock: offer.isMock,
    validatingCarrier: offer.validatingCarrier,
    cabin: offer.cabin,
    fareFamily: offer.fareFamily,
    stops: offer.stops,
    totalDurationMinutes: offer.totalDurationMinutes,
    baseFare: Number(offer.baseFare),
    taxes: Number(offer.taxes),
    fees: Number(offer.fees),
    markupAmount: Number(offer.markupAmount),
    totalFare: Number(offer.totalFare),
    currency: offer.currency,
    refundable: offer.refundable,
    changeable: offer.changeable,
    baggage: {
      checkedKg: offer.baggageCheckedKg ?? undefined,
      carryOnKg: offer.baggageCarryOnKg ?? undefined,
      note: offer.baggageNote ?? undefined,
    },
    seatsAvailable: offer.seatsAvailable,
    ticketingDeadline: offer.ticketingDeadline,
    fareRules: offer.fareRules,
    transitVisaWarning: offer.transitVisaWarning,
    // Flat, offer-wide physical segment list — kept for any caller that
    // hasn't moved to `legs` yet (e.g. a direct API consumer outside
    // this monorepo). Every in-repo frontend should prefer `legs`: this
    // array alone cannot tell a same-leg connection from the gap
    // between a round trip's outbound and return.
    segments,
    // Segments grouped back into the legs actually searched for —
    // outbound/return for ROUND_TRIP, one entry per leg for
    // MULTI_CITY, a single entry for ONE_WAY. Each leg carries its OWN
    // stops/duration/layovers — never the offer-wide aggregate above,
    // which sums across every leg and so cannot be filtered or
    // displayed "per direction".
    legs,
  };
}
