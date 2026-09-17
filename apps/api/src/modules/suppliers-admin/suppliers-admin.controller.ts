import { BadRequestException, Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { AuthenticatedUser, Permission } from '@mohammad-travels/types';
import { SuppliersAdminService } from './suppliers-admin.service';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Never returns a real credential — Supplier has no column that holds
 * one (see its schema.prisma comment: real secrets live only in env
 * vars named by credentialEnvPrefix). credentialLoginIdMasked is the
 * only credential-adjacent field this ever serializes, and it's already
 * pre-masked at the DB layer, not redacted here.
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('admin/suppliers')
export class SuppliersAdminController {
  constructor(private readonly suppliersAdmin: SuppliersAdminService) {}

  @RequirePermissions(Permission.SUPPLIERS_MANAGE)
  @Get()
  async list() {
    const suppliers = await this.suppliersAdmin.list();
    return { suppliers: suppliers.map((s) => serializeSupplier(s)) };
  }

  @RequirePermissions(Permission.SUPPLIERS_MANAGE)
  @Get(':id')
  async get(@Param('id') id: string) {
    assertUuid(id);
    const supplier = await this.suppliersAdmin.get(id);
    return serializeSupplier(supplier, true);
  }

  @RequirePermissions(Permission.SUPPLIERS_MANAGE)
  @Patch(':id')
  async update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateSupplierDto) {
    assertUuid(id);
    return serializeSupplier(await this.suppliersAdmin.update(user, id, dto));
  }
}

function assertUuid(value: string): void {
  if (!UUID_RE.test(value)) throw new BadRequestException('id is not a valid supplier id');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeSupplier(s: any, withHistory = false) {
  return {
    id: s.id,
    code: s.code,
    name: s.name,
    type: s.type,
    active: s.active,
    registeredInCode: s.registeredInCode,
    priority: s.priority,
    currency: s.currency,
    timeoutMs: s.timeoutMs,
    rateLimitPerMinute: s.rateLimitPerMinute,
    credentialLoginIdMasked: s.credentialLoginIdMasked,
    credentialStatus: s.credentialStatus,
    health: s.health
      ? {
          status: s.health.status,
          lastSuccessAt: s.health.lastSuccessAt,
          lastErrorAt: s.health.lastErrorAt,
          lastErrorMessage: s.health.lastErrorMessage,
          avgResponseMs: s.health.avgResponseMs,
          consecutiveErrors: s.health.consecutiveErrors,
        }
      : null,
    ...(withHistory
      ? {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          recentRuns: (s.recentRuns ?? []).map((r: any) => ({
            status: r.status,
            latencyMs: r.latencyMs,
            offerCount: r.offerCount,
            errorMessage: r.errorMessage,
            createdAt: r.createdAt,
          })),
        }
      : {}),
  };
}
