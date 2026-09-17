import { BadRequestException, Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthenticatedUser, Permission } from '@mohammad-travels/types';
import { HajjUmrahService } from './hajj-umrah.service';
import { CreateHajjUmrahBookingDto } from './dto/create-hajj-umrah-booking.dto';
import { AddHajjUmrahPaymentDto } from './dto/add-hajj-umrah-payment.dto';
import { CreateHajjUmrahPackageDto, UpdateHajjUmrahPackageDto } from './dto/create-hajj-umrah-package.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(value: string, what: string): void {
  if (!UUID_RE.test(value)) throw new BadRequestException(`${what} is not a valid id`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializePackage(pkg: any) {
  return {
    id: pkg.id,
    title: pkg.title,
    type: pkg.type,
    description: pkg.description,
    departureDate: pkg.departureDate,
    returnDate: pkg.returnDate,
    durationNights: pkg.durationNights,
    currency: pkg.currency,
    totalAmount: Number(pkg.totalAmount),
    depositType: pkg.depositType,
    depositValue: Number(pkg.depositValue),
    capacity: pkg.capacity,
    seatsBooked: pkg.seatsBooked,
    seatsRemaining: pkg.capacity - pkg.seatsBooked,
    inclusions: pkg.inclusions ?? [],
    makkahHotel: pkg.makkahHotel,
    madinahHotel: pkg.madinahHotel,
    active: pkg.active,
    createdAt: pkg.createdAt,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeBooking(booking: any) {
  return {
    id: booking.id,
    bookingReference: booking.bookingReference,
    status: booking.status,
    pilgrims: booking.pilgrims,
    leadPilgrimName: booking.leadPilgrimName,
    contactPhone: booking.contactPhone,
    contactEmail: booking.contactEmail,
    currency: booking.currency,
    totalAmount: Number(booking.totalAmount),
    minimumDepositAmount: Number(booking.minimumDepositAmount),
    amountPaid: Number(booking.amountPaid),
    balanceRemaining: Number(booking.totalAmount) - Number(booking.amountPaid),
    createdAt: booking.createdAt,
    package: booking.package && serializePackage(booking.package),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payments: (booking.payments ?? []).map((p: any) => ({ id: p.id, amount: Number(p.amount), currency: p.currency, status: p.status, createdAt: p.createdAt })),
  };
}

/** Public browse (no auth — same as GET /flights/search) + authenticated booking/deposit/installment endpoints for the signed-in customer, agent, or corporate employee. */
@Controller('hajj-umrah')
export class HajjUmrahController {
  constructor(private readonly hajjUmrahService: HajjUmrahService) {}

  @Get('packages')
  async listPackages(@Query('type') type?: string) {
    const normalizedType = type === 'HAJJ' || type === 'UMRAH' ? type : undefined;
    const packages = await this.hajjUmrahService.listPackages({ type: normalizedType });
    return { packages: packages.map((p) => serializePackage(p)) };
  }

  @Get('packages/:id')
  async getPackage(@Param('id') id: string) {
    assertUuid(id, 'id');
    return serializePackage(await this.hajjUmrahService.getPackage(id));
  }

  @UseGuards(JwtAuthGuard)
  @Post('bookings')
  async createBooking(@Body() dto: CreateHajjUmrahBookingDto, @CurrentUser() user: AuthenticatedUser, @Headers('idempotency-key') idempotencyKey?: string) {
    if (!idempotencyKey || idempotencyKey.trim().length < 8) {
      throw new BadRequestException('An Idempotency-Key header (at least 8 characters) is required to create a Hajj/Umrah booking');
    }
    const booking = await this.hajjUmrahService.createBooking(user, dto, idempotencyKey);
    return serializeBooking(booking);
  }

  @UseGuards(JwtAuthGuard)
  @Get('bookings')
  async listMine(@CurrentUser() user: AuthenticatedUser) {
    const bookings = await this.hajjUmrahService.listMyBookings(user);
    return { bookings: bookings.map((b) => serializeBooking(b)) };
  }

  @UseGuards(JwtAuthGuard)
  @Get('bookings/:id')
  async getOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    assertUuid(id, 'id');
    return serializeBooking(await this.hajjUmrahService.getBooking(user, id));
  }

  @UseGuards(JwtAuthGuard)
  @Post('bookings/:id/payments')
  async addPayment(@Param('id') id: string, @Body() dto: AddHajjUmrahPaymentDto, @CurrentUser() user: AuthenticatedUser, @Headers('idempotency-key') idempotencyKey?: string) {
    assertUuid(id, 'id');
    if (!idempotencyKey || idempotencyKey.trim().length < 8) {
      throw new BadRequestException('An Idempotency-Key header (at least 8 characters) is required to add a payment');
    }
    const booking = await this.hajjUmrahService.addPayment(user, id, dto, idempotencyKey);
    return serializeBooking(booking);
  }
}

/** Admin package CRUD + bookings view — Permission.HAJJ_UMRAH_MANAGE only (see roles.ts's DEFAULT_ROLE_PERMISSIONS). */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('admin/hajj-umrah')
export class HajjUmrahAdminController {
  constructor(private readonly hajjUmrahService: HajjUmrahService) {}

  @RequirePermissions(Permission.HAJJ_UMRAH_MANAGE)
  @Get('packages')
  async listPackages() {
    const packages = await this.hajjUmrahService.listPackagesAdmin();
    return { packages: packages.map((p) => serializePackage(p)) };
  }

  @RequirePermissions(Permission.HAJJ_UMRAH_MANAGE)
  @Post('packages')
  async createPackage(@Body() dto: CreateHajjUmrahPackageDto, @CurrentUser() user: AuthenticatedUser) {
    return serializePackage(await this.hajjUmrahService.createPackage(dto, user.id));
  }

  @RequirePermissions(Permission.HAJJ_UMRAH_MANAGE)
  @Patch('packages/:id')
  async updatePackage(@Param('id') id: string, @Body() dto: UpdateHajjUmrahPackageDto, @CurrentUser() user: AuthenticatedUser) {
    assertUuid(id, 'id');
    return serializePackage(await this.hajjUmrahService.updatePackage(id, dto, user.id));
  }

  @RequirePermissions(Permission.HAJJ_UMRAH_MANAGE)
  @Get('bookings')
  async listBookings(@Query('packageId') packageId?: string) {
    if (packageId) assertUuid(packageId, 'packageId');
    const bookings = await this.hajjUmrahService.listBookingsAdmin(packageId);
    return { bookings: bookings.map((b) => serializeBooking(b)) };
  }
}
