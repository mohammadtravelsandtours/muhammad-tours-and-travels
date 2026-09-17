import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditEntry {
  userId?: string | null;
  action: string;
  resource: string;
  resourceId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  ipAddress?: string | null;
}

export interface ListAuditEntriesFilters {
  resource?: string;
  action?: string;
  userId?: string;
  /**
   * Whether the caller holds Permission.AUDIT_READ_FINANCIAL, resolved
   * by the controller from the guarded route (this service never
   * checks permissions itself — see RbacService's identical convention
   * and its reasoning). AUDIT_READ alone still sees every non-financial
   * action; only rows for a financial resource are held back.
   */
  includeFinancial: boolean;
}

/**
 * Resources whose audit trail records money movement. Kept as an
 * explicit, small allowlist rather than inferred from the action name,
 * so a new financial resource added later must be added here on
 * purpose — silently under- or over-redacting is worse than a
 * one-line PR reminder next time one is added.
 */
const FINANCIAL_RESOURCES = ['wallet'];

/**
 * Append-only. Every sensitive administrative action listed in
 * docs/SECURITY.md § Audit logging goes through this service rather
 * than a bare prisma.auditLog.create() scattered across controllers,
 * so the shape stays consistent and callers can't accidentally allow
 * updates/deletes on audit rows. Reading is fine to add here too —
 * "append-only" describes the write path, not a ban on queries.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        userId: entry.userId ?? null,
        action: entry.action,
        resource: entry.resource,
        resourceId: entry.resourceId ?? null,
        oldValue: entry.oldValue === undefined ? undefined : (entry.oldValue as object),
        newValue: entry.newValue === undefined ? undefined : (entry.newValue as object),
        ipAddress: entry.ipAddress ?? null,
      },
    });
  }

  async list(filters: ListAuditEntriesFilters, pagination: { take: number; cursor?: string }) {
    if (filters.resource && FINANCIAL_RESOURCES.includes(filters.resource) && !filters.includeFinancial) {
      // They explicitly asked to filter down to a financial resource
      // without the permission for it — return an empty page rather
      // than silently substituting a different resource's rows, which
      // would be more confusing, not less.
      return { entries: [], nextCursor: null };
    }

    const where: Record<string, unknown> = {};
    if (filters.userId) where.userId = filters.userId;
    if (filters.action) where.action = filters.action;
    if (filters.resource) {
      where.resource = filters.resource;
    } else if (!filters.includeFinancial) {
      where.resource = { notIn: FINANCIAL_RESOURCES };
    }

    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: pagination.take + 1,
      ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
      include: { user: { select: { id: true, email: true, fullName: true } } },
    });

    const hasMore = rows.length > pagination.take;
    const entries = hasMore ? rows.slice(0, -1) : rows;
    return { entries, nextCursor: hasMore ? entries[entries.length - 1].id : null };
  }
}
