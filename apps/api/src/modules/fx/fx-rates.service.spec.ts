import { FxRatesService } from './fx-rates.service';

/**
 * Covers FxRatesService's actual conversion arithmetic and its
 * never-guess contract (null whenever a real conversion can't be done)
 * — the two things every consumer (TravelPolicyService, AnalyticsService)
 * depends on completely. The live-provider path is exercised with a
 * stubbed global.fetch rather than a real network call, consistent with
 * every other Phase 9 "real but unverified against the live third
 * party" integration in this codebase (see the class's own doc comment).
 */
type FxConfig = { baseCurrency: string; rates: Record<string, number>; provider?: { apiUrl: string; apiKey?: string } } | undefined;

function makeConfig(fx: FxConfig) {
  return {
    get: (key: string) => {
      if (key === 'integrations') return { fx };
      throw new Error(`unexpected config key in test fake: ${key}`);
    },
  };
}

function makeService(fx: FxConfig) {
  return new FxRatesService(makeConfig(fx) as any);
}

describe('FxRatesService — not configured (this platform\'s default)', () => {
  it('isConfigured() is false and baseCurrency is null', () => {
    const service = makeService(undefined);
    expect(service.isConfigured()).toBe(false);
    expect(service.baseCurrency).toBe(null);
  });

  it('still converts identically-currency amounts (an identity, not a real conversion)', async () => {
    const service = makeService(undefined);
    const result = await service.convert(500, 'USD', 'USD');
    expect(result).toBe(500);
  });

  it('returns null for any real cross-currency conversion', async () => {
    const service = makeService(undefined);
    const result = await service.convert(500, 'USD', 'BDT');
    expect(result).toBe(null);
  });
});

describe('FxRatesService — static rate table configured', () => {
  const fx: FxConfig = { baseCurrency: 'USD', rates: { USD: 1, BDT: 110, EUR: 0.92 } };

  it('isConfigured() is true and baseCurrency reflects the configured value', () => {
    const service = makeService(fx);
    expect(service.isConfigured()).toBe(true);
    expect(service.baseCurrency).toBe('USD');
  });

  it('converts from the base currency to a non-base currency', async () => {
    const service = makeService(fx);
    const result = await service.convert(100, 'USD', 'BDT');
    expect(result).toBe(11000);
  });

  it('converts from a non-base currency back to the base currency', async () => {
    const service = makeService(fx);
    const result = await service.convert(11000, 'BDT', 'USD');
    expect(result).toBe(100);
  });

  it('converts between two non-base currencies by pivoting through the base currency', async () => {
    const service = makeService(fx);
    // 110 BDT = 1 USD = ~1.0870 EUR (0.92 EUR per USD) -> 0.92 EUR for 110 BDT.
    const result = await service.convert(110, 'BDT', 'EUR');
    expect(result).toBe(0.92);
  });

  it('is case-insensitive on currency codes', async () => {
    const service = makeService(fx);
    const result = await service.convert(100, 'usd', 'bdt');
    expect(result).toBe(11000);
  });

  it('returns null (never guesses) for a currency with no entry in the rate table', async () => {
    const service = makeService(fx);
    const result = await service.convert(100, 'USD', 'GBP');
    expect(result).toBe(null);
  });

  it('same-currency conversion is exact even for a currency not in the table at all', async () => {
    const service = makeService(fx);
    const result = await service.convert(100, 'GBP', 'GBP');
    expect(result).toBe(100);
  });
});

describe('FxRatesService — live provider configured', () => {
  const fx: FxConfig = {
    baseCurrency: 'USD',
    rates: { USD: 1, BDT: 100 }, // deliberately different from the live rates below, so tests can tell which table was actually used
    provider: { apiUrl: 'https://fx.example.test/latest', apiKey: 'test-key' },
  };
  // No afterEach in this sandbox's minimal jest-shim (see run.mjs/
  // globals.mjs) — every test that stubs global.fetch restores it itself
  // in a finally block instead, so a leaked stub can never bleed into a
  // later test in this same process (all spec files run in one process
  // here — see run.mjs).
  async function withStubbedFetch<T>(impl: (url: string) => Promise<{ ok: boolean; status?: number; json: () => Promise<unknown> }>, run: () => Promise<T>): Promise<T> {
    const originalFetch = global.fetch;
    (global as any).fetch = impl;
    try {
      return await run();
    } finally {
      global.fetch = originalFetch;
    }
  }

  it('uses the live provider\'s rates over the static table when the fetch succeeds', async () => {
    const result = await withStubbedFetch(
      async () => ({ ok: true, json: async () => ({ rates: { USD: 1, BDT: 120 } }) }),
      () => makeService(fx).convert(100, 'USD', 'BDT'),
    );
    expect(result).toBe(12000); // 120, not the static table's 100
  });

  it('caches a successful live fetch — a second conversion within the TTL does not fetch again', async () => {
    let fetchCalls = 0;
    const fetchCallsSeen = await withStubbedFetch(
      async () => {
        fetchCalls += 1;
        return { ok: true, json: async () => ({ rates: { USD: 1, BDT: 120 } }) };
      },
      async () => {
        const service = makeService(fx);
        await service.convert(100, 'USD', 'BDT');
        await service.convert(200, 'USD', 'BDT');
        return fetchCalls;
      },
    );
    expect(fetchCallsSeen).toBe(1);
  });

  it('falls back to the static table when the live provider request fails, rather than throwing', async () => {
    const result = await withStubbedFetch(
      async () => {
        throw new Error('network unreachable');
      },
      () => makeService(fx).convert(100, 'USD', 'BDT'),
    );
    expect(result).toBe(10000); // the static table's rate (100), not null and not a thrown error
  });

  it('falls back to the static table when the live provider responds with a non-OK status', async () => {
    const result = await withStubbedFetch(
      async () => ({ ok: false, status: 503, json: async () => ({}) }),
      () => makeService(fx).convert(100, 'USD', 'BDT'),
    );
    expect(result).toBe(10000);
  });

  it('falls back to the static table when the live provider response has no "rates" field', async () => {
    const result = await withStubbedFetch(
      async () => ({ ok: true, json: async () => ({ base: 'USD' }) }),
      () => makeService(fx).convert(100, 'USD', 'BDT'),
    );
    expect(result).toBe(10000);
  });
});
