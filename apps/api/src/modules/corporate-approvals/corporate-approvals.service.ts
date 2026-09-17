import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthenticatedUser } from '@mohammad-travels/types';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BookingsService } from '../bookings/bookings.service';
import { DecideApprovalDto } from './dto/decide-approval.dto';

/**
 * Implements the workflow schema.prisma's CorporateApproval comment
 * originally described as "schema-only... NOT IMPLEMENTED" when that
 * table was added in Phase 2's DB pass. BookingsService.createBooking
 * decides whether a CORPORATE-channel booking is auto-approved (in
 * policy — see TravelPolicyService) or needs a human: only the latter
 * creates a PENDING row here. This service is the human half: see the
 * pending queue, decide.
 */
@Injectable()
export class CorporateApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly bookingsService: BookingsService,
  ) {}

  /** Every PENDING approval for an employee in the SAME corporate as the acting approver — never another corporate's, even for a SUPER_ADMIN-adjacent role, since this endpoint is approver-scoped by design (see assertApprover). */
  async listPending(user: AuthenticatedUser) {
    const corporateId = await this.resolveApproverCorporateId(user);
    return this.prisma.corporateApproval.findMany({
      where: { status: 'PENDING', requestedByEmployee: { corporateId } },
      orderBy: { createdAt: 'asc' },
      include: {
        requestedByEmployee: { select: { id: true, title: true, user: { select: { fullName: true, email: true } } } },
        booking: { include: { offer: { include: { segments: { orderBy: { sequence: 'asc' } } } } } },
      },
    });
  }

  async decide(user: AuthenticatedUser, approvalId: string, dto: DecideApprovalDto) {
    const corporateId = await this.resolveApproverCorporateId(user);

    const approval = await this.prisma.corporateApproval.findUnique({
      where: { id: approvalId },
      include: { requestedByEmployee: true, booking: { include: { offer: { include: { supplier: true } } } } },
    });
    if (!approval) throw new NotFoundException('Approval request not found');
    if (approval.requestedByEmployee.corporateId !== corporateId) {
      // Same reasoning as BookingsService.assertCanView — an approver
      // never even learns whether an approval for another corporate
      // exists, let alone decides it.
      throw new ForbiddenException('You do not have access to this approval request');
    }
    if (approval.status !== 'PENDING') {
      throw new ConflictException(`This request was already ${approval.status.toLowerCase()}`);
    }

    const updated = await this.prisma.corporateApproval.update({
      where: { id: approvalId },
      data: { status: dto.decision, approverUserId: user.id, reason: dto.reason ?? null, decidedAt: new Date() },
    });

    await this.audit.record({
      userId: user.id,
      action: dto.decision === 'APPROVED' ? 'CORPORATE_APPROVAL_APPROVED' : 'CORPORATE_APPROVAL_REJECTED',
      resource: 'corporate_approval',
      resourceId: approvalId,
      newValue: { bookingId: approval.bookingId, reason: dto.reason },
    });

    if (dto.decision === 'APPROVED') {
      // Only NOW does ticketing happen for a CORPORATE booking — see
      // BookingsService.createBooking's CORPORATE branch.
      const { adapter, supplierBookingReference } = await this.bookingsService.getAdapterForBooking(approval.bookingId);
      await this.bookingsService.issueTicketsForBooking(approval.bookingId, adapter, supplierBookingReference, user.id);
    } else {
      // The booking was already charged (payment/wallet debit happens
      // right after the supplier CONFIRMED it, before the approval gate
      // — see createBooking) even though it was never ticketed, so a
      // rejection has to actually give that money back, not just flip
      // the booking to CANCELLED. Goes through the same shared
      // cancel/refund path cancelBooking() uses — this service's own
      // resolveApproverCorporateId check above is the authorization,
      // not booking ownership, so it calls performCancellation directly.
      const bookingDetail = await this.bookingsService.getBookingForInternalUse(approval.bookingId);
      await this.bookingsService.performCancellation(bookingDetail, {
        actorUserId: user.id,
        reason: dto.reason ? `Corporate approval rejected: ${dto.reason}` : 'Corporate approval rejected',
      });
    }

    return updated;
  }

  private async resolveApproverCorporateId(user: AuthenticatedUser): Promise<string> {
    const record = await this.prisma.user.findUnique({ where: { id: user.id }, select: { employee: { select: { corporateId: true } } } });
    if (!record?.employee) {
      throw new ForbiddenException('This account has no corporate employee profile and cannot review approvals');
    }
    return record.employee.corporateId;
  }
}
