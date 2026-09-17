import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuthenticatedUser } from '@mohammad-travels/types';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PaymentsService } from '../payments/payments.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateHajjUmrahPackageDto, UpdateHajjUmrahPackageDto } from './dto/create-hajj-umrah-package.dto';
import { CreateHajjUmrahBookingDto } from './dto/create-hajj-umrah-booking.dto';
import { AddHajjUmrahPaymentDto } from './dto/add-hajj-umrah-payment.dto';
import { generateReferenceCode } from '../../common/utils/reference-code.util';

interface HajjUmrahActor {
  customerId?: string;
  agentId?: string;
  employeeId?: string;
}

/**
 * Extends the packages domain (see TravelPackage's doc comment in
 * schema.prisma) with a real browsable, dated, capacity-limited,
 * deposit-priced Hajj/Umrah catalog: public browse endpoints (no auth,
 * same as GET /flights/search) alongside authenticated booking +
 * installment-payment endpoints, and admin CRUD gated by
 * Permission.HAJJ_UMRAH_MANAGE. Follows BookingsService/HotelsService's
 * reserve-then-charge discipline (see createBooking) and
 * WalletService.applyTransaction's concurrency rigor (re-fetch inside
 * one $transaction, no row-level locking — see createBooking's own
 * doc comment on the theoretical race window this accepts, matching
 * the rest of this codebase rather than exceeding it).
 */
@Injectable()
export class HajjUmrahService {
  private readonly logger = new Logger(HajjUmrahService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly payments: PaymentsService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Public browsing (no auth required) ───────────────────────────

  async listPackages(filter: { type?: 'HAJJ' | 'UMRAH' }) {
    return this.prisma.hajjUmrahPackage.findMany({
      where: {
        active: true,
        departureDate: { gte: new Date() },
        ...(filter.type ? { type: filter.type } : {}),
      },
      orderBy: { departureDate: 'asc' },
    });
  }

  async getPackage(id: string) {
    const pkg = await this.prisma.hajjUmrahPackage.findUnique({ where: { id } });
    if (!pkg) throw new NotFoundException('Package not found');
    return pkg;
  }

  // ── Admin package management (Permission.HAJJ_UMRAH_MANAGE) ─────

  async createPackage(dto: CreateHajjUmrahPackageDto, adminUserId: string) {
    const departureDate = new Date(dto.departureDate);
    const returnDate = new Date(dto.returnDate);
    if (returnDate <= departureDate) {
      throw new ConflictException('returnDate must be after departureDate');
    }

    const pkg = await this.prisma.hajjUmrahPackage.create({
      data: {
        title: dto.title,
        type: dto.type,
        description: dto.description ?? null,
        departureDate,
        returnDate,
        durationNights: dto.durationNights,
        currency: dto.currency.toUpperCase(),
        totalAmount: dto.totalAmount,
        depositType: dto.depositType,
        depositValue: dto.depositValue,
        capacity: dto.capacity,
        seatsBooked: 0,
        inclusions: dto.inclusions ?? undefined,
        makkahHotel: dto.makkahHotel ?? null,
        madinahHotel: dto.madinahHotel ?? null,
        active: dto.active ?? true,
      },
    });

    await this.audit.record({
      userId: adminUserId,
      action: 'HAJJ_UMRAH_PACKAGE_CREATED',
      resource: 'hajj_umrah_package',
      resourceId: pkg.id,
      newValue: { title: pkg.title, type: pkg.type, totalAmount: Number(pkg.totalAmount), capacity: pkg.capacity },
    });

    return pkg;
  }

  async updatePackage(id: string, dto: UpdateHajjUmrahPackageDto, adminUserId: string) {
    const existing = await this.getPackage(id);

    const nextDeparture = dto.departureDate !== undefined ? new Date(dto.departureDate) : existing.departureDate;
    const nextReturn = dto.returnDate !== undefined ? new Date(dto.returnDate) : existing.returnDate;
    if (nextReturn <= nextDeparture) {
      throw new ConflictException('returnDate must be after departureDate');
    }
    if (dto.capacity !== undefined && dto.capacity < existing.seatsBooked) {
      throw new ConflictException(`capacity cannot be set below the ${existing.seatsBooked} seat(s) already booked`);
    }

    const updated = await this.prisma.hajjUmrahPackage.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.departureDate !== undefined ? { departureDate: nextDeparture } : {}),
        ...(dto.returnDate !== undefined ? { returnDate: nextReturn } : {}),
        ...(dto.durationNights !== undefined ? { durationNights: dto.durationNights } : {}),
        ...(dto.totalAmount !== undefined ? { totalAmount: dto.totalAmount } : {}),
        ...(dto.depositType !== undefined ? { depositType: dto.depositType } : {}),
        ...(dto.depositValue !== undefined ? { depositValue: dto.depositValue } : {}),
        ...(dto.capacity !== undefined ? { capacity: dto.capacity } : {}),
        ...(dto.inclusions !== undefined ? { inclusions: dto.inclusions } : {}),
        ...(dto.makkahHotel !== undefined ? { makkahHotel: dto.makkahHotel } : {}),
        ...(dto.madinahHotel !== undefined ? { madinahHotel: dto.madinahHotel } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });

    await this.audit.record({
      userId: adminUserId,
      action: 'HAJJ_UMRAH_PACKAGE_UPDATED',
      resource: 'hajj_umrah_package',
      resourceId: id,
      oldValue: { totalAmount: Number(existing.totalAmount), active: existing.active, capacity: existing.capacity },
      newValue: { totalAmount: Number(updated.totalAmount), active: updated.active, capacity: updated.capacity },
    });

    return updated;
  }

  async listPackagesAdmin() {
    return this.prisma.hajjUmrahPackage.findMany({ orderBy: { departureDate: 'asc' } });
  }

  // ── Booking + deposit (authenticated, customer-facing) ───────────

  /**
   * Reserves seats and creates the booking row inside one $transaction,
   * then charges the initial deposit OUTSIDE it — mirroring
   * BookingsService/HotelsService (see PaymentsService's doc comments).
   * A provider failure therefore never rolls back the seat reservation:
   * the booking stays PENDING_DEPOSIT with amountPaid 0, the seat stays
   * held, and the customer retries via addPayment. There is no
   * hold-expiry/auto-release mechanism — an abandoned PENDING_DEPOSIT
   * booking occupies a seat indefinitely today (see docs/ROADMAP.md).
   *
   * Concurrency: seatsBooked is re-read and incremented inside the
   * $transaction with no row-level lock (SELECT ... FOR UPDATE) — the
   * same rigor WalletService.applyTransaction uses for wallet balances
   * elsewhere in this codebase, not a stronger guarantee. Two concurrent
   * bookings against the last seat(s) of a near-full package can both
   * pass the capacity check before either commits, in principle
   * slightly overbooking a package; this is the same accepted tradeoff
   * as the rest of this codebase, not something new introduced here.
   */
  async createBooking(user: AuthenticatedUser, dto: CreateHajjUmrahBookingDto, idempotencyKey: string) {
    const existingByKey = await this.prisma.hajjUmrahBooking.findUnique({ where: { idempotencyKey } });
    if (existingByKey) return this.loadBookingDetail(existingByKey.id);

    const actor = await this.resolveActor(user);
    const bookingReference = await this.generateUniqueBookingReference();

    const booking = await this.prisma.$transaction(async (tx) => {
      const pkg = await tx.hajjUmrahPackage.findUnique({ where: { id: dto.packageId } });
      if (!pkg) throw new NotFoundException('Package not found');
      if (!pkg.active) throw new ConflictException('This package is no longer available for booking');
      if (pkg.departureDate < new Date()) throw new ConflictException('This package has already departed');
      if (pkg.seatsBooked + dto.pilgrims > pkg.capacity) {
        throw new ConflictException(`Only ${pkg.capacity - pkg.seatsBooked} seat(s) remaining on this package`);
      }

      const bookingTotal = round2(Number(pkg.totalAmount) * dto.pilgrims);
      const minimumDeposit = this.calculateMinimumDeposit(pkg, bookingTotal, dto.pilgrims);
      if (dto.paymentAmount !== undefined && round2(dto.paymentAmount) < minimumDeposit) {
        throw new ConflictException(`paymentAmount must be at least the minimum deposit of ${minimumDeposit} ${pkg.currency}`);
      }

      await tx.hajjUmrahPackage.update({ where: { id: pkg.id }, data: { seatsBooked: { increment: dto.pilgrims } } });

      return tx.hajjUmrahBooking.create({
        data: {
          bookingReference,
          packageId: pkg.id,
          customerId: actor.customerId ?? null,
          agentId: actor.agentId ?? null,
          employeeId: actor.employeeId ?? null,
          pilgrims: dto.pilgrims,
          leadPilgrimName: dto.leadPilgrimName,
          contactPhone: dto.contactPhone,
          contactEmail: dto.contactEmail,
          currency: pkg.currency,
          totalAmount: bookingTotal,
          minimumDepositAmount: minimumDeposit,
          amountPaid: 0,
          status: 'PENDING_DEPOSIT',
          idempotencyKey,
        },
      });
    });

    await this.audit.record({
      userId: user.id,
      action: 'HAJJ_UMRAH_BOOKING_CREATED',
      resource: 'hajj_umrah_booking',
      resourceId: booking.id,
      newValue: { bookingReference: booking.bookingReference, packageId: dto.packageId, pilgrims: booking.pilgrims, totalAmount: Number(booking.totalAmount) },
    });

    const chargeAmount = dto.paymentAmount !== undefined ? round2(dto.paymentAmount) : Number(booking.minimumDepositAmount);
    const payment = await this.payments.chargeForHajjUmrahBooking(booking.id, booking.bookingReference, chargeAmount, booking.currency, `${idempotencyKey}:deposit`, dto.paymentMethodToken);
    const updated = await this.applyPaymentResult(booking.id, payment);

    if (updated.status !== 'PENDING_DEPOSIT') {
      await this.notifications.sendHajjUmrahBookingConfirmed({
        toEmail: updated.contactEmail,
        toName: updated.leadPilgrimName,
        toPhone: updated.contactPhone,
        bookingReference: updated.bookingReference,
        amountPaid: Number(updated.amountPaid),
        totalAmount: Number(updated.totalAmount),
        currency: updated.currency,
      });
    } else {
      this.logger.warn(`Hajj/Umrah booking ${updated.bookingReference} created but the initial deposit charge did not succeed (payment status: ${payment.status}) — seat remains reserved; customer can retry via addPayment.`);
    }

    return this.loadBookingDetail(updated.id);
  }

  /** A later installment against an already-created booking (deposit-then-installments — see HajjUmrahBooking's doc comment in schema.prisma). */
  async addPayment(user: AuthenticatedUser, bookingId: string, dto: AddHajjUmrahPaymentDto, idempotencyKey: string) {
    const booking = await this.loadBookingDetail(bookingId);
    const actor = await this.resolveActor(user).catch(() => null);
    this.assertOwnsOrCan(user, actor, booking);

    if (booking.status === 'FULLY_PAID') throw new ConflictException('This booking is already fully paid');
    if (booking.status === 'CANCELLED') throw new ConflictException('This booking has been cancelled');

    const remaining = round2(Number(booking.totalAmount) - Number(booking.amountPaid));
    if (round2(dto.amount) > remaining) {
      throw new ConflictException(`amount exceeds the remaining balance of ${remaining} ${booking.currency}`);
    }

    const payment = await this.payments.chargeForHajjUmrahBooking(booking.id, booking.bookingReference, round2(dto.amount), booking.currency, idempotencyKey, dto.paymentMethodToken);
    const updated = await this.applyPaymentResult(booking.id, payment);

    await this.audit.record({
      userId: user.id,
      action: 'HAJJ_UMRAH_PAYMENT_ADDED',
      resource: 'hajj_umrah_booking',
      resourceId: booking.id,
      newValue: { amount: dto.amount, paymentStatus: payment.status, resultingBookingStatus: updated.status },
    });

    return this.loadBookingDetail(updated.id);
  }

  async getBooking(user: AuthenticatedUser, bookingId: string) {
    const booking = await this.loadBookingDetail(bookingId);
    const actor = await this.resolveActor(user).catch(() => null);
    this.assertOwnsOrCan(user, actor, booking);
    return booking;
  }

  async listMyBookings(user: AuthenticatedUser) {
    const actor = await this.resolveActor(user).catch(() => null);
    if (!actor) return [];
    const where = actor.customerId ? { customerId: actor.customerId } : actor.agentId ? { agentId: actor.agentId } : { employeeId: actor.employeeId };
    return this.prisma.hajjUmrahBooking.findMany({ where, orderBy: { createdAt: 'desc' }, include: { package: true } });
  }

  /** Admin view — every booking against a package, with contact info, for the admin bookings/payments screen (see docs/ROADMAP.md task for apps/admin). */
  async listBookingsAdmin(packageId?: string) {
    return this.prisma.hajjUmrahBooking.findMany({
      where: packageId ? { packageId } : undefined,
      orderBy: { createdAt: 'desc' },
      include: { package: true, payments: { orderBy: { createdAt: 'desc' } } },
    });
  }

  // ── Internals ─────────────────────────────────────────────────

  /**
   * PERCENTAGE: depositValue% of this booking's total (pricePerPilgrim ×
   * pilgrims). FIXED: depositValue PER PILGRIM, not a flat amount
   * regardless of group size — a deliberate interpretation so a FIXED
   * deposit scales with group size the same natural way a PERCENTAGE
   * one already does. This is not separately configurable today.
   */
  private calculateMinimumDeposit(pkg: { depositType: string; depositValue: unknown }, bookingTotal: number, pilgrims: number): number {
    const depositValue = Number(pkg.depositValue);
    if (pkg.depositType === 'PERCENTAGE') {
      return round2((bookingTotal * depositValue) / 100);
    }
    return round2(depositValue * pilgrims);
  }

  private async applyPaymentResult(bookingId: string, payment: { status: string; amount: unknown }) {
    const booking = await this.prisma.hajjUmrahBooking.findUniqueOrThrow({ where: { id: bookingId } });
    if (payment.status !== 'PAID') {
      // Failed/pending charge — amountPaid/status stay as they were;
      // see createBooking's doc comment on the seat-stays-reserved
      // tradeoff and addPayment as the retry path.
      return booking;
    }
    const amountPaid = round2(Number(booking.amountPaid) + Number(payment.amount));
    const status = this.computeStatus(amountPaid, Number(booking.minimumDepositAmount), Number(booking.totalAmount));
    return this.prisma.hajjUmrahBooking.update({ where: { id: bookingId }, data: { amountPaid, status } });
  }

  private computeStatus(amountPaid: number, minimumDepositAmount: number, totalAmount: number): 'PENDING_DEPOSIT' | 'DEPOSIT_PAID' | 'PARTIALLY_PAID' | 'FULLY_PAID' {
    if (amountPaid <= 0) return 'PENDING_DEPOSIT';
    if (amountPaid >= totalAmount) return 'FULLY_PAID';
    if (amountPaid === minimumDepositAmount) return 'DEPOSIT_PAID';
    return 'PARTIALLY_PAID';
  }

  private assertOwnsOrCan(user: AuthenticatedUser, actor: HajjUmrahActor | null, booking: { customerId: string | null; agentId: string | null; employeeId: string | null }): void {
    // String literal, not the Permission enum — same "services take
    // plain permission strings, only controllers/DTOs import the enum"
    // discipline as HotelsService.assertOwnsOrCan ('booking:read:any',
    // etc.). Must match Permission.HAJJ_UMRAH_MANAGE in
    // packages/types/src/roles.ts.
    if (user.permissions.includes('hajj-umrah:manage')) return;
    const ownsIt =
      !!actor &&
      ((booking.customerId && actor.customerId === booking.customerId) ||
        (booking.agentId && actor.agentId === booking.agentId) ||
        (booking.employeeId && actor.employeeId === booking.employeeId));
    if (!ownsIt) {
      throw new ForbiddenException('You do not have access to this Hajj/Umrah booking');
    }
  }

  private async resolveActor(user: AuthenticatedUser): Promise<HajjUmrahActor> {
    const record = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: {
        customer: { select: { id: true } },
        agent: { select: { id: true } },
        employee: { select: { id: true } },
      },
    });
    if (record?.customer) return { customerId: record.customer.id };
    if (record?.agent) return { agentId: record.agent.id };
    if (record?.employee) return { employeeId: record.employee.id };
    throw new ForbiddenException('This account has no customer, agent, or employee profile and cannot create or view Hajj/Umrah bookings');
  }

  private async loadBookingDetail(bookingId: string) {
    return this.prisma.hajjUmrahBooking.findUniqueOrThrow({
      where: { id: bookingId },
      include: { package: true, payments: { orderBy: { createdAt: 'desc' } } },
    });
  }

  private async generateUniqueBookingReference(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = generateReferenceCode('HU', 6);
      const clash = await this.prisma.hajjUmrahBooking.findUnique({ where: { bookingReference: candidate } });
      if (!clash) return candidate;
    }
    throw new Error('Could not generate a unique Hajj/Umrah booking reference after 5 attempts');
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
