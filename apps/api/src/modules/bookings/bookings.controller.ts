import { BadRequestException, Body, Controller, Get, Headers, Param, Post, UseGuards } from '@nestjs/common';
import { AuthenticatedUser } from '@mohammad-travels/types';
import { BookingsService, PriceChangedError } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { CancelBookingDto } from './dto/cancel-booking.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Booking creation requires authentication (JwtAuthGuard, not the
 * optional guard flights.controller.ts uses) — every booking needs an
 * owner (customer/agent/employee) to enforce "a customer never sees
 * another customer's booking" against, so guest checkout isn't
 * supported in this pass. That's a deliberate, documented scope
 * decision, not an oversight.
 */
@UseGuards(JwtAuthGuard)
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  async create(
    @Body() dto: CreateBookingDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey || idempotencyKey.trim().length < 8) {
      throw new BadRequestException('An Idempotency-Key header (at least 8 characters) is required to create a booking');
    }

    try {
      const booking = await this.bookingsService.createBooking(user, dto, idempotencyKey);
      return serializeBooking(booking);
    } catch (err) {
      if (err instanceof PriceChangedError) {
        // 200, not an error status — this is an expected, structured
        // outcome the frontend should handle by showing the new price
        // and letting the traveler explicitly re-submit with
        // acceptedTotalFare set, not a failure to surface as a generic error.
        return {
          requiresPriceConfirmation: true,
          previousTotal: err.previousTotal,
          newTotal: err.newTotal,
          currency: err.currency,
          message: err.message,
        };
      }
      throw err;
    }
  }

  @Get()
  async listMine(@CurrentUser() user: AuthenticatedUser) {
    const bookings = await this.bookingsService.listMyBookings(user);
    return { bookings: bookings.map((b) => serializeBookingSummary(b)) };
  }

  @Get(':id')
  async getOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    if (!UUID_RE.test(id)) throw new BadRequestException('id is not a valid booking id');
    const booking = await this.bookingsService.getBooking(user, id);
    return serializeBooking(booking);
  }

  @Post(':id/cancel')
  async cancel(@Param('id') id: string, @Body() dto: CancelBookingDto, @CurrentUser() user: AuthenticatedUser) {
    if (!UUID_RE.test(id)) throw new BadRequestException('id is not a valid booking id');
    const booking = await this.bookingsService.cancelBooking(user, id, dto.reason);
    return serializeBooking(booking);
  }
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
    contactName: booking.contactName,
    contactEmail: booking.contactEmail,
    contactPhone: booking.contactPhone,
    whatsappNumber: booking.whatsappNumber,
    createdAt: booking.createdAt,
    offer: booking.offer && {
      id: booking.offer.id,
      supplierCode: booking.offer.supplier?.code,
      validatingCarrier: booking.offer.validatingCarrier,
      cabin: booking.offer.cabin,
      fareFamily: booking.offer.fareFamily,
      stops: booking.offer.stops,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      segments: (booking.offer.segments ?? []).map((s: any) => ({
        marketingCarrier: s.marketingCarrier,
        flightNumber: s.flightNumber,
        origin: s.origin,
        destination: s.destination,
        departureAt: s.departureAt,
        arrivalAt: s.arrivalAt,
        bookingClass: s.bookingClass,
      })),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    passengers: (booking.passengers ?? []).map((p: any) => ({
      id: p.id,
      type: p.type,
      title: p.title,
      firstName: p.firstName,
      lastName: p.lastName,
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tickets: (booking.tickets ?? []).map((t: any) => ({
      passengerId: t.passengerId,
      ticketNumber: t.ticketNumber,
      status: t.status,
      issuedAt: t.issuedAt,
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    statusHistory: (booking.statusHistory ?? []).map((h: any) => ({
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      reason: h.reason,
      createdAt: h.createdAt,
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    refunds: (booking.refunds ?? []).map((r: any) => ({
      amount: Number(r.amount),
      currency: r.currency,
      status: r.status,
      reason: r.reason,
      createdAt: r.createdAt,
    })),
    // CORPORATE-channel bookings only — which cost center this was
    // charged to (see CreateBookingDto.costCenterId / resolveCostCenter).
    // Always undefined for B2C/B2B bookings, which never set one.
    costCenter: booking.costCenter ? { id: booking.costCenter.id, code: booking.costCenter.code, name: booking.costCenter.name } : undefined,
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
    contactName: booking.contactName,
    contactEmail: booking.contactEmail,
    route:
      booking.offer?.segments?.length > 0
        ? `${booking.offer.segments[0].origin}-${booking.offer.segments[booking.offer.segments.length - 1].destination}`
        : undefined,
    // Only present (and only meaningful) when BookingsService.listMyBookings
    // resolved this as an agency-wide (booking:read:agency) listing — a
    // caller viewing only their own bookings already knows who booked
    // them, so this stays undefined there rather than a redundant
    // "yourself" value.
    bookedBy: booking.agent?.user ? { name: booking.agent.user.fullName, email: booking.agent.user.email } : undefined,
  };
}
