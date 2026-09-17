import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthenticatedUser, Permission } from '@mohammad-travels/types';
import { PricingAdminService } from './pricing-admin.service';
import { CreateMarkupRuleDto } from './dto/create-markup-rule.dto';
import { UpdateMarkupRuleDto } from './dto/update-markup-rule.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

/**
 * Markup rules ARE the pricing engine's configuration (see
 * PricingService/schema.prisma's MarkupRule comment: "data, not code").
 * This is the only way rows in that table are ever written outside a
 * migration — restricted to Permission.PRICING_MANAGE, which only
 * FINANCE and SUPER_ADMIN hold by default (B2B_AGENCY_ADMIN does not:
 * an agency doesn't get to set its own markup).
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('admin/pricing/markup-rules')
export class PricingAdminController {
  constructor(private readonly pricingAdmin: PricingAdminService) {}

  @RequirePermissions(Permission.PRICING_MANAGE)
  @Get()
  async list(@Query('scope') scope?: string, @Query('agencyId') agencyId?: string, @Query('active') active?: string) {
    const rules = await this.pricingAdmin.list({
      scope,
      agencyId,
      active: active === undefined ? undefined : active === 'true',
    });
    return { rules: rules.map(serializeRule) };
  }

  @RequirePermissions(Permission.PRICING_MANAGE)
  @Post()
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateMarkupRuleDto) {
    return serializeRule(await this.pricingAdmin.create(user, dto));
  }

  @RequirePermissions(Permission.PRICING_MANAGE)
  @Patch(':id')
  async update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateMarkupRuleDto) {
    return serializeRule(await this.pricingAdmin.update(user, id, dto));
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeRule(rule: any) {
  return {
    id: rule.id,
    scope: rule.scope,
    supplierId: rule.supplierId,
    supplierCode: rule.supplier?.code,
    airlineCode: rule.airlineCode,
    route: rule.route,
    cabin: rule.cabin,
    fareFamily: rule.fareFamily,
    agencyId: rule.agencyId,
    agencyName: rule.agency?.name,
    type: rule.type,
    value: Number(rule.value),
    minAmount: rule.minAmount !== null && rule.minAmount !== undefined ? Number(rule.minAmount) : null,
    maxAmount: rule.maxAmount !== null && rule.maxAmount !== undefined ? Number(rule.maxAmount) : null,
    priority: rule.priority,
    active: rule.active,
    createdAt: rule.createdAt,
  };
}
