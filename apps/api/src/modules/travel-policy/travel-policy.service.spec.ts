import { TravelPolicyService } from './travel-policy.service';

/**
 * Covers TravelPolicyService.evaluate()'s decision table — the gate that
 * decides whether a CORPORATE booking is rejected outright, auto-approved,
 * or escalated to a human CORPORATE_APPROVER (see BookingsService.createBooking).
 * Getting any of these branches backwards means either a company's hard
 * cap silently stops blocking spend, or every compliant booking starts
 * needlessly waiting on a human — so each branch gets its own case rather
 * than one broad smoke test.
 */
function makeFakePrisma(policy: any, departmentPoliciesByDepartmentId: Record<string, any> = {}) {
  return {
    travelPolicy: {
      findUnique: async () => policy,
    },
    departmentTravelPolicy: {
      findUnique: async ({ where }: any) => departmentPoliciesByDepartmentId[where.departmentId] ?? null,
    },
  };
}

/** Not-configured by default (returns null for any cross-currency conversion, same-currency unchanged) — mirrors FxRatesService's own real "not configured" behavior, so every pre-existing test keeps exercising this platform's original no-FX-conversion default path. */
function makeFxFake(overrides: { convert?: (amount: number, from: string, to: string) => Promise<number | null> } = {}) {
  return { convert: overrides.convert ?? (async (amount: number, from: string, to: string) => (from === to ? amount : null)) };
}

function makeService(
  policy: any,
  departmentPoliciesByDepartmentId: Record<string, any> = {},
  fx: ReturnType<typeof makeFxFake> = makeFxFake(),
) {
  return new TravelPolicyService(makeFakePrisma(policy, departmentPoliciesByDepartmentId) as any, {} as any, fx as any);
}

describe('TravelPolicyService.evaluate', () => {
  it('requires approval (never blocks) when no policy is configured — the pre-existing default behavior', async () => {
    const service = makeService(null);
    const result = await service.evaluate('corp-1', { cabin: 'FIRST', totalFare: 999999, currency: 'USD' });
    expect(result).toMatchObject({ blocked: false, requiresApproval: true, note: null });
  });

  it('passes a fully in-policy booking through with no approval needed', async () => {
    const policy = { maxCabin: 'BUSINESS', blockOverMaxCabin: true, softFareCapAmount: 1500, hardFareCapAmount: 4000, currency: 'USD' };
    const service = makeService(policy);
    const result = await service.evaluate('corp-1', { cabin: 'ECONOMY', totalFare: 500, currency: 'USD' });
    expect(result).toMatchObject({ blocked: false, requiresApproval: false, note: null });
  });

  it('blocks outright when the cabin exceeds maxCabin and blockOverMaxCabin is true', async () => {
    const policy = { maxCabin: 'ECONOMY', blockOverMaxCabin: true, softFareCapAmount: null, hardFareCapAmount: null, currency: 'USD' };
    const service = makeService(policy);
    const result = await service.evaluate('corp-1', { cabin: 'BUSINESS', totalFare: 500, currency: 'USD' });
    expect(result.blocked).toBe(true);
    expect(result.requiresApproval).toBe(false);
  });

  it('escalates (does not block) when the cabin exceeds maxCabin but blockOverMaxCabin is false', async () => {
    const policy = { maxCabin: 'ECONOMY', blockOverMaxCabin: false, softFareCapAmount: null, hardFareCapAmount: null, currency: 'USD' };
    const service = makeService(policy);
    const result = await service.evaluate('corp-1', { cabin: 'BUSINESS', totalFare: 500, currency: 'USD' });
    expect(result.blocked).toBe(false);
    expect(result.requiresApproval).toBe(true);
  });

  it('blocks outright above the hard fare cap', async () => {
    const policy = { maxCabin: 'FIRST', blockOverMaxCabin: true, softFareCapAmount: 1500, hardFareCapAmount: 4000, currency: 'USD' };
    const service = makeService(policy);
    const result = await service.evaluate('corp-1', { cabin: 'ECONOMY', totalFare: 4001, currency: 'USD' });
    expect(result.blocked).toBe(true);
    expect(result.requiresApproval).toBe(false);
  });

  it('escalates (does not block) between the soft and hard fare caps', async () => {
    const policy = { maxCabin: 'FIRST', blockOverMaxCabin: true, softFareCapAmount: 1500, hardFareCapAmount: 4000, currency: 'USD' };
    const service = makeService(policy);
    const result = await service.evaluate('corp-1', { cabin: 'ECONOMY', totalFare: 2000, currency: 'USD' });
    expect(result.blocked).toBe(false);
    expect(result.requiresApproval).toBe(true);
  });

  it('never applies a fare cap across mismatched currencies when FX conversion is not configured (this platform\'s default)', async () => {
    const policy = { maxCabin: 'FIRST', blockOverMaxCabin: true, softFareCapAmount: 100, hardFareCapAmount: 200, currency: 'USD' };
    const service = makeService(policy); // makeFxFake() default — not configured, exactly like FxRatesService with no FX_RATES_JSON set.
    // 50000 BDT would fail both caps if compared as raw numbers against a
    // USD policy — the currency mismatch must skip the fare-cap checks
    // entirely rather than compare incorrectly.
    const result = await service.evaluate('corp-1', { cabin: 'ECONOMY', totalFare: 50000, currency: 'BDT' });
    expect(result).toMatchObject({ blocked: false, requiresApproval: false, note: null });
  });

  it('a hard-cap violation takes priority over a cabin check that would only escalate', async () => {
    // maxCabin allows BUSINESS outright (no escalation from cabin alone),
    // so the hard-cap block below must come from the fare check, not a
    // fallthrough from the cabin branch.
    const policy = { maxCabin: 'BUSINESS', blockOverMaxCabin: true, softFareCapAmount: 1000, hardFareCapAmount: 2000, currency: 'USD' };
    const service = makeService(policy);
    const result = await service.evaluate('corp-1', { cabin: 'BUSINESS', totalFare: 2500, currency: 'USD' });
    expect(result.blocked).toBe(true);
  });

  describe('department policy overrides', () => {
    it('uses the corporate default when the employee has no department', async () => {
      const corporatePolicy = { maxCabin: 'ECONOMY', blockOverMaxCabin: true, softFareCapAmount: null, hardFareCapAmount: null, currency: 'USD' };
      const service = makeService(corporatePolicy, { 'dept-sales': { maxCabin: 'FIRST', blockOverMaxCabin: false, softFareCapAmount: null, hardFareCapAmount: null, currency: 'USD' } });

      const result = await service.evaluate('corp-1', { cabin: 'BUSINESS', totalFare: 500, currency: 'USD', departmentId: null });
      // Falls through to the corporate policy (ECONOMY cap), not the
      // unrelated department override that happens to exist elsewhere.
      expect(result.blocked).toBe(true);
    });

    it('uses the corporate default when the employee\'s department has no override configured', async () => {
      const corporatePolicy = { maxCabin: 'ECONOMY', blockOverMaxCabin: true, softFareCapAmount: null, hardFareCapAmount: null, currency: 'USD' };
      const service = makeService(corporatePolicy, {}); // no override for 'dept-engineering'

      const result = await service.evaluate('corp-1', { cabin: 'BUSINESS', totalFare: 500, currency: 'USD', departmentId: 'dept-engineering' });
      expect(result.blocked).toBe(true);
    });

    it('prefers the department override over the corporate default when both exist', async () => {
      // Corporate default would block BUSINESS outright; the sales
      // department's override explicitly allows up to FIRST.
      const corporatePolicy = { maxCabin: 'ECONOMY', blockOverMaxCabin: true, softFareCapAmount: null, hardFareCapAmount: null, currency: 'USD' };
      const departmentOverride = { maxCabin: 'FIRST', blockOverMaxCabin: true, softFareCapAmount: null, hardFareCapAmount: null, currency: 'USD' };
      const service = makeService(corporatePolicy, { 'dept-sales': departmentOverride });

      const result = await service.evaluate('corp-1', { cabin: 'BUSINESS', totalFare: 500, currency: 'USD', departmentId: 'dept-sales' });
      expect(result).toMatchObject({ blocked: false, requiresApproval: false, note: null });
    });

    it('a department override can be STRICTER than the corporate default, not just looser', async () => {
      // Corporate default allows FIRST outright; the intern department's
      // override caps at ECONOMY — overrides aren't a one-way "loosen only" escape hatch.
      const corporatePolicy = { maxCabin: 'FIRST', blockOverMaxCabin: true, softFareCapAmount: null, hardFareCapAmount: null, currency: 'USD' };
      const departmentOverride = { maxCabin: 'ECONOMY', blockOverMaxCabin: true, softFareCapAmount: null, hardFareCapAmount: null, currency: 'USD' };
      const service = makeService(corporatePolicy, { 'dept-interns': departmentOverride });

      const result = await service.evaluate('corp-1', { cabin: 'BUSINESS', totalFare: 500, currency: 'USD', departmentId: 'dept-interns' });
      expect(result.blocked).toBe(true);
    });
  });

  describe('FX-converted fare caps (FxRatesService configured) — additive, never replacing the unconfigured default path above', () => {
    // 1 USD = 110 BDT for every test in this block.
    const usdToBdt = makeFxFake({
      convert: async (amount, from, to) => {
        if (from === to) return amount;
        if (from === 'USD' && to === 'BDT') return Math.round(amount * 110 * 100) / 100;
        if (from === 'BDT' && to === 'USD') return Math.round((amount / 110) * 100) / 100;
        return null;
      },
    });

    it('converts the fare into the policy currency and blocks above the hard cap', async () => {
      const policy = { maxCabin: 'FIRST', blockOverMaxCabin: true, softFareCapAmount: null, hardFareCapAmount: 200, currency: 'USD' };
      const service = makeService(policy, {}, usdToBdt);
      // 50000 BDT ≈ 454.5 USD, over the 200 USD hard cap.
      const result = await service.evaluate('corp-1', { cabin: 'ECONOMY', totalFare: 50000, currency: 'BDT' });
      expect(result.blocked).toBe(true);
      expect(result.requiresApproval).toBe(false);
    });

    it('converts the fare into the policy currency and escalates between the soft and hard caps', async () => {
      const policy = { maxCabin: 'FIRST', blockOverMaxCabin: true, softFareCapAmount: 100, hardFareCapAmount: 1000, currency: 'USD' };
      const service = makeService(policy, {}, usdToBdt);
      // 22000 BDT = 200 USD — between the 100 and 1000 USD caps.
      const result = await service.evaluate('corp-1', { cabin: 'ECONOMY', totalFare: 22000, currency: 'BDT' });
      expect(result.blocked).toBe(false);
      expect(result.requiresApproval).toBe(true);
    });

    it('passes a converted fare through with no approval needed when it is comfortably within both caps', async () => {
      const policy = { maxCabin: 'FIRST', blockOverMaxCabin: true, softFareCapAmount: 1500, hardFareCapAmount: 4000, currency: 'USD' };
      const service = makeService(policy, {}, usdToBdt);
      // 5500 BDT = 50 USD — well under even the soft cap.
      const result = await service.evaluate('corp-1', { cabin: 'ECONOMY', totalFare: 5500, currency: 'BDT' });
      expect(result).toMatchObject({ blocked: false, requiresApproval: false, note: null });
    });

    it('still skips the fare-cap checks (never guesses) when FX is configured but this specific currency pair has no rate', async () => {
      const policy = { maxCabin: 'FIRST', blockOverMaxCabin: true, softFareCapAmount: 100, hardFareCapAmount: 200, currency: 'USD' };
      const service = makeService(policy, {}, usdToBdt); // knows USD<->BDT only
      const result = await service.evaluate('corp-1', { cabin: 'ECONOMY', totalFare: 50000, currency: 'EUR' });
      expect(result).toMatchObject({ blocked: false, requiresApproval: false, note: null });
    });

    it('includes the converted amount in the note so an approver can see both currencies', async () => {
      const policy = { maxCabin: 'FIRST', blockOverMaxCabin: true, softFareCapAmount: 100, hardFareCapAmount: 1000, currency: 'USD' };
      const service = makeService(policy, {}, usdToBdt);
      const result = await service.evaluate('corp-1', { cabin: 'ECONOMY', totalFare: 22000, currency: 'BDT' });
      expect(result.note).toBe(`Fare 22000 BDT (≈ 200 USD) exceeds this company's normal cap of 100 USD and needs sign-off`);
    });
  });
});
