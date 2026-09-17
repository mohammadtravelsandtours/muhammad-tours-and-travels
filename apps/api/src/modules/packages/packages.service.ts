import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthenticatedUser } from '@mohammad-travels/types';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreatePackageDto } from './dto/create-package.dto';
import { generateReferenceCode } from '../../common/utils/reference-code.util';

interface PackageActor {
  customerId?: string;
  agentId?: string;
  employeeId?: string;
}

/**
 * The Phase 6 "package builder" MVP — see TravelPackage's schema.prisma
 * doc comment: a thin wrapper that ties one already-CONFIRMED flight
 * Booking to one already-CONFIRMED HotelBooking under a single shared
 * reference and combined total. Each underlying booking has ALREADY gone
 * through its own real adapter/audit/payment path (POST /bookings, POST
 * /hotels/bookings) by the time it reaches here — this deliberately does
 * not orchestrate a third, parallel flight+hotel supplier flow, which
 * would duplicate createBooking/HotelsService.createBooking's mandatory
 * reprice/settlement discipline for no real benefit at this scope.
 */
@Injectable()
export class PackagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(user: AuthenticatedUser, dto: CreatePackageDto) {
    const actor = await this.resolveActor(user);

    const [booking, hotelBooking] = await Promise.all([
      this.prisma.booking.findUnique({ where: { id: dto.bookingId } }),
      this.prisma.hotelBooking.findUnique({ where: { id: dto.hotelBookingId } }),
    ]);
    if (!booking) throw new NotFoundException('Flight booking not found');
    if (!hotelBooking) throw new NotFoundException('Hotel booking not found');

    this.assertOwns(actor, booking);
    this.assertOwns(actor, hotelBooking);

    if (!['CONFIRMED', 'TICKETED'].includes(booking.status)) {
      throw new ConflictException(`Flight booking must be CONFIRMED or TICKETED to be packaged (currently ${booking.status})`);
    }
    if (hotelBooking.status !== 'CONFIRMED') {
      throw new ConflictException(`Hotel booking must be CONFIRMED to be packaged (currently ${hotelBooking.status})`);
    }
    if (booking.packageId) throw new ConflictException('This flight booking is already part of a package');
    if (hotelBooking.packageId) throw new ConflictException('This hotel booking is already part of a package');
    if (booking.currency !== hotelBooking.currency) {
      // Deliberately never converted, even where FxRatesService is
      // configured elsewhere (see TravelPolicyService/AnalyticsService)
      // — a package's totalAmount is a single stored figure a customer
      // is charged and refunded against, not a reporting aggregate, so
      // silently converting one leg into the other's currency here would
      // change what that number means rather than just how it's read.
      throw new BadRequestException(`Cannot package a ${booking.currency} flight booking with a ${hotelBooking.currency} hotel booking — currencies must match`);
    }

    const totalAmount = round2(Number(booking.totalAmount) + Number(hotelBooking.totalAmount));
    const packageReference = await this.generateUniqueReference();

    const created = await this.prisma.$transaction(async (tx) => {
      const pkg = await tx.travelPackage.create({
        data: {
          packageReference,
          customerId: actor.customerId ?? null,
          agentId: actor.agentId ?? null,
          employeeId: actor.employeeId ?? null,
          currency: booking.currency,
          totalAmount,
        },
      });
      await tx.booking.update({ where: { id: booking.id }, data: { packageId: pkg.id } });
      await tx.hotelBooking.update({ where: { id: hotelBooking.id }, data: { packageId: pkg.id } });
      return pkg;
    });

    await this.audit.record({
      userId: user.id,
      action: 'PACKAGE_CREATED',
      resource: 'travel_package',
      resourceId: created.id,
      newValue: { packageReference, bookingId: booking.id, hotelBookingId: hotelBooking.id, totalAmount, currency: booking.currency },
    });

    return this.loadDetail(created.id);
  }

  async listMine(user: AuthenticatedUser) {
    const actor = await this.resolveActor(user).catch(() => null);
    if (!actor) return [];
    const where = actor.customerId ? { customerId: actor.customerId } : actor.agentId ? { agentId: actor.agentId } : { employeeId: actor.employeeId };
    return this.prisma.travelPackage.findMany({ where, orderBy: { createdAt: 'desc' }, include: { flightBooking: true, hotelBooking: true } });
  }

  async getOne(user: AuthenticatedUser, id: string) {
    const pkg = await this.loadDetail(id);
    const actor = await this.resolveActor(user).catch(() => null);
    const ownsIt = !!actor && ((pkg.customerId && actor.customerId === pkg.customerId) || (pkg.agentId && actor.agentId === pkg.agentId) || (pkg.employeeId && actor.employeeId === pkg.employeeId));
    if (!ownsIt) throw new ForbiddenException('You do not have access to this package');
    return pkg;
  }

  private assertOwns(actor: PackageActor, record: { customerId: string | null; agentId: string | null; employeeId: string | null }): void {
    const ownsIt =
      (record.customerId && actor.customerId === record.customerId) ||
      (record.agentId && actor.agentId === record.agentId) ||
      (record.employeeId && actor.employeeId === record.employeeId);
    if (!ownsIt) throw new ForbiddenException('You can only package your own bookings');
  }

  private async resolveActor(user: AuthenticatedUser): Promise<PackageActor> {
    const record = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { customer: { select: { id: true } }, agent: { select: { id: true } }, employee: { select: { id: true } } },
    });
    if (record?.customer) return { customerId: record.customer.id };
    if (record?.agent) return { agentId: record.agent.id };
    if (record?.employee) return { employeeId: record.employee.id };
    throw new ForbiddenException('This account has no customer, agent, or employee profile and cannot build a package');
  }

  private async loadDetail(id: string) {
    return this.prisma.travelPackage.findUniqueOrThrow({ where: { id }, include: { flightBooking: true, hotelBooking: { include: { offer: { include: { property: true } } } } } });
  }

  private async generateUniqueReference(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = generateReferenceCode('MP', 6);
      const clash = await this.prisma.travelPackage.findUnique({ where: { packageReference: candidate } });
      if (!clash) return candidate;
    }
    throw new Error('Could not generate a unique package reference after 5 attempts');
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
