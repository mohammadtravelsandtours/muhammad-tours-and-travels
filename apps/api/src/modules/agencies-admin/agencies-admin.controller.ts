import { BadRequestException, Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { AuthenticatedUser, Permission } from '@mohammad-travels/types';
import { AgenciesAdminService } from './agencies-admin.service';
import { UpdateAgencyStatusDto } from './dto/update-agency-status.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('admin/agencies')
export class AgenciesAdminController {
  constructor(private readonly agenciesAdmin: AgenciesAdminService) {}

  @RequirePermissions(Permission.AGENCY_MANAGE)
  @Get()
  async list(@Query('status') status?: string) {
    const agencies = await this.agenciesAdmin.list(status);
    return { agencies: agencies.map(serializeAgency) };
  }

  @RequirePermissions(Permission.AGENCY_MANAGE)
  @Get(':id')
  async get(@Param('id') id: string) {
    assertUuid(id);
    return serializeAgency(await this.agenciesAdmin.get(id));
  }

  @RequirePermissions(Permission.AGENCY_MANAGE)
  @Patch(':id/status')
  async updateStatus(@Param('id') id: string, @Body() dto: UpdateAgencyStatusDto, @CurrentUser() user: AuthenticatedUser) {
    assertUuid(id);
    return serializeAgency(await this.agenciesAdmin.updateStatus(user, id, dto));
  }
}

function assertUuid(value: string): void {
  if (!UUID_RE.test(value)) throw new BadRequestException('id is not a valid agency id');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeAgency(a: any) {
  return {
    id: a.id,
    name: a.name,
    status: a.status,
    country: a.country,
    currency: a.currency,
    creditLimit: a.creditLimit !== undefined ? Number(a.creditLimit) : undefined,
    creditEnabled: a.creditEnabled,
    approvedAt: a.approvedAt,
    createdAt: a.createdAt,
    wallet: a.wallet ? { balance: Number(a.wallet.balance), currency: a.wallet.currency } : undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    members: (a.members ?? []).map((m: any) => ({ id: m.id, title: m.title, fullName: m.user.fullName, email: m.user.email })),
  };
}
