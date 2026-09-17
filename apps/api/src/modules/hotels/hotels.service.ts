import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuthenticatedUser } from '@mohammad-travels/types';
import { PrismaService } from '../../prisma/prisma.service';
import { HotelSupplierRegistry } from './hotel-supplier-registry.service';
import { HotelSearchOrchestratorService, RunHotelSearchInput } from './hotel-search-orchestrator.service';
import { AuditService } from '../audit/audit.service';
import { WalletService, InsufficientFundsError } from '../wallet/wallet.service';
import { PaymentsService } from '../payments/payments.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateHotelBookingDto } from './dto/create-hotel-booking.dto';
import { generateReferenceCode } from '../../common/utils/reference-code.util';

interface HotelActor {
  customerId?: string;
  agentId?: string;
  employeeId?: string;
  agencyId?: string;
}

/** Mirrors BookingsService's PriceChangedError for the same reason — a structured 409 the frontend can read previousTotal/newTotal/currency from, not a generic error string. */
export class HotelPriceChangedError extends Error {
  constructor(
    public readonly previousTotal: number,
    public readonly newTotal: number,
    public readonly currency: string,
  ) {
    super('The price for this hotel offer has changed. Confirm the new total to proceed.');
  }
}

/**
 * Follows BookingsService's exact discipline (mandatory reprice before
 * booking, adapter called before any state changes, settle-after-confirm,
 * ownership enforced against the resolved actor's OWN id) — see
 * docs/ROADMAP.md Phase 6: "each product follows the same adapter/audit
 * pattern as flights". Deliberately does not reuse a shared
 * BookingStateMachineService: HotelBookingStatus is a small, linear enum
 * (PENDING → CONFIRMED/FAILED → CANCELLED/REFUND_PENDING → REFUNDED) with
 * no branching corporate-approval workflow, so a full state machine would
 * add ceremony without adding safety here.
 */
@Injectable()
export class HotelsService {
  private readonly logger = new Logger(HotelsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: HotelSupplierRegistry,
    private readonly orchestrator: HotelSearchOrchestratorService,
    private readonly audit: AuditService,
    private readonly wallet: WalletService,
    private readonly payments: PaymentsService,
    private readonly notifications: NotificationsService,
  ) {}

  async search(input: RunHotelSearchInput) {
    return this.orchestrator.search(input);
  }

  async getSearch(searchId: string) {
    const search = await this.prisma.hotelSearch.findUnique({
      where: { id: searchId },
      include: {
        offers: { include: { property: true }, orderBy: { totalFare: 'asc' } },
        supplierRuns: true,
      },
    });
    if (!search) throw new NotFoundException('Search not found or has expired');
    return search;
  }

  async getOffer(offerId: string) {
    const offer = await this.prisma.hotelOffer.findUnique({ where: { id: offerId }, include: { property: true, search: true } });
    if (!offer) throw new NotFoundException('Offer not found or has expired');
    return offer;
  }

  async repriceOffer(offerId: string, rooms: number) {
    const offer = await this.getOffer(offerId);
    const adapter = this.registry.get(offer.supplierCode);
    if (!adapter) throw new ConflictException(`Hotel supplier ${offer.supplierCode} is no longer available`);

    const result = await adapter.repriceHotel({ supplierOfferId: offer.supplierOfferId, rooms });
    const previousTotal = round2(Number(offer.totalFare) * rooms);
    return {
      offerId,
      stillAvailable: result.stillAvailable,
      priceChanged: result.priceChanged,
      previousTotal,
      newTotal: result.stillAvailable ? (result.newTotal ?? previousTotal) : null,
      currency: offer.currency,
    };
  }

  async createBooking(user: AuthenticatedUser, dto: CreateHotelBookingDto, idempotencyKey: string) {
    const existing = await this.prisma.hotelBooking.findUnique({ where: { idempotencyKey } });
    if (existing) return this.loadBookingDetail(existing.id);

    const offer = await this.prisma.hotelOffer.findUnique({ where: { id: dto.offerId }, include: { search: true, property: true } });
    if (!offer) throw new NotFoundException('Offer not found or has expired');
    if (offer.search.expiresAt < new Date()) {
      throw new ConflictException('This search has expired — please search again for current rates');
    }

    const actor = await this.resolveActor(user);
    const adapter = this.registry.get(offer.supplierCode);
    if (!adapter) throw new ConflictException(`Hotel supplier ${offer.supplierCode} is no longer available`);

    // Mandatory reprice — same non-negotiable discipline as
    // BookingsService.createBooking: never book against a price that
    // wasn't just re-verified with the supplier.
    const reprice = await adapter.repriceHotel({ supplierOfferId: offer.supplierOfferId, rooms: dto.rooms });
    if (!reprice.stillAvailable) {
      throw new ConflictException('This rate is no longer available — please search again');
    }

    const previousTotal = round2(Number(offer.totalFare) * dto.rooms);
    const finalTotal = reprice.priceChanged ? (reprice.newTotal ?? previousTotal) : previousTotal;
    if (reprice.priceChanged && dto.acceptedTotalAmount !== finalTotal) {
      throw new HotelPriceChangedError(previousTotal, finalTotal, offer.currency);
    }

    if (actor.agencyId) {
      const wallet = await this.wallet.getOrCreateWallet(actor.agencyId);
      const agency = await this.prisma.b2BAgency.findUniqueOrThrow({ where: { id: actor.agencyId } });
      if (agency.status !== 'ACTIVE') {
        throw new ForbiddenException(
          agency.status === 'PENDING_APPROVAL'
            ? 'This agency is awaiting approval and cannot book yet — contact support once your account has been reviewed.'
            : 'This agency has been suspended and cannot book — contact support.',
        );
      }
      const available = Number(wallet.balance) + (agency.creditEnabled ? Number(agency.creditLimit) : 0);
      if (finalTotal > available) {
        throw new ConflictException(`This agency's wallet cannot cover ${finalTotal} ${offer.currency} (${available} ${wallet.currency} available). Top up the wallet before booking.`);
      }
    }

    const booking = await this.prisma.hotelBooking.create({
      data: {
        bookingReference: await this.generateUniqueBookingReference(),
        offerId: offer.id,
        channel: offer.search.channel,
        customerId: actor.customerId ?? null,
        agentId: actor.agentId ?? null,
        employeeId: actor.employeeId ?? null,
        guestName: dto.guestName,
        contactEmail: dto.contactEmail,
        contactPhone: dto.contactPhone,
        status: 'PENDING',
        currency: offer.currency,
        totalAmount: finalTotal,
        idempotencyKey,
      },
    });

    await this.audit.record({
      userId: user.id,
      action: 'HOTEL_BOOKING_CREATED',
      resource: 'hotel_booking',
      resourceId: booking.id,
      newValue: { bookingReference: booking.bookingReference, offerId: offer.id, totalAmount: finalTotal },
    });

    let supplierResult;
    try {
      supplierResult = await adapter.createBooking({
        supplierOfferId: offer.supplierOfferId,
        guestName: dto.guestName,
        contactEmail: dto.contactEmail,
        contactPhone: dto.contactPhone,
        rooms: dto.rooms,
      });
    } catch (err) {
      this.logger.error(`Hotel supplier ${offer.supplierCode} createBooking failed for booking ${booking.id}: ${(err as Error).message}`);
      await this.prisma.hotelBooking.update({ where: { id: booking.id }, data: { status: 'FAILED' } });
      return this.loadBookingDetail(booking.id);
    }

    if (supplierResult.status !== 'CONFIRMED') {
      await this.prisma.hotelBooking.update({ where: { id: booking.id }, data: { status: 'FAILED' } });
      return this.loadBookingDetail(booking.id);
    }

    await this.prisma.hotelBooking.update({
      where: { id: booking.id },
      data: { status: 'CONFIRMED', supplierBookingReference: supplierResult.supplierBookingReference },
    });
    await this.audit.record({ userId: user.id, action: 'HOTEL_BOOKING_CONFIRMED', resource: 'hotel_booking', resourceId: booking.id });

    if (actor.agencyId) {
      try {
        await this.wallet.debitForHotelBooking(actor.agencyId, finalTotal, booking.id, booking.bookingReference, idempotencyKey);
      } catch (err) {
        if (err instanceof InsufficientFundsError) {
          this.logger.error(`Hotel booking ${booking.bookingReference} confirmed with supplier but the agency wallet could not be debited (${err.message}) — needs manual reconciliation.`);
          await this.audit.record({
            userId: user.id,
            action: 'HOTEL_BOOKING_WALLET_DEBIT_FAILED',
            resource: 'hotel_booking',
            resourceId: booking.id,
            newValue: { agencyId: actor.agencyId, amount: finalTotal, error: err.message },
          });
        } else {
          throw err;
        }
      }
    } else {
      await this.payments.chargeForHotelBooking(booking.id, booking.bookingReference, finalTotal, offer.currency, idempotencyKey, dto.paymentMethodToken);
    }

    await this.notifications.sendBookingConfirmed({
      toEmail: dto.contactEmail,
      toName: dto.guestName,
      bookingReference: booking.bookingReference,
      totalAmount: finalTotal,
      currency: offer.currency,
    });

    return this.loadBookingDetail(booking.id);
  }

  async getBooking(user: AuthenticatedUser, bookingId: string) {
    const booking = await this.loadBookingDetail(bookingId);
    const actor = await this.resolveActor(user).catch(() => null);
    this.assertOwnsOrCan(user, actor, booking, 'booking:read:any', 'booking:read:own');
    return booking;
  }

  async listMyBookings(user: AuthenticatedUser) {
    const actor = await this.resolveActor(user).catch(() => null);
    if (!actor) return [];

    const where = actor.customerId ? { customerId: actor.customerId } : actor.agentId ? { agentId: actor.agentId } : { employeeId: actor.employeeId };
    return this.prisma.hotelBooking.findMany({ where, orderBy: { createdAt: 'desc' }, include: { offer: { include: { property: true } } } });
  }

  async cancelBooking(user: AuthenticatedUser, bookingId: string, reason?: string) {
    const booking = await this.loadBookingDetail(bookingId);
    const actor = await this.resolveActor(user).catch(() => null);
    this.assertOwnsOrCan(user, actor, booking, 'booking:cancel:any', 'booking:cancel:own');

    if (booking.status !== 'CONFIRMED') {
      throw new ConflictException(`A ${booking.status.toLowerCase()} hotel booking cannot be cancelled`);
    }

    const adapter = this.registry.get(booking.offer.supplierCode);
    if (booking.supplierBookingReference && adapter?.cancelBooking) {
      const result = await adapter.cancelBooking({ supplierBookingReference: booking.supplierBookingReference, reason });
      if (result.status === 'FAILED') throw new ConflictException('The supplier declined to cancel this hotel booking');
    }

    await this.prisma.hotelBooking.update({ where: { id: booking.id }, data: { status: 'REFUND_PENDING' } });

    const refundAmount = Number(booking.totalAmount);
    const refund = await this.prisma.refund.create({
      data: { hotelBookingId: booking.id, amount: refundAmount, currency: booking.currency, status: 'PROCESSING', reason: reason ?? null },
    });

    const bookingAgent = booking.agentId ? await this.prisma.agent.findUnique({ where: { id: booking.agentId }, select: { agencyId: true } }) : null;

    try {
      if (bookingAgent?.agencyId) {
        await this.wallet.creditForHotelBooking(bookingAgent.agencyId, refundAmount, booking.id, booking.bookingReference, `refund:hotel:${booking.id}`, 'REFUND_CREDIT');
      } else {
        await this.payments.refundHotelPayment(booking.id, refundAmount, booking.currency);
      }
      await this.prisma.refund.update({ where: { id: refund.id }, data: { status: 'COMPLETED' } });
    } catch (err) {
      this.logger.error(`Refund settlement failed for hotel booking ${booking.bookingReference}: ${(err as Error).message}`);
      await this.prisma.refund.update({ where: { id: refund.id }, data: { status: 'REJECTED' } });
      await this.audit.record({
        userId: user.id,
        action: 'HOTEL_BOOKING_REFUND_SETTLEMENT_FAILED',
        resource: 'hotel_booking',
        resourceId: booking.id,
        newValue: { error: (err as Error).message, amount: refundAmount },
      });
    }

    await this.prisma.hotelBooking.update({ where: { id: booking.id }, data: { status: 'REFUNDED' } });
    await this.audit.record({
      userId: user.id,
      action: 'HOTEL_BOOKING_CANCELLED',
      resource: 'hotel_booking',
      resourceId: booking.id,
      newValue: { reason, refundAmount, currency: booking.currency },
    });

    return this.loadBookingDetail(booking.id);
  }

  // ── Internals ─────────────────────────────────────────────────────

  private assertOwnsOrCan(
    user: AuthenticatedUser,
    actor: HotelActor | null,
    booking: { customerId: string | null; agentId: string | null; employeeId: string | null },
    anyPermission: string,
    ownPermission: string,
  ): void {
    if (user.permissions.includes(anyPermission)) return;
    if (!user.permissions.includes(ownPermission)) {
      throw new ForbiddenException('You do not have permission to access hotel bookings');
    }
    const ownsIt =
      !!actor &&
      ((booking.customerId && actor.customerId === booking.customerId) ||
        (booking.agentId && actor.agentId === booking.agentId) ||
        (booking.employeeId && actor.employeeId === booking.employeeId));
    if (!ownsIt) {
      throw new ForbiddenException('You do not have access to this hotel booking');
    }
  }

  private async resolveActor(user: AuthenticatedUser): Promise<HotelActor> {
    const record = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: {
        customer: { select: { id: true } },
        agent: { select: { id: true, agencyId: true } },
        employee: { select: { id: true } },
      },
    });
    if (record?.customer) return { customerId: record.customer.id };
    if (record?.agent) return { agentId: record.agent.id, agencyId: record.agent.agencyId };
    if (record?.employee) return { employeeId: record.employee.id };
    throw new ForbiddenException('This account has no customer, agent, or employee profile and cannot create or view hotel bookings');
  }

  private async loadBookingDetail(bookingId: string) {
    return this.prisma.hotelBooking.findUniqueOrThrow({
      where: { id: bookingId },
      include: {
        offer: { include: { property: true } },
        refunds: { orderBy: { createdAt: 'desc' } },
      },
    });
  }

  private async generateUniqueBookingReference(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = generateReferenceCode('MH', 6);
      const clash = await this.prisma.hotelBooking.findUnique({ where: { bookingReference: candidate } });
      if (!clash) return candidate;
    }
    throw new Error('Could not generate a unique hotel booking reference after 5 attempts');
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
