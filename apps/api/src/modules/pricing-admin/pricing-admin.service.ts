import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthenticatedUser } from '@mohammad-travels/types';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateMarkupRuleDto } from './dto/create-markup-rule.dto';
import { UpdateMarkupRuleDto } from './dto/update-markup-rule.dto';

// Mirrors PricingService.whereForScope's field requirement exactly —
// duplicated here (rather than imported) because that method is
// private and scope-matching validation belongs at the write side
// regardless; a comment in each file points at the other so they don't
// drift silently if one changes.
const REQUIRED_FIELD_BY_SCOPE: Record<string, keyof CreateMarkupRuleDto | null> = {
  GLOBAL: null,
  SUPPLIER: 'supplierId',
  AIRLINE: 'airlineCode',
  ROUTE: 'route',
  CABIN: 'cabin',
  FARE_FAMILY: 'fareFamily',
  AGENCY: 'agencyId',
};

@Injectable()
export class PricingAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(filters: { scope?: string; agencyId?: string; active?: boolean }) {
    return this.prisma.markupRule.findMany({
      where: {
        ...(filters.scope ? { scope: filters.scope as never } : {}),
        ...(filters.agencyId ? { agencyId: filters.agencyId } : {}),
        ...(filters.active !== undefined ? { active: filters.active } : {}),
      },
      orderBy: [{ scope: 'asc' }, { priority: 'asc' }],
      include: { supplier: { select: { code: true, name: true } }, agency: { select: { name: true } } },
    });
  }

  async create(user: AuthenticatedUser, dto: CreateMarkupRuleDto) {
    const requiredField = REQUIRED_FIELD_BY_SCOPE[dto.scope];
    if (requiredField && !dto[requiredField]) {
      throw new BadRequestException(`scope ${dto.scope} requires ${requiredField} to be set — otherwise this rule would never match any offer`);
    }
    if (dto.minAmount !== undefined && dto.maxAmount !== undefined && dto.minAmount > dto.maxAmount) {
      throw new BadRequestException('minAmount cannot exceed maxAmount');
    }
    if (dto.type === 'PERCENTAGE' && (dto.value < 0 || dto.value > 100)) {
      throw new BadRequestException('A PERCENTAGE markup value must be between 0 and 100');
    }

    const rule = await this.prisma.markupRule.create({
      data: {
        scope: dto.scope,
        supplierId: dto.scope === 'SUPPLIER' ? dto.supplierId : null,
        airlineCode: dto.scope === 'AIRLINE' ? dto.airlineCode?.toUpperCase() : null,
        route: dto.scope === 'ROUTE' ? dto.route?.toUpperCase() : null,
        cabin: dto.scope === 'CABIN' ? dto.cabin : null,
        fareFamily: dto.scope === 'FARE_FAMILY' ? dto.fareFamily : null,
        agencyId: dto.scope === 'AGENCY' ? dto.agencyId : null,
        type: dto.type,
        value: dto.value,
        minAmount: dto.minAmount ?? null,
        maxAmount: dto.maxAmount ?? null,
        priority: dto.priority ?? 100,
        active: dto.active ?? true,
      },
    });

    await this.audit.record({
      userId: user.id,
      action: 'MARKUP_RULE_CREATED',
      resource: 'markup_rule',
      resourceId: rule.id,
      newValue: dto,
    });

    return rule;
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateMarkupRuleDto) {
    const existing = await this.prisma.markupRule.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Markup rule not found');

    if (dto.minAmount !== undefined && dto.maxAmount !== undefined && dto.minAmount > dto.maxAmount) {
      throw new BadRequestException('minAmount cannot exceed maxAmount');
    }

    const updated = await this.prisma.markupRule.update({
      where: { id },
      data: {
        value: dto.value ?? undefined,
        minAmount: dto.minAmount ?? undefined,
        maxAmount: dto.maxAmount ?? undefined,
        priority: dto.priority ?? undefined,
        active: dto.active ?? undefined,
      },
    });

    await this.audit.record({
      userId: user.id,
      action: 'MARKUP_RULE_UPDATED',
      resource: 'markup_rule',
      resourceId: id,
      oldValue: { value: Number(existing.value), active: existing.active, priority: existing.priority },
      newValue: dto,
    });

    return updated;
  }
}
