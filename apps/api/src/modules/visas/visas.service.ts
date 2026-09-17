import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthenticatedUser, VisaApplicationStatus } from '@mohammad-travels/types';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ApplyVisaDto } from './dto/apply-visa.dto';
import { UpdateVisaStatusDto } from './dto/update-visa-status.dto';
import { generateReferenceCode } from '../../common/utils/reference-code.util';

interface VisaActor {
  customerId?: string;
  agentId?: string;
  employeeId?: string;
}

/**
 * A workflow/document process, not a supplier-adapter search or booking —
 * see VisaApplication's schema.prisma doc comment. VISA_APPLY covers
 * submitting and viewing/listing one's OWN applications (the same
 * customer/agent/employee actors as bookings); VISA_MANAGE covers staff
 * review (list all, move status forward) — see DEFAULT_ROLE_PERMISSIONS
 * in roles.ts for which roles hold which.
 */
@Injectable()
export class VisasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async apply(user: AuthenticatedUser, dto: ApplyVisaDto) {
    const actor = await this.resolveActor(user);

    const application = await this.prisma.visaApplication.create({
      data: {
        applicationReference: await this.generateUniqueReference(),
        destinationCountry: dto.destinationCountry,
        visaType: dto.visaType,
        travelDate: dto.travelDate ? new Date(`${dto.travelDate}T00:00:00.000Z`) : null,
        applicantFullName: dto.applicantFullName,
        applicantPassportNumber: dto.applicantPassportNumber,
        applicantNationality: dto.applicantNationality,
        contactEmail: dto.contactEmail,
        contactPhone: dto.contactPhone,
        status: 'SUBMITTED',
        customerId: actor.customerId ?? null,
        agentId: actor.agentId ?? null,
        employeeId: actor.employeeId ?? null,
        submittedByUserId: user.id,
        statusHistory: {
          create: { fromStatus: null, toStatus: 'SUBMITTED', actorUserId: user.id },
        },
      },
    });

    await this.audit.record({
      userId: user.id,
      action: 'VISA_APPLICATION_SUBMITTED',
      resource: 'visa_application',
      resourceId: application.id,
      newValue: { applicationReference: application.applicationReference, destinationCountry: dto.destinationCountry, visaType: dto.visaType },
    });

    return this.loadDetail(application.id);
  }

  async listMine(user: AuthenticatedUser) {
    const actor = await this.resolveActor(user).catch(() => null);
    if (!actor) return [];

    const where = actor.customerId ? { customerId: actor.customerId } : actor.agentId ? { agentId: actor.agentId } : { employeeId: actor.employeeId };
    return this.prisma.visaApplication.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  async getOne(user: AuthenticatedUser, id: string) {
    const application = await this.loadDetail(id);
    if (user.permissions.includes('visa:manage')) return application;

    const actor = await this.resolveActor(user).catch(() => null);
    const ownsIt =
      !!actor &&
      ((application.customerId && actor.customerId === application.customerId) ||
        (application.agentId && actor.agentId === application.agentId) ||
        (application.employeeId && actor.employeeId === application.employeeId));
    if (!ownsIt) throw new ForbiddenException('You do not have access to this visa application');
    return application;
  }

  /** Staff-only (VISA_MANAGE, enforced at the controller) — every submitted application, optionally filtered by status. */
  async listAll(status?: VisaApplicationStatus) {
    return this.prisma.visaApplication.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Staff-only (VISA_MANAGE) status transition — mirrors VisaStatusHistory's role as this table's audit trail (BookingStatusHistory's counterpart for Booking). */
  async updateStatus(user: AuthenticatedUser, id: string, dto: UpdateVisaStatusDto) {
    const application = await this.prisma.visaApplication.findUnique({ where: { id } });
    if (!application) throw new NotFoundException('Visa application not found');

    this.assertValidTransition(application.status, dto.toStatus);

    await this.prisma.$transaction([
      this.prisma.visaApplication.update({
        where: { id },
        data: { status: dto.toStatus, reviewerNote: dto.note ?? application.reviewerNote },
      }),
      this.prisma.visaStatusHistory.create({
        data: { applicationId: id, fromStatus: application.status, toStatus: dto.toStatus, actorUserId: user.id, note: dto.note ?? null },
      }),
    ]);

    await this.audit.record({
      userId: user.id,
      action: 'VISA_APPLICATION_STATUS_CHANGED',
      resource: 'visa_application',
      resourceId: id,
      newValue: { fromStatus: application.status, toStatus: dto.toStatus, note: dto.note },
    });

    return this.loadDetail(id);
  }

  // ── Internals ─────────────────────────────────────────────────────

  /**
   * SUBMITTED -> UNDER_REVIEW -> (ADDITIONAL_INFO_REQUIRED <-> UNDER_REVIEW) -> APPROVED | REJECTED.
   * APPROVED/REJECTED are terminal. Not a generic state-machine service
   * (unlike bookings') since this is a single linear reviewer workflow
   * with one loop, not several products/branches sharing it.
   */
  private assertValidTransition(from: VisaApplicationStatus, to: VisaApplicationStatus): void {
    const allowed: Record<VisaApplicationStatus, VisaApplicationStatus[]> = {
      SUBMITTED: ['UNDER_REVIEW', 'ADDITIONAL_INFO_REQUIRED', 'APPROVED', 'REJECTED'],
      UNDER_REVIEW: ['ADDITIONAL_INFO_REQUIRED', 'APPROVED', 'REJECTED'],
      ADDITIONAL_INFO_REQUIRED: ['UNDER_REVIEW', 'REJECTED'],
      APPROVED: [],
      REJECTED: [],
    };
    if (!allowed[from]?.includes(to)) {
      throw new ConflictException(`A ${from} visa application cannot move to ${to}`);
    }
  }

  private async resolveActor(user: AuthenticatedUser): Promise<VisaActor> {
    const record = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { customer: { select: { id: true } }, agent: { select: { id: true } }, employee: { select: { id: true } } },
    });
    if (record?.customer) return { customerId: record.customer.id };
    if (record?.agent) return { agentId: record.agent.id };
    if (record?.employee) return { employeeId: record.employee.id };
    throw new BadRequestException('This account has no customer, agent, or employee profile and cannot apply for a visa');
  }

  private async loadDetail(id: string) {
    return this.prisma.visaApplication.findUniqueOrThrow({
      where: { id },
      include: { statusHistory: { orderBy: { createdAt: 'asc' } } },
    });
  }

  private async generateUniqueReference(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = generateReferenceCode('MV', 6);
      const clash = await this.prisma.visaApplication.findUnique({ where: { applicationReference: candidate } });
      if (!clash) return candidate;
    }
    throw new Error('Could not generate a unique visa application reference after 5 attempts');
  }
}
