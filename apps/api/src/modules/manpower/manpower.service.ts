import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthenticatedUser, ManpowerApplicationStatus } from '@mohammad-travels/types';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateManpowerJobDto, UpdateManpowerJobDto } from './dto/create-manpower-job.dto';
import { ApplyManpowerJobDto } from './dto/apply-manpower-job.dto';
import { UpdateManpowerStatusDto } from './dto/update-manpower-status.dto';
import { generateReferenceCode } from '../../common/utils/reference-code.util';

interface ManpowerActor {
  customerId?: string;
  agentId?: string;
  employeeId?: string;
}

/**
 * Overseas job placement / recruitment. Jobs are an admin-managed,
 * publicly browsable catalog like HajjUmrahPackage; applications are a
 * workflow/document process like VisaApplication — see schema.prisma's
 * ManpowerJob/ManpowerApplication doc comments. Deliberately no fee or
 * payment anywhere in this service: this platform does not charge
 * candidates a recruitment fee (see docs/ROADMAP.md).
 */
@Injectable()
export class ManpowerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Job catalog ───────────────────────────────────────────────────

  /** Public browse — active jobs only, optionally filtered by country/category, same no-auth pattern as GET /hajj-umrah/packages. */
  async listJobs(filter: { country?: string; category?: string }) {
    return this.prisma.manpowerJob.findMany({
      where: {
        active: true,
        ...(filter.country ? { country: { equals: filter.country, mode: 'insensitive' } } : {}),
        ...(filter.category ? { category: { equals: filter.category, mode: 'insensitive' } } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getJob(id: string) {
    const job = await this.prisma.manpowerJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('Manpower job not found');
    return job;
  }

  /** Staff-only (MANPOWER_MANAGE, enforced at the controller) — every job, including inactive/closed ones. */
  async listJobsAdmin() {
    return this.prisma.manpowerJob.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async createJob(dto: CreateManpowerJobDto, actorUserId: string) {
    const job = await this.prisma.manpowerJob.create({
      data: {
        title: dto.title,
        country: dto.country,
        employer: dto.employer ?? null,
        category: dto.category ?? null,
        positionsAvailable: dto.positionsAvailable,
        salaryMin: dto.salaryMin ?? null,
        salaryMax: dto.salaryMax ?? null,
        currency: dto.currency ?? null,
        contractDurationMonths: dto.contractDurationMonths ?? null,
        requirements: dto.requirements ?? undefined,
        benefits: dto.benefits ?? undefined,
        applicationDeadline: dto.applicationDeadline ? new Date(`${dto.applicationDeadline}T00:00:00.000Z`) : null,
        active: dto.active ?? true,
      },
    });

    await this.audit.record({
      userId: actorUserId,
      action: 'MANPOWER_JOB_CREATED',
      resource: 'manpower_job',
      resourceId: job.id,
      newValue: { title: job.title, country: job.country, positionsAvailable: job.positionsAvailable },
    });

    return job;
  }

  async updateJob(id: string, dto: UpdateManpowerJobDto, actorUserId: string) {
    const existing = await this.prisma.manpowerJob.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Manpower job not found');

    const job = await this.prisma.manpowerJob.update({
      where: { id },
      data: {
        title: dto.title,
        country: dto.country,
        employer: dto.employer,
        category: dto.category,
        positionsAvailable: dto.positionsAvailable,
        salaryMin: dto.salaryMin,
        salaryMax: dto.salaryMax,
        currency: dto.currency,
        contractDurationMonths: dto.contractDurationMonths,
        requirements: dto.requirements,
        benefits: dto.benefits,
        applicationDeadline: dto.applicationDeadline ? new Date(`${dto.applicationDeadline}T00:00:00.000Z`) : undefined,
        active: dto.active,
      },
    });

    await this.audit.record({
      userId: actorUserId,
      action: 'MANPOWER_JOB_UPDATED',
      resource: 'manpower_job',
      resourceId: id,
      oldValue: { active: existing.active, positionsAvailable: existing.positionsAvailable },
      newValue: { active: job.active, positionsAvailable: job.positionsAvailable },
    });

    return job;
  }

  // ── Applications ──────────────────────────────────────────────────

  async apply(user: AuthenticatedUser, jobId: string, dto: ApplyManpowerJobDto) {
    const job = await this.prisma.manpowerJob.findUnique({ where: { id: jobId } });
    if (!job || !job.active) throw new NotFoundException('This job is not currently accepting applications');
    if (job.applicationDeadline && job.applicationDeadline.getTime() < Date.now()) {
      throw new ConflictException('The application deadline for this job has passed');
    }

    const actor = await this.resolveActor(user);

    const application = await this.prisma.$transaction(async (tx) => {
      const created = await tx.manpowerApplication.create({
        data: {
          applicationReference: await this.generateUniqueReference(),
          jobId,
          applicantFullName: dto.applicantFullName,
          applicantPassportNumber: dto.applicantPassportNumber ?? null,
          applicantNationality: dto.applicantNationality,
          dateOfBirth: dto.dateOfBirth ? new Date(`${dto.dateOfBirth}T00:00:00.000Z`) : null,
          yearsOfExperience: dto.yearsOfExperience ?? null,
          currentOccupation: dto.currentOccupation ?? null,
          coverNote: dto.coverNote ?? null,
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
      // Denormalized counter, same pattern as HajjUmrahPackage.seatsBooked — kept in
      // sync inside the same transaction as the application's creation.
      await tx.manpowerJob.update({ where: { id: jobId }, data: { positionsFilled: { increment: 1 } } });
      return created;
    });

    await this.audit.record({
      userId: user.id,
      action: 'MANPOWER_APPLICATION_SUBMITTED',
      resource: 'manpower_application',
      resourceId: application.id,
      newValue: { applicationReference: application.applicationReference, jobId },
    });

    return this.loadDetail(application.id);
  }

  async listMine(user: AuthenticatedUser) {
    const actor = await this.resolveActor(user).catch(() => null);
    if (!actor) return [];

    const where = actor.customerId
      ? { customerId: actor.customerId }
      : actor.agentId
        ? { agentId: actor.agentId }
        : { employeeId: actor.employeeId };
    return this.prisma.manpowerApplication.findMany({ where, orderBy: { createdAt: 'desc' }, include: { job: true } });
  }

  async getOne(user: AuthenticatedUser, id: string) {
    const application = await this.loadDetail(id);
    if (user.permissions.includes('manpower:manage')) return application;

    const actor = await this.resolveActor(user).catch(() => null);
    const ownsIt =
      !!actor &&
      ((application.customerId && actor.customerId === application.customerId) ||
        (application.agentId && actor.agentId === application.agentId) ||
        (application.employeeId && actor.employeeId === application.employeeId));
    if (!ownsIt) throw new ForbiddenException('You do not have access to this manpower application');
    return application;
  }

  /** Staff-only (MANPOWER_MANAGE) — every submitted application, optionally filtered by status/job. */
  async listApplicationsAdmin(filter: { status?: ManpowerApplicationStatus; jobId?: string }) {
    return this.prisma.manpowerApplication.findMany({
      where: {
        status: filter.status,
        jobId: filter.jobId,
      },
      orderBy: { createdAt: 'desc' },
      include: { job: true },
    });
  }

  /** Staff-only (MANPOWER_MANAGE) status transition — mirrors VisaStatusHistory's role for VisaApplication. */
  async updateStatus(user: AuthenticatedUser, id: string, dto: UpdateManpowerStatusDto) {
    const application = await this.prisma.manpowerApplication.findUnique({ where: { id } });
    if (!application) throw new NotFoundException('Manpower application not found');

    this.assertValidTransition(application.status, dto.toStatus);
    await this.transition(application.id, application.status, dto.toStatus, user.id, dto.note);

    await this.audit.record({
      userId: user.id,
      action: 'MANPOWER_APPLICATION_STATUS_CHANGED',
      resource: 'manpower_application',
      resourceId: id,
      newValue: { fromStatus: application.status, toStatus: dto.toStatus, note: dto.note },
    });

    return this.loadDetail(id);
  }

  /** Self-service — the applicant (or the agent/employee who submitted on their behalf) withdraws their own application. Not available once SELECTED/VISA_PROCESSING/DEPLOYED. */
  async withdraw(user: AuthenticatedUser, id: string) {
    const application = await this.getOne(user, id); // throws ForbiddenException if the caller doesn't own it (staff can also withdraw on a candidate's behalf)
    this.assertValidTransition(application.status, 'WITHDRAWN');
    await this.transition(application.id, application.status, 'WITHDRAWN', user.id, 'Withdrawn by applicant');

    await this.audit.record({
      userId: user.id,
      action: 'MANPOWER_APPLICATION_WITHDRAWN',
      resource: 'manpower_application',
      resourceId: id,
    });

    return this.loadDetail(id);
  }

  // ── Internals ─────────────────────────────────────────────────────

  private async transition(
    id: string,
    from: ManpowerApplicationStatus,
    to: ManpowerApplicationStatus,
    actorUserId: string,
    note?: string,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.manpowerApplication.update({
        where: { id },
        data: { status: to, reviewerNote: note ?? undefined },
      }),
      this.prisma.manpowerStatusHistory.create({
        data: { applicationId: id, fromStatus: from, toStatus: to, actorUserId, note: note ?? null },
      }),
    ]);
  }

  /**
   * SUBMITTED -> UNDER_REVIEW -> SHORTLISTED -> INTERVIEW_SCHEDULED ->
   * SELECTED -> VISA_PROCESSING -> DEPLOYED (terminal). REJECTED is
   * reachable from any non-terminal status (staff); WITHDRAWN is
   * reachable from any status up to and including INTERVIEW_SCHEDULED
   * (applicant self-service, via the withdraw endpoint) — once SELECTED,
   * an offer is in motion and withdrawal goes through staff/REJECTED
   * instead so the job's positionsFilled/audit trail stay meaningful.
   */
  private assertValidTransition(from: ManpowerApplicationStatus, to: ManpowerApplicationStatus): void {
    const allowed: Record<ManpowerApplicationStatus, ManpowerApplicationStatus[]> = {
      SUBMITTED: ['UNDER_REVIEW', 'SHORTLISTED', 'REJECTED', 'WITHDRAWN'],
      UNDER_REVIEW: ['SHORTLISTED', 'REJECTED', 'WITHDRAWN'],
      SHORTLISTED: ['INTERVIEW_SCHEDULED', 'REJECTED', 'WITHDRAWN'],
      INTERVIEW_SCHEDULED: ['SELECTED', 'REJECTED', 'WITHDRAWN'],
      SELECTED: ['VISA_PROCESSING', 'REJECTED'],
      VISA_PROCESSING: ['DEPLOYED', 'REJECTED'],
      DEPLOYED: [],
      REJECTED: [],
      WITHDRAWN: [],
    };
    if (!allowed[from]?.includes(to)) {
      throw new ConflictException(`A ${from} manpower application cannot move to ${to}`);
    }
  }

  private async resolveActor(user: AuthenticatedUser): Promise<ManpowerActor> {
    const record = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { customer: { select: { id: true } }, agent: { select: { id: true } }, employee: { select: { id: true } } },
    });
    if (record?.customer) return { customerId: record.customer.id };
    if (record?.agent) return { agentId: record.agent.id };
    if (record?.employee) return { employeeId: record.employee.id };
    throw new BadRequestException('This account has no customer, agent, or employee profile and cannot apply for a job');
  }

  private async loadDetail(id: string) {
    return this.prisma.manpowerApplication.findUniqueOrThrow({
      where: { id },
      include: { job: true, statusHistory: { orderBy: { createdAt: 'asc' } } },
    });
  }

  private async generateUniqueReference(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = generateReferenceCode('MW', 6);
      const clash = await this.prisma.manpowerApplication.findUnique({ where: { applicationReference: candidate } });
      if (!clash) return candidate;
    }
    throw new Error('Could not generate a unique manpower application reference after 5 attempts');
  }
}
