import { BadRequestException, Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthenticatedUser, Permission, VisaApplicationStatus } from '@mohammad-travels/types';
import { VisasService } from './visas.service';
import { ApplyVisaDto } from './dto/apply-visa.dto';
import { UpdateVisaStatusDto } from './dto/update-visa-status.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES: VisaApplicationStatus[] = ['SUBMITTED', 'UNDER_REVIEW', 'ADDITIONAL_INFO_REQUIRED', 'APPROVED', 'REJECTED'];

function assertUuid(value: string, what: string): void {
  if (!UUID_RE.test(value)) throw new BadRequestException(`${what} is not a valid id`);
}

function serialize(application: {
  id: string;
  applicationReference: string;
  destinationCountry: string;
  visaType: string;
  travelDate: Date | null;
  applicantFullName: string;
  applicantPassportNumber: string;
  applicantNationality: string;
  contactEmail: string;
  contactPhone: string;
  status: string;
  reviewerNote: string | null;
  createdAt: Date;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  statusHistory?: any[];
}) {
  return {
    id: application.id,
    applicationReference: application.applicationReference,
    destinationCountry: application.destinationCountry,
    visaType: application.visaType,
    travelDate: application.travelDate,
    applicantFullName: application.applicantFullName,
    applicantPassportNumber: application.applicantPassportNumber,
    applicantNationality: application.applicantNationality,
    contactEmail: application.contactEmail,
    contactPhone: application.contactPhone,
    status: application.status,
    reviewerNote: application.reviewerNote,
    createdAt: application.createdAt,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    statusHistory: (application.statusHistory ?? []).map((h: any) => ({ fromStatus: h.fromStatus, toStatus: h.toStatus, note: h.note, createdAt: h.createdAt })),
  };
}

/** Self-service — apply for a visa, view/list one's OWN applications. Same customer/agent/employee actor model as bookings. */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('visas')
export class VisasController {
  constructor(private readonly visasService: VisasService) {}

  @RequirePermissions(Permission.VISA_APPLY)
  @Post()
  async apply(@Body() dto: ApplyVisaDto, @CurrentUser() user: AuthenticatedUser) {
    return serialize(await this.visasService.apply(user, dto));
  }

  @RequirePermissions(Permission.VISA_APPLY)
  @Get()
  async listMine(@CurrentUser() user: AuthenticatedUser) {
    const applications = await this.visasService.listMine(user);
    return { applications: applications.map((a) => serialize(a)) };
  }

  @RequirePermissions(Permission.VISA_APPLY)
  @Get(':id')
  async getOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    assertUuid(id, 'id');
    return serialize(await this.visasService.getOne(user, id));
  }
}

/** Staff review queue — VISA_MANAGE only (ops/visa-desk role), see roles.ts's DEFAULT_ROLE_PERMISSIONS. */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('admin/visas')
export class VisasAdminController {
  constructor(private readonly visasService: VisasService) {}

  @RequirePermissions(Permission.VISA_MANAGE)
  @Get()
  async listAll(@Query('status') status?: string) {
    const normalized = status && STATUSES.includes(status as VisaApplicationStatus) ? (status as VisaApplicationStatus) : undefined;
    const applications = await this.visasService.listAll(normalized);
    return { applications: applications.map((a) => serialize(a)) };
  }

  @RequirePermissions(Permission.VISA_MANAGE)
  @Get(':id')
  async getOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    assertUuid(id, 'id');
    return serialize(await this.visasService.getOne(user, id));
  }

  @RequirePermissions(Permission.VISA_MANAGE)
  @Post(':id/status')
  async updateStatus(@Param('id') id: string, @Body() dto: UpdateVisaStatusDto, @CurrentUser() user: AuthenticatedUser) {
    assertUuid(id, 'id');
    return serialize(await this.visasService.updateStatus(user, id, dto));
  }
}
