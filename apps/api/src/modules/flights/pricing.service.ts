import { Injectable } from '@nestjs/common';
import { CabinClass } from '@mohammad-travels/types';
import { PrismaService } from '../../prisma/prisma.service';

export interface MarkupContext {
  supplierId: string;
  airlineCode: string; // validating carrier
  route: string; // "ORIGIN-DEST" of the first-to-last segment
  cabin: CabinClass;
  fareFamily: string;
  /** Present only for a B2B-channel search/booking tied to a specific agency. */
  agencyId?: string;
}

export interface MarkupOutcome {
  markupAmount: number;
  ruleId?: string;
  scope?: string;
}

// Most specific first — the FIRST scope with any active matching rule
// wins; rules are never stacked. See MarkupRule's doc comment in
// schema.prisma: "Evaluated most-specific-first... data, not code."
const SCOPE_ORDER = ['AGENCY', 'FARE_FAMILY', 'ROUTE', 'CABIN', 'AIRLINE', 'SUPPLIER', 'GLOBAL'] as const;
type Scope = (typeof SCOPE_ORDER)[number];

/**
 * Convention (this adapter's own design choice, not stated in the
 * schema comment — documented here so it's discoverable):
 * MarkupType.PERCENTAGE's `value` is a percentage number (5 means 5%,
 * not 0.05); MarkupType.FIXED's `value` is an absolute amount in the
 * offer's currency.
 */
@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  async computeMarkup(baseFare: number, context: MarkupContext): Promise<MarkupOutcome> {
    for (const scope of SCOPE_ORDER) {
      const where = this.whereForScope(scope, context);
      if (!where) continue; // e.g. AGENCY scope has nothing to match when there's no agency in context

      const rule = await this.prisma.markupRule.findFirst({
        where: { ...where, scope, active: true },
        orderBy: { priority: 'asc' },
      });
      if (rule) {
        return { markupAmount: this.applyRule(baseFare, rule), ruleId: rule.id, scope };
      }
    }

    // No matching rule at any scope — fall back to the supplier's own
    // default markup (still data, just data that lives on Supplier
    // instead of a MarkupRule row), then to zero.
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: context.supplierId },
      select: { defaultMarkupType: true, defaultMarkupValue: true },
    });
    if (supplier?.defaultMarkupType && supplier.defaultMarkupValue != null) {
      return { markupAmount: this.applyValue(baseFare, supplier.defaultMarkupType, Number(supplier.defaultMarkupValue)) };
    }

    return { markupAmount: 0 };
  }

  private whereForScope(scope: Scope, ctx: MarkupContext): Record<string, unknown> | null {
    switch (scope) {
      case 'AGENCY':
        return ctx.agencyId ? { agencyId: ctx.agencyId } : null;
      case 'FARE_FAMILY':
        return { fareFamily: ctx.fareFamily };
      case 'ROUTE':
        return { route: ctx.route };
      case 'CABIN':
        return { cabin: ctx.cabin };
      case 'AIRLINE':
        return { airlineCode: ctx.airlineCode };
      case 'SUPPLIER':
        return { supplierId: ctx.supplierId };
      case 'GLOBAL':
        return {};
      default:
        return null;
    }
  }

  private applyRule(baseFare: number, rule: { type: string; value: unknown; minAmount: unknown; maxAmount: unknown }): number {
    let amount = this.applyValue(baseFare, rule.type as 'FIXED' | 'PERCENTAGE', Number(rule.value));
    if (rule.minAmount != null) amount = Math.max(amount, Number(rule.minAmount));
    if (rule.maxAmount != null) amount = Math.min(amount, Number(rule.maxAmount));
    return round2(amount);
  }

  private applyValue(baseFare: number, type: 'FIXED' | 'PERCENTAGE', value: number): number {
    return type === 'PERCENTAGE' ? round2(baseFare * (value / 100)) : round2(value);
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
