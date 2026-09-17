import { BadRequestException, Body, Controller, Get, Headers, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { AuthenticatedUser, SearchChannel } from '@mohammad-travels/types';
import { SearchHotelsDto } from './dto/search-hotels.dto';
import { CreateHotelBookingDto } from './dto/create-hotel-booking.dto';
import { CancelHotelBookingDto } from './dto/cancel-hotel-booking.dto';
import { HotelsService, HotelPriceChangedError } from './hotels.service';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller('hotels')
export class HotelsController {
  constructor(private readonly hotelsService: HotelsService) {}

  /** Unauthenticated-friendly, same as flights.controller.ts's search — a B2C visitor can browse hotel rates before creating an account. */
  @UseGuards(OptionalJwtAuthGuard)
  @Post('search')
  async search(@Body() dto: SearchHotelsDto, @CurrentUser() user?: AuthenticatedUser) {
    const channel = deriveChannel(user);
    const result = await this.hotelsService.search({
      city: dto.city,
      checkInDate: dto.checkInDate,
      checkOutDate: dto.checkOutDate,
      adults: dto.adults,
      children: dto.children,
      rooms: dto.rooms,
      currency: dto.currency,
      channel,
      requestedByUserId: user?.id,
    });
    return { searchId: result.searchId, offerCount: result.offers.length, offers: result.offers.map((o) => serializeOffer(o)) };
  }

  @Get('search/:searchId')
  async getSearch(@Param('searchId') searchId: string) {
    assertUuid(searchId, 'searchId');
    const search = await this.hotelsService.getSearch(searchId);
    return {
      searchId: search.id,
      city: search.city,
      checkInDate: search.checkInDate,
      checkOutDate: search.checkOutDate,
      supplierRuns: search.supplierRuns.map((r) => ({ supplierCode: r.supplierCode, status: r.status, latencyMs: r.latencyMs, offerCount: r.offerCount, errorMessage: r.errorMessage })),
      offerCount: search.offers.length,
      offers: search.offers.map((o) => serializeOffer(o)),
    };
  }

  @Get('offers/:offerId')
  async getOffer(@Param('offerId') offerId: string) {
    assertUuid(offerId, 'offerId');
    const offer = await this.hotelsService.getOffer(offerId);
    return serializeOffer(offer, true);
  }

  /** UX convenience only, same non-authoritative status as flights.controller.ts's reprice endpoint — POST /hotels/bookings always reprices again itself regardless of what this returned. */
  @Post('offers/:offerId/reprice')
  async reprice(@Param('offerId') offerId: string, @Body() body: { rooms?: number }) {
    assertUuid(offerId, 'offerId');
    return this.hotelsService.repriceOffer(offerId, body?.rooms ?? 1);
  }

  @UseGuards(JwtAuthGuard)
  @Post('bookings')
  async createBooking(@Body() dto: CreateHotelBookingDto, @CurrentUser() user: AuthenticatedUser, @Headers('idempotency-key') idempotencyKey?: string) {
    if (!idempotencyKey || idempotencyKey.trim().length < 8) {
      throw new BadRequestException('An Idempotency-Key header (at least 8 characters) is required to create a hotel booking');
    }
    try {
      const booking = await this.hotelsService.createBooking(user, dto, idempotencyKey);
      return serializeBooking(booking);
    } catch (err) {
      if (err instanceof HotelPriceChangedError) {
        return { requiresPriceConfirmation: true, previousTotal: err.previousTotal, newTotal: err.newTotal, currency: err.currency, message: err.message };
      }
      throw err;
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('bookings')
  async listMine(@CurrentUser() user: AuthenticatedUser) {
    const bookings = await this.hotelsService.listMyBookings(user);
    return { bookings: bookings.map((b) => serializeBookingSummary(b)) };
  }

  @UseGuards(JwtAuthGuard)
  @Get('bookings/:id')
  async getOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    if (!UUID_RE.test(id)) throw new BadRequestException('id is not a valid hotel booking id');
    const booking = await this.hotelsService.getBooking(user, id);
    return serializeBooking(booking);
  }

  @UseGuards(JwtAuthGuard)
  @Post('bookings/:id/cancel')
  async cancel(@Param('id') id: string, @Body() dto: CancelHotelBookingDto, @CurrentUser() user: AuthenticatedUser) {
    if (!UUID_RE.test(id)) throw new BadRequestException('id is not a valid hotel booking id');
    const booking = await this.hotelsService.cancelBooking(user, id, dto.reason);
    return serializeBooking(booking);
  }
}

function deriveChannel(user?: AuthenticatedUser): SearchChannel {
  if (!user) return 'B2C';
  if (user.roles.includes('B2B_AGENCY_ADMIN') || user.roles.includes('B2B_AGENT')) return 'B2B';
  if (user.roles.includes('CORPORATE_EMPLOYEE') || user.roles.includes('CORPORATE_APPROVER')) return 'CORPORATE';
  return 'B2C';
}

function assertUuid(value: string, field: string): void {
  if (!UUID_RE.test(value)) throw new BadRequestException(`${field} is not a valid id`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeOffer(offer: any, includeSearch = false) {
  return {
    id: offer.id,
    supplierCode: offer.supplierCode,
    isMock: offer.isMock,
    property: offer.property && { id: offer.property.id, name: offer.property.name, city: offer.property.city, country: offer.property.country, starRating: offer.property.starRating },
    roomType: offer.roomType,
    board: offer.board,
    refundable: offer.refundable,
    nights: offer.nights,
    baseFare: Number(offer.baseFare),
    taxes: Number(offer.taxes),
    fees: Number(offer.fees),
    totalFare: Number(offer.totalFare),
    currency: offer.currency,
    ...(includeSearch && offer.search ? { checkInDate: offer.search.checkInDate, checkOutDate: offer.search.checkOutDate, adults: offer.search.adults, children: offer.search.children } : {}),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeBooking(booking: any) {
  return {
    id: booking.id,
    bookingReference: booking.bookingReference,
    status: booking.status,
    channel: booking.channel,
    currency: booking.currency,
    totalAmount: Number(booking.totalAmount),
    guestName: booking.guestName,
    contactEmail: booking.contactEmail,
    contactPhone: booking.contactPhone,
    createdAt: booking.createdAt,
    offer: booking.offer && {
      id: booking.offer.id,
      supplierCode: booking.offer.supplierCode,
      roomType: booking.offer.roomType,
      board: booking.offer.board,
      nights: booking.offer.nights,
      property: booking.offer.property && { name: booking.offer.property.name, city: booking.offer.property.city, country: booking.offer.property.country },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    refunds: (booking.refunds ?? []).map((r: any) => ({ amount: Number(r.amount), currency: r.currency, status: r.status, reason: r.reason, createdAt: r.createdAt })),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeBookingSummary(booking: any) {
  return {
    id: booking.id,
    bookingReference: booking.bookingReference,
    status: booking.status,
    currency: booking.currency,
    totalAmount: Number(booking.totalAmount),
    createdAt: booking.createdAt,
    property: booking.offer?.property ? { name: booking.offer.property.name, city: booking.offer.property.city } : undefined,
  };
}
