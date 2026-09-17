import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuthenticatedUser, FlightSupplierAdapter } from '@mohammad-travels/types';
import { PrismaService } from '../../prisma/prisma.service';
import { SupplierRegistry } from '../suppliers/supplier-registry.service';
import { AuditService } from '../audit/audit.service';
import { BookingStateMachineService } from './booking-state-machine.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { generateReferenceCode } from '../../common/utils/reference-code.util';
import { WalletService, InsufficientFundsError } from '../wallet/wallet.service';
import { PaymentsService } from '../payments/payments.service';
import { NotificationsService } from '../notifications/notifications.service';
import { GoogleSheetsService } from '../integrations/google-sheets.service';
import { TravelPolicyService } from '../travel-policy/travel-policy.service';

interface Actor {
  customerId?: string;
  agentId?: string;
  employeeId?: string;
  /** Only set when agentId is — a B2B booking is funded from THIS agency's wallet, never the booking-creating agent's own personal balance (agents don't have one). */
  agencyId?: string;
}

/**
 * A price-change-confirmation-required response — deliberately NOT an
 * HTTP exception subclass with a fixed shape, so the controller can
 * return it as a normal 409 payload the frontend can read structured
 * data from (previousTotal/newTotal/currency) rather than parsing an
 * error message string.
 */
export class PriceChangedError extends Error {
  constructor(
    public readonly previousTotal: number,
    public readonly newTotal: number,
    public readonly currency: string,
  ) {
    super('The price for this offer has changed. Confirm the new total to proceed.');
  }
}

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly supplierRegistry: SupplierRegistry,
    private readonly stateMachine: BookingStateMachineService,
    private readonly audit: AuditService,
    private readonly wallet: WalletService,
    private readonly payments: PaymentsService,
    private readonly notifications: NotificationsService,
    private readonly googleSheets: GoogleSheetsService,
    private readonly travelPolicy: TravelPolicyService,
  ) {}

  async createBooking(user: AuthenticatedUser, dto: CreateBookingDto, idempotencyKey: string) {
    // Idempotency first, before anything else touches the database or a
    // supplier — a retried request with the same key returns the exact
    // booking the first attempt produced, never a second one.
    const existing = await this.prisma.booking.findUnique({ where: { idempotencyKey } });
    if (existing) {
      return this.loadBookingDetail(existing.id);
    }

    const offer = await this.prisma.flightOffer.findUnique({
      where: { id: dto.offerId },
      include: { search: true, supplier: true, segments: { orderBy: { sequence: 'asc' } } },
    });
    if (!offer) throw new NotFoundException('Offer not found or has expired');
    if (offer.search.expiresAt < new Date()) {
      throw new ConflictException('This search has expired — please search again for current fares');
    }

    const actor = await this.resolveActor(user);

    const adapter = this.supplierRegistry.get(offer.supplier.code);
    if (!adapter) {
      // Should be unreachable — an offer can only exist for a supplier
      // that was registered at search time — but never trust that a
      // previously-active supplier is still registered right now.
      throw new ConflictException(`Supplier ${offer.supplier.code} is no longer available`);
    }

    // Mandatory reprice — always performed here, regardless of whatever
    // a client-side reprice call earlier showed the user. See
    // docs/ARCHITECTURE.md: a booking is never created against a price
    // that wasn't just re-verified with the supplier.
    const reprice = await adapter.repriceFlight({
      supplierOfferId: offer.supplierOfferId,
      passengerCounts: this.countPassengers(dto.passengers),
    });

    if (!reprice.stillAvailable) {
      throw new ConflictException('This fare is no longer available — please search again');
    }

    const previousTotal = round2(Number(offer.baseFare) + Number(offer.taxes) + Number(offer.fees) + Number(offer.markupAmount));
    const newBaseTotal = reprice.newTotal ?? previousTotal;
    // markupAmount was computed once at search time and isn't
    // recalculated here — the traveler was quoted total_fare
    // (base+taxes+fees+markup); a reprice changes the supplier's
    // base/taxes/fees, so the same markup amount is carried forward
    // onto the new total rather than re-running the pricing engine
    // mid-booking, which would be a second, different price the
    // traveler never saw.
    const newTotal = round2(newBaseTotal + Number(offer.markupAmount));

    if (reprice.priceChanged && dto.acceptedTotalFare !== newTotal) {
      throw new PriceChangedError(previousTotal, newTotal, offer.currency);
    }

    const finalTotal = reprice.priceChanged ? newTotal : previousTotal;

    // B2B bookings are funded from the agency's wallet, never a payment
    // gateway — reject BEFORE a booking row (or a supplier call) is ever
    // made if the agency can't cover it, same as the reprice-unavailable
    // check above. This is a dry read, not a debit: the real, ledgered
    // debit only happens once the supplier has actually confirmed the
    // booking, below — see the comment there for why.
    if (actor.agencyId) {
      const wallet = await this.wallet.getOrCreateWallet(actor.agencyId);
      const agency = await this.prisma.b2BAgency.findUniqueOrThrow({ where: { id: actor.agencyId } });
      // A self-registered agency starts PENDING_APPROVAL and stays that
      // way until an admin approves it (see AgenciesAdminService) — this
      // is the enforcement of that status, not just the admin UI hiding
      // a button. Previously nothing checked this at all: a brand-new,
      // never-reviewed agency could book and spend from its wallet
      // immediately. Checked here (immediately before the funds check,
      // which already loads this same row) rather than at search time,
      // so a pending agency can still browse fares while waiting.
      if (agency.status !== 'ACTIVE') {
        throw new ForbiddenException(
          agency.status === 'PENDING_APPROVAL'
            ? 'This agency is awaiting approval and cannot book yet — contact support once your account has been reviewed.'
            : 'This agency has been suspended and cannot book — contact support.',
        );
      }
      const available = Number(wallet.balance) + (agency.creditEnabled ? Number(agency.creditLimit) : 0);
      if (finalTotal > available) {
        throw new ConflictException(
          `This agency's wallet cannot cover ${finalTotal} ${offer.currency} (${available} ${wallet.currency} available). Top up the wallet before booking.`,
        );
      }
    }

    // Corporate travel policy: evaluated BEFORE the booking row exists,
    // same discipline as the wallet/reprice checks above — a hard
    // (blocked) violation must never reach the supplier, let alone get a
    // Postgres row. A soft violation or "no policy configured for this
    // company" both proceed to booking; which one happened is carried
    // forward via policyEvaluation and decided again, below, once the
    // booking id exists (auto-approve-and-ticket vs. create a PENDING
    // CorporateApproval for a human).
    let policyEvaluation: { blocked: boolean; requiresApproval: boolean; note: string | null } | null = null;
    let corporateCostCenterId: string | null = null;
    if (offer.search.channel === 'CORPORATE' && actor.employeeId) {
      const employee = await this.prisma.employee.findUniqueOrThrow({ where: { id: actor.employeeId }, select: { corporateId: true, departmentId: true } });
      policyEvaluation = await this.travelPolicy.evaluate(employee.corporateId, {
        cabin: offer.cabin,
        totalFare: finalTotal,
        currency: offer.currency,
        departmentId: employee.departmentId,
      });
      if (policyEvaluation.blocked) {
        throw new ConflictException(policyEvaluation.note ?? 'This booking falls outside your company\'s travel policy and cannot be made');
      }
      corporateCostCenterId = await this.travelPolicy.resolveCostCenter(actor.employeeId, dto.costCenterId);
    }

    const booking = await this.prisma.booking.create({
      data: {
        bookingReference: await this.generateUniqueBookingReference(),
        offerId: offer.id,
        channel: offer.search.channel,
        customerId: actor.customerId ?? null,
        agentId: actor.agentId ?? null,
        employeeId: actor.employeeId ?? null,
        costCenterId: corporateCostCenterId,
        policyViolationNote: policyEvaluation?.note ?? null,
        contactName: dto.contactName,
        contactEmail: dto.contactEmail,
        contactPhone: dto.contactPhone,
        whatsappNumber: dto.whatsappNumber ?? null,
        status: 'SEARCHED',
        currency: offer.currency,
        totalAmount: finalTotal,
        idempotencyKey,
        passengers: {
          create: dto.passengers.map((p) => ({
            type: p.type,
            title: p.title,
            firstName: p.firstName,
            middleName: p.middleName ?? null,
            lastName: p.lastName,
            dateOfBirth: new Date(`${p.dateOfBirth}T00:00:00.000Z`),
            gender: p.gender ?? null,
            nationality: p.nationality ?? null,
            passportNumber: p.passportNumber ?? null,
            passportExpiry: p.passportExpiry ? new Date(`${p.passportExpiry}T00:00:00.000Z`) : null,
            passportIssuingCountry: p.passportIssuingCountry ?? null,
          })),
        },
      },
    });

    await this.audit.record({
      userId: user.id,
      action: 'BOOKING_CREATED',
      resource: 'booking',
      resourceId: booking.id,
      newValue: { bookingReference: booking.bookingReference, offerId: offer.id, totalAmount: finalTotal },
    });

    await this.stateMachine.transition(booking.id, 'PRICE_PENDING', { actorUserId: user.id, reason: 'Reprice performed at booking time' });
    await this.stateMachine.transition(booking.id, 'PRICE_CONFIRMED', { actorUserId: user.id, reason: reprice.priceChanged ? 'Price change explicitly accepted by caller' : 'Price unchanged' });
    await this.stateMachine.transition(booking.id, 'BOOKING_PENDING', { actorUserId: user.id });

    let supplierResult;
    try {
      supplierResult = await adapter.createBooking({
        supplierOfferId: offer.supplierOfferId,
        passengers: dto.passengers,
        contactEmail: dto.contactEmail,
        contactPhone: dto.contactPhone,
      });
    } catch (err) {
      this.logger.error(`Supplier ${offer.supplier.code} createBooking failed for booking ${booking.id}: ${(err as Error).message}`);
      await this.stateMachine.transition(booking.id, 'FAILED', { reason: `Supplier error: ${(err as Error).message}`.slice(0, 500) });
      await this.notifyFailed(booking.bookingReference, dto, (err as Error).message);
      return this.loadBookingDetail(booking.id);
    }

    if (supplierResult.status !== 'CONFIRMED') {
      await this.stateMachine.transition(booking.id, 'FAILED', { reason: `Supplier declined: ${supplierResult.status}` });
      await this.notifyFailed(booking.bookingReference, dto, `Supplier declined: ${supplierResult.status}`);
      return this.loadBookingDetail(booking.id);
    }

    await this.prisma.booking.update({
      where: { id: booking.id },
      data: { supplierBookingReference: supplierResult.supplierBookingReference },
    });
    await this.stateMachine.transition(booking.id, 'CONFIRMED', { actorUserId: user.id });

    if (actor.agencyId) {
      // The real, ledgered debit — deliberately AFTER the supplier has
      // confirmed, not before: this is a mock platform with no real
      // payment gateway or distributed reservation across the pre-check
      // above and this write, so debiting only once the booking is a
      // real, held supplier PNR means a failed/declined attempt (above)
      // never touches the wallet at all. Reusing the booking's own
      // idempotencyKey means a retried request can never double-debit.
      // enforceCreditLimit is still on as defense in depth against a
      // concurrent booking depleting the agency's funds between the
      // pre-check and here; if it trips at this late point the supplier
      // booking is already real and held, which this pass does not
      // auto-reconcile — it's audit-logged for ops to follow up on
      // manually (REQUIRES REAL RECONCILIATION TOOLING, not built here).
      try {
        await this.wallet.debitForBooking(actor.agencyId, finalTotal, booking.id, booking.bookingReference, idempotencyKey);
      } catch (err) {
        if (err instanceof InsufficientFundsError) {
          this.logger.error(
            `Booking ${booking.bookingReference} confirmed with supplier but the agency wallet could not be debited (${err.message}) — funds moved during booking. Needs manual reconciliation.`,
          );
          await this.audit.record({
            userId: user.id,
            action: 'BOOKING_WALLET_DEBIT_FAILED',
            resource: 'booking',
            resourceId: booking.id,
            newValue: { agencyId: actor.agencyId, amount: finalTotal, error: err.message },
          });
        } else {
          throw err;
        }
      }
    } else {
      // Non-B2B channels (B2C, CORPORATE) settle through the mock
      // payment provider instead of a wallet — see PaymentsService.
      // Reuses the booking's own idempotencyKey for the same reason the
      // wallet debit does: a retried request can never double-charge.
      await this.payments.chargeForBooking(booking.id, booking.bookingReference, finalTotal, offer.currency, idempotencyKey, dto.paymentMethodToken);
    }

    await this.notifications.sendBookingConfirmed({
      toEmail: dto.contactEmail,
      toName: dto.contactName,
      bookingReference: booking.bookingReference,
      totalAmount: finalTotal,
      currency: offer.currency,
    });

    // Secondary record-keeping (an ops-visible spreadsheet, alongside —
    // never instead of — the Postgres row above). Never awaited into the
    // response critical path's error handling: a Sheets outage must
    // never fail a real, already-confirmed booking.
    void this.googleSheets.recordBooking({
      bookingReference: booking.bookingReference,
      createdAt: booking.createdAt,
      channel: offer.search.channel,
      contactName: dto.contactName,
      contactEmail: dto.contactEmail,
      route: offer.segments.length > 0 ? `${offer.segments[0].origin}-${offer.segments[offer.segments.length - 1].destination}` : '',
      totalAmount: finalTotal,
      currency: offer.currency,
      status: 'CONFIRMED',
    });

    if (offer.search.channel === 'CORPORATE') {
      if (actor.employeeId) {
        if (policyEvaluation?.requiresApproval) {
          // Out of policy (or no policy configured for this company at
          // all) — confirmed with the supplier (the fare is real and
          // held) but deliberately NOT ticketed yet, see
          // docs/ARCHITECTURE.md § 26. Ticketing only happens once a
          // CORPORATE_APPROVER decides on this row (CorporateApprovalsService
          // calls issueTicketsForBooking on APPROVED, or refunds+cancels
          // the booking on REJECTED) — never on a timer.
          await this.prisma.corporateApproval.create({
            data: { bookingId: booking.id, requestedByEmployeeId: actor.employeeId, status: 'PENDING', reason: policyEvaluation.note },
          });
          await this.audit.record({
            userId: user.id,
            action: 'CORPORATE_APPROVAL_REQUESTED',
            resource: 'booking',
            resourceId: booking.id,
            newValue: { reason: policyEvaluation.note },
          });
        } else {
          // Fully within a configured travel policy — auto-approved by
          // the system rather than left waiting on a human. The
          // CorporateApproval row still exists (so the audit trail and
          // "why was this ticketed" question both have one consistent
          // place to look, whether a person or the policy engine decided)
          // but with no approverUserId, since no person made this call.
          await this.prisma.corporateApproval.create({
            data: {
              bookingId: booking.id,
              requestedByEmployeeId: actor.employeeId,
              status: 'APPROVED',
              reason: 'Auto-approved: within company travel policy',
              decidedAt: new Date(),
            },
          });
          await this.audit.record({ userId: user.id, action: 'CORPORATE_APPROVAL_AUTO_APPROVED', resource: 'booking', resourceId: booking.id });
          await this.issueTicketsForBooking(booking.id, adapter, supplierResult.supplierBookingReference, user.id);
        }
      } else {
        // Should be unreachable — a CORPORATE-channel search only comes
        // from an authenticated corporate employee (see
        // flights.controller.ts's deriveChannel) — but never silently
        // skip the approval gate if that invariant is ever violated.
        this.logger.error(`Booking ${booking.id} is CORPORATE-channel but has no employeeId actor — skipping approval gate`);
      }
      return this.loadBookingDetail(booking.id);
    }

    await this.issueTicketsForBooking(booking.id, adapter, supplierResult.supplierBookingReference, user.id);
    return this.loadBookingDetail(booking.id);
  }

  /**
   * Ticket issuance (Step 13), extracted so both the immediate B2C/B2B
   * path above and CorporateApprovalsService's post-approval path (a
   * CORPORATE booking only reaches this once an approver says yes) can
   * call the exact same logic. Not every supplier can issue tickets
   * programmatically (FlightSupplierAdapter.issueTicket is optional) —
   * when it can't, the booking simply stays CONFIRMED, which is a real,
   * valid, non-error end state, not a failure.
   */
  async issueTicketsForBooking(
    bookingId: string,
    adapter: Pick<FlightSupplierAdapter, 'issueTicket'>,
    supplierBookingReference: string,
    actorUserId?: string,
  ): Promise<void> {
    if (!adapter.issueTicket) return;

    const passengers = await this.prisma.passenger.findMany({ where: { bookingId } });
    let allIssued = true;
    for (const passenger of passengers) {
      try {
        const ticketResult = await adapter.issueTicket({ supplierBookingReference });
        if (ticketResult.status !== 'ISSUED' || ticketResult.ticketNumbers.length === 0) {
          allIssued = false;
          continue;
        }
        await this.prisma.ticket.create({
          data: { bookingId, passengerId: passenger.id, ticketNumber: ticketResult.ticketNumbers[0], status: 'ISSUED', issuedAt: new Date() },
        });
      } catch (err) {
        this.logger.error(`Ticketing failed for passenger ${passenger.id} on booking ${bookingId}: ${(err as Error).message}`);
        allIssued = false;
      }
    }
    if (allIssued) {
      await this.stateMachine.transition(bookingId, 'TICKETED', { actorUserId });
      await this.audit.record({ userId: actorUserId, action: 'BOOKING_TICKETED', resource: 'booking', resourceId: bookingId });

      const tickets = await this.prisma.ticket.findMany({ where: { bookingId } });
      const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
      if (booking) {
        await this.notifications.sendTicketIssued({
          toEmail: booking.contactEmail,
          toName: booking.contactName,
          bookingReference: booking.bookingReference,
          ticketNumbers: tickets.map((t) => t.ticketNumber),
        });
      }
    }
    // A partial-ticketing failure deliberately leaves the booking at
    // CONFIRMED rather than FAILED — the supplier booking IS real and
    // held; ticketing can be retried, which is NOT IMPLEMENTED as a
    // separate endpoint in this pass.
  }

  /** Best-effort "booking failed" notification for the two early-failure paths in createBooking — never throws (a notification failure must never mask the real booking failure being returned to the caller). */
  private async notifyFailed(bookingReference: string, dto: CreateBookingDto, reason: string): Promise<void> {
    try {
      await this.notifications.sendBookingFailed({ toEmail: dto.contactEmail, toName: dto.contactName, bookingReference, reason });
    } catch (err) {
      this.logger.warn(`Failed-booking notification itself failed for ${bookingReference}: ${(err as Error).message}`);
    }
  }

  /** Looks up a booking's adapter + supplierBookingReference by id — used by CorporateApprovalsService so it never has to import SupplierRegistry or reach into Prisma directly for this. */
  async getAdapterForBooking(bookingId: string) {
    const booking = await this.prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { offer: { include: { supplier: true } } } });
    if (!booking.supplierBookingReference) {
      throw new ConflictException('This booking has no confirmed supplier reference yet');
    }
    const adapter = this.supplierRegistry.get(booking.offer.supplier.code);
    if (!adapter) throw new ConflictException(`Supplier ${booking.offer.supplier.code} is no longer available`);
    return { adapter, supplierBookingReference: booking.supplierBookingReference };
  }

  async getBooking(user: AuthenticatedUser, bookingId: string) {
    const booking = await this.loadBookingDetail(bookingId);
    const actor = await this.resolveActor(user).catch(() => null);
    this.assertCanView(user, actor, booking);
    return booking;
  }

  /**
   * Loads a booking with no ownership check at all — for callers that
   * have ALREADY established their own, different authorization (e.g.
   * CorporateApprovalsService, which checks the acting user is an
   * approver for the requesting employee's corporate, not that they own
   * the booking themselves). Never expose this behind an endpoint
   * directly; every controller-facing read goes through getBooking().
   */
  async getBookingForInternalUse(bookingId: string) {
    return this.loadBookingDetail(bookingId);
  }

  /** Customer/agent/employee-initiated cancellation — ownership-checked, then handed to the shared refund/cancel logic below. */
  async cancelBooking(user: AuthenticatedUser, bookingId: string, reason?: string) {
    const booking = await this.loadBookingDetail(bookingId);
    const actor = await this.resolveActor(user).catch(() => null);
    this.assertCanCancel(user, actor, booking);
    return this.performCancellation(booking, { actorUserId: user.id, reason });
  }

  /**
   * The one real cancel/refund path, shared by the customer-facing
   * cancelBooking() above and CorporateApprovalsService's REJECTED
   * decision (which has its own approver-scoped authorization already —
   * see resolveApproverCorporateId — so it calls straight in here rather
   * than through cancelBooking's ownership check, which would wrongly
   * require the *approver* to own the booking).
   *
   * Money already moved by the time a booking reaches CONFIRMED (the
   * wallet debit or payment charge in createBooking happens right after
   * that transition, even for a CORPORATE booking still pending
   * approval) — so cancelling from either CONFIRMED or TICKETED always
   * means giving it back, never just flipping a status flag. The adapter
   * is asked first (never flip our own state before the supplier
   * confirms, mirroring createBooking's own discipline); if it declines,
   * this throws and nothing else changes.
   */
  async performCancellation(
    booking: Awaited<ReturnType<BookingsService['loadBookingDetail']>>,
    options: { actorUserId?: string; reason?: string },
  ) {
    if (!['CONFIRMED', 'TICKETED'].includes(booking.status)) {
      throw new ConflictException(`A ${booking.status.toLowerCase()} booking cannot be cancelled`);
    }

    const wasTicketed = booking.status === 'TICKETED';
    const adapter = this.supplierRegistry.get(booking.offer.supplier.code);

    if (booking.supplierBookingReference && adapter) {
      if (wasTicketed && adapter.refundBooking) {
        const result = await adapter.refundBooking({
          supplierBookingReference: booking.supplierBookingReference,
          ticketNumbers: booking.tickets.map((t) => t.ticketNumber),
          reason: options.reason,
        });
        if (result.status === 'FAILED') throw new ConflictException('The supplier declined to refund this ticket');
      } else if (!wasTicketed && adapter.cancelBooking) {
        const result = await adapter.cancelBooking({ supplierBookingReference: booking.supplierBookingReference, reason: options.reason });
        if (result.status === 'FAILED') throw new ConflictException('The supplier declined to cancel this booking');
      }
      // Adapter doesn't implement the relevant optional method (e.g. a
      // MANUAL-fare supplier) — proceed with our own cancellation anyway;
      // there's nothing programmatic left to ask it. Same "optional
      // adapter method" honesty as issueTicketsForBooking above.
    }

    if (wasTicketed) {
      await this.stateMachine.transition(booking.id, 'REFUND_PENDING', { actorUserId: options.actorUserId, reason: options.reason });
      await this.prisma.ticket.updateMany({ where: { bookingId: booking.id }, data: { status: 'VOID' } });
    } else {
      await this.stateMachine.transition(booking.id, 'CANCELLED', { actorUserId: options.actorUserId, reason: options.reason });
    }

    const refundAmount = Number(booking.totalAmount);
    const refund = await this.prisma.refund.create({
      data: { bookingId: booking.id, amount: refundAmount, currency: booking.currency, status: 'PROCESSING', reason: options.reason ?? null },
    });

    // Refunds go back to whatever actually paid: the agency's wallet for
    // a B2B booking, the mock payment provider for everything else
    // (B2C and CORPORATE both pay through PaymentsService — see
    // createBooking). Looked up from the booking's own agentId, not the
    // acting user's, since the acting user may be a corporate approver
    // rejecting someone else's booking, not the traveler themselves.
    const bookingAgent = booking.agentId
      ? await this.prisma.agent.findUnique({ where: { id: booking.agentId }, select: { agencyId: true } })
      : null;

    try {
      if (bookingAgent?.agencyId) {
        await this.wallet.creditForBooking(bookingAgent.agencyId, refundAmount, booking.id, booking.bookingReference, `refund:${booking.id}`, 'REFUND_CREDIT');
      } else {
        await this.payments.refundPayment(booking.id, refundAmount, booking.currency);
      }
      await this.prisma.refund.update({ where: { id: refund.id }, data: { status: 'COMPLETED' } });
    } catch (err) {
      // The booking/ticket side of the cancellation already happened and
      // is not rolled back — same "confirmed with supplier, needs manual
      // reconciliation" posture createBooking takes when a wallet debit
      // fails after a supplier already confirmed. Never silently claim
      // the money moved when it didn't.
      this.logger.error(`Refund settlement failed for booking ${booking.bookingReference}: ${(err as Error).message}`);
      await this.prisma.refund.update({ where: { id: refund.id }, data: { status: 'REJECTED' } });
      await this.audit.record({
        userId: options.actorUserId,
        action: 'BOOKING_REFUND_SETTLEMENT_FAILED',
        resource: 'booking',
        resourceId: booking.id,
        newValue: { error: (err as Error).message, amount: refundAmount },
      });
    }

    if (wasTicketed) {
      await this.stateMachine.transition(booking.id, 'REFUNDED', { actorUserId: options.actorUserId });
    }

    await this.audit.record({
      userId: options.actorUserId,
      action: 'BOOKING_CANCELLED',
      resource: 'booking',
      resourceId: booking.id,
      newValue: { reason: options.reason, refundAmount, currency: booking.currency },
    });

    return this.loadBookingDetail(booking.id);
  }

  async listMyBookings(user: AuthenticatedUser) {
    const actor = await this.resolveActor(user).catch(() => null);
    if (!actor) return [];

    // booking:read:agency (granted to B2B_AGENCY_ADMIN by default) turns
    // "my bookings" into "my agency's bookings" — every agent at the
    // same agency, not just the caller's own. Matches assertCanView's
    // agency-wide check below, and naturally still includes the admin's
    // own bookings since their own agent row's agencyId matches too.
    const canReadAgencyWide = !!actor.agencyId && user.permissions.includes('booking:read:agency');

    const where = canReadAgencyWide
      ? { agent: { agencyId: actor.agencyId } }
      : actor.customerId
        ? { customerId: actor.customerId }
        : actor.agentId
          ? { agentId: actor.agentId }
          : { employeeId: actor.employeeId };

    const bookings = await this.prisma.booking.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        offer: { include: { segments: { orderBy: { sequence: 'asc' } } } },
        // Cheap to always join; only actually read/serialized for the
        // agency-wide case above — an agency admin's list otherwise looks
        // identical row to row without knowing which agent/traveler each
        // one belongs to.
        agent: { include: { user: { select: { fullName: true, email: true } } } },
      },
    });
    return bookings;
  }

  /**
   * Looks a booking up by its human-typed reference, scoped to the
   * caller's OWN customer/agent/employee id at the database query level
   * (not a post-fetch check) — used by AiAssistantService's
   * get_my_flight_booking_status tool, where the input is free text from
   * a chat message and must never be trusted to resolve to someone
   * else's booking. Returns null rather than throwing when there's no
   * match, since "not found" and "not yours" both look identical here by
   * design (same reasoning as assertCanView never distinguishing the two).
   */
  async findMyBookingByReference(user: AuthenticatedUser, bookingReference: string) {
    const actor = await this.resolveActor(user).catch(() => null);
    if (!actor) return null;

    const ownershipFilter = actor.customerId ? { customerId: actor.customerId } : actor.agentId ? { agentId: actor.agentId } : { employeeId: actor.employeeId };

    const booking = await this.prisma.booking.findFirst({
      where: { bookingReference: bookingReference.trim().toUpperCase(), ...ownershipFilter },
      include: { offer: { include: { segments: { orderBy: { sequence: 'asc' } } } }, tickets: true },
    });
    return booking;
  }

  // ── Internals ─────────────────────────────────────────────────────

  /**
   * Fixed 2026-09-12: this previously checked only that the booking HAD
   * a customerId/agentId/employeeId and that the requester's ROLE
   * matched the right kind — never that it was the requester's OWN
   * customerId/agentId/employeeId. That meant any B2C_CUSTOMER could
   * load any OTHER customer's booking (passenger names, DOB, passport
   * numbers, contact info, price) by id alone, and likewise across
   * agents and employees — exactly the IDOR the mega-prompt's "a
   * customer never sees another customer's booking" rule exists to
   * prevent. Caught while writing this file's ownership test suite; the
   * fix is to actually compare the resolved actor's own id against the
   * booking's, not just match on role.
   */
  private assertCanView(
    user: AuthenticatedUser,
    actor: Actor | null,
    booking: { customerId: string | null; agentId: string | null; employeeId: string | null; agent?: { agencyId: string } | null },
  ): void {
    if (user.permissions.includes('booking:read:any')) return;

    // Agency-wide visibility (booking:read:agency, granted to
    // B2B_AGENCY_ADMIN by default — see DEFAULT_ROLE_PERMISSIONS):
    // an agency admin may view ANY booking made by an agent at their own
    // agency, not just their own — compared against the booking's
    // agent's agencyId (loadBookingDetail's `agent` include), never the
    // booking's own agentId, since that would only ever match the
    // requester's own bookings again.
    if (user.permissions.includes('booking:read:agency') && actor?.agencyId && booking.agent?.agencyId === actor.agencyId) {
      return;
    }

    // Department-wide (booking:read:department) visibility is still not
    // implemented — same disclosed scope limit, denied by default until
    // it's built.
    const ownsIt =
      !!actor &&
      ((booking.customerId && actor.customerId === booking.customerId) ||
        (booking.agentId && actor.agentId === booking.agentId) ||
        (booking.employeeId && actor.employeeId === booking.employeeId));

    if (!ownsIt) {
      throw new ForbiddenException('You do not have access to this booking');
    }
  }

  /** Same ownership shape as assertCanView, gated on the cancel permissions rather than the read ones — a role can hold one without the other (see DEFAULT_ROLE_PERMISSIONS). */
  private assertCanCancel(
    user: AuthenticatedUser,
    actor: Actor | null,
    booking: { customerId: string | null; agentId: string | null; employeeId: string | null },
  ): void {
    if (user.permissions.includes('booking:cancel:any')) return;
    if (!user.permissions.includes('booking:cancel:own')) {
      throw new ForbiddenException('You do not have permission to cancel bookings');
    }

    const ownsIt =
      !!actor &&
      ((booking.customerId && actor.customerId === booking.customerId) ||
        (booking.agentId && actor.agentId === booking.agentId) ||
        (booking.employeeId && actor.employeeId === booking.employeeId));

    if (!ownsIt) {
      throw new ForbiddenException('You do not have access to this booking');
    }
  }

  private async resolveActor(user: AuthenticatedUser): Promise<Actor> {
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
    throw new ForbiddenException('This account has no customer, agent, or employee profile and cannot create or view bookings');
  }

  private async loadBookingDetail(bookingId: string) {
    const booking = await this.prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: {
        offer: { include: { segments: { orderBy: { sequence: 'asc' } }, supplier: { select: { code: true, name: true } } } },
        passengers: true,
        tickets: true,
        statusHistory: { orderBy: { createdAt: 'asc' } },
        refunds: { orderBy: { createdAt: 'desc' } },
        costCenter: { select: { id: true, code: true, name: true } },
        // Only ever read by assertCanView's agency-wide (booking:read:agency)
        // check — never serialized to a response (see
        // BookingsController.serializeBooking, which doesn't touch it).
        agent: { select: { agencyId: true } },
      },
    });
    return booking;
  }

  private countPassengers(passengers: CreateBookingDto['passengers']) {
    return {
      adults: passengers.filter((p) => p.type === 'ADULT').length,
      children: passengers.filter((p) => p.type === 'CHILD').length,
      infants: passengers.filter((p) => p.type === 'INFANT').length,
    };
  }

  private async generateUniqueBookingReference(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = generateReferenceCode('MT', 6);
      const clash = await this.prisma.booking.findUnique({ where: { bookingReference: candidate } });
      if (!clash) return candidate;
    }
    throw new Error('Could not generate a unique booking reference after 5 attempts');
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
