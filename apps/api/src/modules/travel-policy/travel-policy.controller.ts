import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthenticatedUser, Permission } from '@mohammad-travels/types';
import { TravelPolicyService } from './travel-policy.service';
import { CreateCostCenterDto, UpdateCostCenterDto, UpsertTravelPolicyDto } from './dto/travel-policy.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(value: string, what: string): void {
  if (!UUID_RE.test(value)) throw new BadRequestException(`${what} is not a valid id`);
}

/** Admin management — an ops/finance-side role configuring another company's policy, not the company itself. */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('admin/corporates/:corporateId')
export class TravelPolicyAdminController {
  constructor(private readonly travelPolicy: TravelPolicyService) {}

  @RequirePermissions(Permission.TRAVEL_POLICY_MANAGE)
  @Get('policy')
  async getPolicy(@Param('corporateId') corporateId: string) {
    assertUuid(corporateId, 'corporateId');
    return this.travelPolicy.getPolicy(corporateId);
  }

  @RequirePermissions(Permission.TRAVEL_POLICY_MANAGE)
  @Post('policy')
  async upsertPolicy(@Param('corporateId') corporateId: string, @Body() dto: UpsertTravelPolicyDto, @CurrentUser() user: AuthenticatedUser) {
    assertUuid(corporateId, 'corporateId');
    return this.travelPolicy.upsertPolicy(user, corporateId, dto);
  }

  @RequirePermissions(Permission.TRAVEL_POLICY_MANAGE)
  @Get('departments/:departmentId/policy')
  async getDepartmentPolicy(@Param('corporateId') corporateId: string, @Param('departmentId') departmentId: string) {
    assertUuid(corporateId, 'corporateId');
    assertUuid(departmentId, 'departmentId');
    return this.travelPolicy.getDepartmentPolicy(corporateId, departmentId);
  }

  @RequirePermissions(Permission.TRAVEL_POLICY_MANAGE)
  @Post('departments/:departmentId/policy')
  async upsertDepartmentPolicy(
    @Param('corporateId') corporateId: string,
    @Param('departmentId') departmentId: string,
    @Body() dto: UpsertTravelPolicyDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    assertUuid(corporateId, 'corporateId');
    assertUuid(departmentId, 'departmentId');
    return this.travelPolicy.upsertDepartmentPolicy(user, corporateId, departmentId, dto);
  }

  @RequirePermissions(Permission.TRAVEL_POLICY_MANAGE)
  @Delete('departments/:departmentId/policy')
  async deleteDepartmentPolicy(
    @Param('corporateId') corporateId: string,
    @Param('departmentId') departmentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    assertUuid(corporateId, 'corporateId');
    assertUuid(departmentId, 'departmentId');
    return this.travelPolicy.deleteDepartmentPolicy(user, corporateId, departmentId);
  }

  @RequirePermissions(Permission.COST_CENTERS_MANAGE)
  @Get('cost-centers')
  async listCostCenters(@Param('corporateId') corporateId: string) {
    assertUuid(corporateId, 'corporateId');
    return { costCenters: await this.travelPolicy.listCostCenters(corporateId) };
  }

  @RequirePermissions(Permission.COST_CENTERS_MANAGE)
  @Post('cost-centers')
  async createCostCenter(@Param('corporateId') corporateId: string, @Body() dto: CreateCostCenterDto, @CurrentUser() user: AuthenticatedUser) {
    assertUuid(corporateId, 'corporateId');
    return this.travelPolicy.createCostCenter(user, corporateId, dto);
  }

  @RequirePermissions(Permission.COST_CENTERS_MANAGE)
  @Patch('cost-centers/:id')
  async updateCostCenter(@Param('id') id: string, @Body() dto: UpdateCostCenterDto, @CurrentUser() user: AuthenticatedUser) {
    assertUuid(id, 'id');
    return this.travelPolicy.updateCostCenter(user, id, dto);
  }
}

/** Self-service — a corporate employee/approver picking their OWN company's cost center at booking time. Scoped server-side to the caller's own corporate; there is deliberately no :corporateId param here. */
@UseGuards(JwtAuthGuard)
@Controller('corporate/cost-centers')
export class MyCostCentersController {
  constructor(private readonly travelPolicy: TravelPolicyService) {}

  @Get()
  async listMine(@CurrentUser() user: AuthenticatedUser) {
    return { costCenters: await this.travelPolicy.listMyCostCenters(user) };
  }
}
