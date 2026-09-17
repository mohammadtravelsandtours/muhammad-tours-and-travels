import { PricingService } from './pricing.service';

/**
 * MarkupRule scope precedence (AGENCY > FARE_FAMILY > ROUTE > CABIN >
 * AIRLINE > SUPPLIER > GLOBAL, first match wins, never stacked — see
 * PricingService's own doc comment and SCOPE_ORDER) is exactly the
 * kind of "looks obviously right, silently wrong if the order ever
 * gets reshuffled" logic that deserves a real regression test.
 */
function makeFakePrisma(rules: any[], supplier: any = null) {
  return {
    markupRule: {
      findFirst: jest.fn(async ({ where }: any) => {
        const matches = rules.filter(
          (r) => r.scope === where.scope && r.active === true && Object.entries(where).every(([key, value]) => key === 'scope' || key === 'active' || r[key] === value),
        );
        matches.sort((a, b) => a.priority - b.priority);
        return matches[0] ?? null;
      }),
    },
    supplier: {
      findUnique: jest.fn(async () => supplier),
    },
  };
}

const BASE_CONTEXT = {
  supplierId: 'sup-1',
  airlineCode: 'BG',
  route: 'DAC-DXB',
  cabin: 'ECONOMY' as const,
  fareFamily: 'STANDARD',
};

describe('PricingService.computeMarkup', () => {
  it('applies a PERCENTAGE rule as a percentage of the base fare, not an absolute amount', async () => {
    const prisma = makeFakePrisma([{ id: 'r1', scope: 'GLOBAL', active: true, priority: 1, type: 'PERCENTAGE', value: 5, minAmount: null, maxAmount: null }]);
    const pricing = new PricingService(prisma as any);

    const result = await pricing.computeMarkup(1000, BASE_CONTEXT);
    expect(result.markupAmount).toBe(50);
    expect(result.scope).toBe('GLOBAL');
  });

  it('applies a FIXED rule as an absolute amount regardless of base fare', async () => {
    const prisma = makeFakePrisma([{ id: 'r1', scope: 'GLOBAL', active: true, priority: 1, type: 'FIXED', value: 15, minAmount: null, maxAmount: null }]);
    const pricing = new PricingService(prisma as any);

    const result = await pricing.computeMarkup(1000, BASE_CONTEXT);
    expect(result.markupAmount).toBe(15);
  });

  it('clamps a percentage markup to minAmount/maxAmount when the rule sets them', async () => {
    const prisma = makeFakePrisma([{ id: 'r1', scope: 'GLOBAL', active: true, priority: 1, type: 'PERCENTAGE', value: 1, minAmount: 25, maxAmount: null }]);
    const pricing = new PricingService(prisma as any);

    // 1% of 1000 = 10, below the 25 floor
    const result = await pricing.computeMarkup(1000, BASE_CONTEXT);
    expect(result.markupAmount).toBe(25);
  });

  it('picks the most specific matching scope — AGENCY beats a GLOBAL rule', async () => {
    const prisma = makeFakePrisma([
      { id: 'global', scope: 'GLOBAL', active: true, priority: 1, type: 'FIXED', value: 5, minAmount: null, maxAmount: null },
      { id: 'agency', scope: 'AGENCY', agencyId: 'ag-1', active: true, priority: 1, type: 'FIXED', value: 40, minAmount: null, maxAmount: null },
    ]);
    const pricing = new PricingService(prisma as any);

    const result = await pricing.computeMarkup(1000, { ...BASE_CONTEXT, agencyId: 'ag-1' });
    expect(result.markupAmount).toBe(40);
    expect(result.scope).toBe('AGENCY');
  });

  it('falls through scope order when a more specific scope has no matching rule', async () => {
    const prisma = makeFakePrisma([
      { id: 'route', scope: 'ROUTE', route: 'DAC-DXB', active: true, priority: 1, type: 'FIXED', value: 20, minAmount: null, maxAmount: null },
    ]);
    const pricing = new PricingService(prisma as any);

    // No AGENCY (none supplied) or FARE_FAMILY rule exists, so ROUTE wins.
    const result = await pricing.computeMarkup(1000, BASE_CONTEXT);
    expect(result.markupAmount).toBe(20);
    expect(result.scope).toBe('ROUTE');
  });

  it('never stacks two matching rules — only the first scope in the order is applied', async () => {
    const prisma = makeFakePrisma([
      { id: 'route', scope: 'ROUTE', route: 'DAC-DXB', active: true, priority: 1, type: 'FIXED', value: 20, minAmount: null, maxAmount: null },
      { id: 'cabin', scope: 'CABIN', cabin: 'ECONOMY', active: true, priority: 1, type: 'FIXED', value: 999, minAmount: null, maxAmount: null },
    ]);
    const pricing = new PricingService(prisma as any);

    const result = await pricing.computeMarkup(1000, BASE_CONTEXT);
    expect(result.markupAmount).toBe(20); // ROUTE wins, CABIN's 999 never applied
  });

  it('ignores an inactive rule even if it would otherwise be the most specific match', async () => {
    const prisma = makeFakePrisma([
      { id: 'agency-inactive', scope: 'AGENCY', agencyId: 'ag-1', active: false, priority: 1, type: 'FIXED', value: 999, minAmount: null, maxAmount: null },
      { id: 'global', scope: 'GLOBAL', active: true, priority: 1, type: 'FIXED', value: 10, minAmount: null, maxAmount: null },
    ]);
    const pricing = new PricingService(prisma as any);

    const result = await pricing.computeMarkup(1000, { ...BASE_CONTEXT, agencyId: 'ag-1' });
    expect(result.markupAmount).toBe(10);
  });

  it('falls back to the supplier default markup when no rule matches at any scope', async () => {
    const prisma = makeFakePrisma([], { defaultMarkupType: 'PERCENTAGE', defaultMarkupValue: 3 });
    const pricing = new PricingService(prisma as any);

    const result = await pricing.computeMarkup(1000, BASE_CONTEXT);
    expect(result.markupAmount).toBe(30);
    expect(result.ruleId).toBeUndefined();
  });

  it('falls back to zero markup when there is no rule and no supplier default', async () => {
    const prisma = makeFakePrisma([], null);
    const pricing = new PricingService(prisma as any);

    const result = await pricing.computeMarkup(1000, BASE_CONTEXT);
    expect(result.markupAmount).toBe(0);
  });
});
