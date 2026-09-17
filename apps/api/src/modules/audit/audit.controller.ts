import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthenticatedUser, Permission } from '@mohammad-travels/types';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

function parseTake(raw?: string): number {
  const n = raw ? Number(raw) : 25;
  if (!Number.isFinite(n) || n <= 0) return 25;
  return Math.min(n, 100);
}

/**
 * Read side of AuditService — see its own doc comment for why a
 * read-only controller doesn't conflict with "append-only". Every
 * route here requires AUDIT_READ; rows for a financial resource
 * (currently just 'wallet' — see AuditService's FINANCIAL_RESOURCES)
 * are additionally held back unless the caller also has
 * AUDIT_READ_FINANCIAL, which is why FINANCE gets both and OPS_SUPPORT
 * only gets the former in packages/types' DEFAULT_ROLE_PERMISSIONS.
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('admin/audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @RequirePermissions(Permission.AUDIT_READ)
  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('resource') resource?: string,
    @Query('action') action?: string,
    @Query('userId') userId?: string,
    @Query('cursor') cursor?: string,
    @Query('take') take?: string,
  ) {
    return this.auditService.list(
      { resource, action, userId, includeFinancial: user.permissions.includes(Permission.AUDIT_READ_FINANCIAL) },
      { take: parseTake(take), cursor },
    );
  }
}
