import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthenticatedUser, ManpowerApplicationStatus, Permission } from '@mohammad-travels/types';
import { ManpowerService } from './manpower.service';
import { CreateManpowerJobDto, UpdateManpowerJobDto } from './dto/create-manpower-job.dto';
import { ApplyManpowerJobDto } from './dto/apply-manpower-job.dto';
import { UpdateManpowerStatusDto } from './dto/update-manpower-status.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES: ManpowerApplicationStatus[] = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'SHORTLISTED',
  'INTERVIEW_SCHEDULED',
  'SELECTED',
  'VISA_PROCESSING',
  'DEPLOYED',
  'REJECTED',
  'WITHDRAWN',
];

function assertUuid(value: string, what: string): void {
  if (!UUID_RE.test(value)) throw new BadRequestException(`${what} is not a valid id`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeJob(job: any) {
  return {
    id: job.id,
    title: job.title,
    country: job.country,
    employer: job.employer,
    category: job.category,
    positionsAvailable: job.positionsAvailable,
    positionsFilled: job.positionsFilled,
    positionsRemaining: Math.max(job.positionsAvailable - job.positionsFilled, 0),
    salaryMin: job.salaryMin != null ? Number(job.salaryMin) : null,
    salaryMax: job.salaryMax != null ? Number(job.salaryMax) : null,
    currency: job.currency,
    contractDurationMonths: job.contractDurationMonths,
    requirements: job.requirements ?? [],
    benefits: job.benefits ?? [],
    applicationDeadline: job.applicationDeadline,
    active: job.active,
    createdAt: job.createdAt,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeApplication(application: any) {
  return {
    id: application.id,
    applicationReference: application.applicationReference,
    jobId: application.jobId,
    job: application.job && serializeJob(application.job),
    applicantFullName: application.applicantFullName,
    applicantPassportNumber: application.applicantPassportNumber,
    applicantNationality: application.applicantNationality,
    dateOfBirth: application.dateOfBirth,
    yearsOfExperience: application.yearsOfExperience,
    currentOccupation: application.currentOccupation,
    coverNote: application.coverNote,
    contactEmail: application.contactEmail,
    contactPhone: application.contactPhone,
    status: application.status,
    reviewerNote: application.reviewerNote,
    createdAt: application.createdAt,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    statusHistory: (application.statusHistory ?? []).map((h: any) => ({
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      note: h.note,
      createdAt: h.createdAt,
    })),
  };
}

/** Public browse (no auth — same as GET /flights/search, GET /hajj-umrah/packages) + authenticated apply/withdraw for the signed-in customer, agent, or corporate employee. */
@Controller('manpower')
export class ManpowerController {
  constructor(private readonly manpowerService: ManpowerService) {}

  @Get('jobs')
  async listJobs(@Query('country') country?: string, @Query('category') category?: string) {
    const jobs = await this.manpowerService.listJobs({ country, category });
    return { jobs: jobs.map((j) => serializeJob(j)) };
  }

  @Get('jobs/:id')
  async getJob(@Param('id') id: string) {
    assertUuid(id, 'id');
    return serializeJob(await this.manpowerService.getJob(id));
  }

  @UseGuards(JwtAuthGuard)
  @Post('jobs/:id/applications')
  async apply(@Param('id') id: string, @Body() dto: ApplyManpowerJobDto, @CurrentUser() user: AuthenticatedUser) {
    assertUuid(id, 'id');
    return serializeApplication(await this.manpowerService.apply(user, id, dto));
  }

  @UseGuards(JwtAuthGuard)
  @Get('applications')
  async listMine(@CurrentUser() user: AuthenticatedUser) {
    const applications = await this.manpowerService.listMine(user);
    return { applications: applications.map((a) => serializeApplication(a)) };
  }

  @UseGuards(JwtAuthGuard)
  @Get('applications/:id')
  async getOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    assertUuid(id, 'id');
    return serializeApplication(await this.manpowerService.getOne(user, id));
  }

  @UseGuards(JwtAuthGuard)
  @Post('applications/:id/withdraw')
  async withdraw(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    assertUuid(id, 'id');
    return serializeApplication(await this.manpowerService.withdraw(user, id));
  }
}

/** Admin job CRUD + application review queue — Permission.MANPOWER_MANAGE only (see roles.ts's DEFAULT_ROLE_PERMISSIONS). */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('admin/manpower')
export class ManpowerAdminController {
  constructor(private readonly manpowerService: ManpowerService) {}

  @RequirePermissions(Permission.MANPOWER_MANAGE)
  @Get('jobs')
  async listJobs() {
    const jobs = await this.manpowerService.listJobsAdmin();
    return { jobs: jobs.map((j) => serializeJob(j)) };
  }

  @RequirePermissions(Permission.MANPOWER_MANAGE)
  @Post('jobs')
  async createJob(@Body() dto: CreateManpowerJobDto, @CurrentUser() user: AuthenticatedUser) {
    return serializeJob(await this.manpowerService.createJob(dto, user.id));
  }

  @RequirePermissions(Permission.MANPOWER_MANAGE)
  @Patch('jobs/:id')
  async updateJob(@Param('id') id: string, @Body() dto: UpdateManpowerJobDto, @CurrentUser() user: AuthenticatedUser) {
    assertUuid(id, 'id');
    return serializeJob(await this.manpowerService.updateJob(id, dto, user.id));
  }

  @RequirePermissions(Permission.MANPOWER_MANAGE)
  @Get('applications')
  async listApplications(@Query('status') status?: string, @Query('jobId') jobId?: string) {
    if (jobId) assertUuid(jobId, 'jobId');
    const normalized = status && STATUSES.includes(status as ManpowerApplicationStatus) ? (status as ManpowerApplicationStatus) : undefined;
    const applications = await this.manpowerService.listApplicationsAdmin({ status: normalized, jobId });
    return { applications: applications.map((a) => serializeApplication(a)) };
  }

  @RequirePermissions(Permission.MANPOWER_MANAGE)
  @Get('applications/:id')
  async getOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    assertUuid(id, 'id');
    return serializeApplication(await this.manpowerService.getOne(user, id));
  }

  @RequirePermissions(Permission.MANPOWER_MANAGE)
  @Post('applications/:id/status')
  async updateStatus(@Param('id') id: string, @Body() dto: UpdateManpowerStatusDto, @CurrentUser() user: AuthenticatedUser) {
    assertUuid(id, 'id');
    return serializeApplication(await this.manpowerService.updateStatus(user, id, dto));
  }
}
