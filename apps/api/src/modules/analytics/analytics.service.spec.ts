import { AnalyticsService } from './analytics.service';

/**
 * Covers AnalyticsService.getOverview()'s currency-aware money
 * aggregation — in particular a real pre-existing bug this same change
 * fixes: walletBalanceTotal used to sum every agency wallet's balance
 * across currencies with no conversion at all (a USD wallet and a BDT
 * wallet just added together), which grossRevenueByCurrency was always
 * careful never to do. walletBalanceByCurrency/walletBalanceTotal below
 * exercise that fix directly; the *ConvertedTotal fields exercise the
 * new, purely additive FxRatesService wiring (null whenever FX isn't
 * configured — every existing consumer of walletBalanceTotal/
 * grossRevenueByCurrency is completely unaffected either way).
 */
const SETTLED = ['CONFIRMED', 'TICKETED'];

function makeFakePrisma(options: {
  bookings: Array<{ status: string; currency: string; totalAmount: number }>;
  hotelBookings: Array<{ status: string; currency: string; totalAmount: number }>;
  wallets: Array<{ currency: string; balance: number }>;
}) {
  function groupByCurrency(rows: Array<{ status: string; currency: string; totalAmount: number }>, allowedStatuses?: string[]) {
    const filtered = allowedStatuses ? rows.filter((r) => allowedStatuses.includes(r.status)) : rows;
    const map = new Map<string, number>();
    for (const r of filtered) map.set(r.currency, (map.get(r.currency) ?? 0) + r.totalAmount);
    return [...map.entries()].map(([currency, sum]) => ({ currency, _sum: { totalAmount: sum } }));
  }
  function groupByStatus(rows: Array<{ status: string; totalAmount: number }>) {
    const map = new Map<string, { count: number; sum: number }>();
    for (const r of rows) {
      const e = map.get(r.status) ?? { count: 0, sum: 0 };
      e.count += 1;
      e.sum += r.totalAmount;
      map.set(r.status, e);
    }
    return [...map.entries()].map(([status, v]) => ({ status, _count: { _all: v.count }, _sum: { totalAmount: v.sum } }));
  }

  return {
    booking: {
      groupBy: async ({ by, where }: any) =>
        by[0] === 'status' ? groupByStatus(options.bookings) : groupByCurrency(options.bookings, where?.status?.in),
    },
    hotelBooking: {
      groupBy: async ({ by, where }: any) =>
        by[0] === 'status' ? groupByStatus(options.hotelBookings) : groupByCurrency(options.hotelBookings, where?.status?.in),
    },
    visaApplication: { groupBy: async () => [] },
    manpowerApplication: { groupBy: async () => [] },
    travelPackage: { count: async () => 0 },
    b2BAgency: { count: async () => 0 },
    corporate: { count: async () => 0 },
    hotelProperty: { count: async () => 0 },
    wallet: {
      aggregate: async () => ({ _sum: { balance: options.wallets.reduce((sum, w) => sum + w.balance, 0) } }),
      groupBy: async () => {
        const map = new Map<string, number>();
        for (const w of options.wallets) map.set(w.currency, (map.get(w.currency) ?? 0) + w.balance);
        return [...map.entries()].map(([currency, sum]) => ({ currency, _sum: { balance: sum } }));
      },
    },
  } as any;
}

/** Not-configured by default, exactly like FxRatesService with no FX_RATES_JSON set. Only knows USD<->BDT when overridden, mirroring FxRatesService.convert's own "null means don't guess" contract for any other pair. */
function makeFxFake(overrides: { configured?: boolean; baseCurrency?: string } = {}) {
  const configured = overrides.configured ?? false;
  const baseCurrency = overrides.baseCurrency ?? 'USD';
  return {
    isConfigured: () => configured,
    baseCurrency,
    convert: async (amount: number, from: string, to: string) => {
      if (from === to) return amount;
      if (!configured) return null;
      if (from === 'USD' && to === 'BDT') return amount * 110;
      if (from === 'BDT' && to === 'USD') return amount / 110;
      return null; // e.g. EUR — deliberately no rate, to exercise unconvertedCurrencies
    },
  };
}

describe('AnalyticsService.getOverview — currency-aware money aggregation', () => {
  const bookings = [
    { status: 'CONFIRMED', currency: 'USD', totalAmount: 500 },
    { status: 'TICKETED', currency: 'BDT', totalAmount: 11000 },
    { status: 'CANCELLED', currency: 'USD', totalAmount: 9999 }, // not settled — must be excluded from revenue entirely
  ];
  const hotelBookings = [{ status: 'CONFIRMED', currency: 'EUR', totalAmount: 50 }];
  const wallets = [
    { currency: 'USD', balance: 100 },
    { currency: 'BDT', balance: 11000 },
  ];

  it('breaks wallet balances out per currency instead of summing across currencies (the bug this fixes)', async () => {
    const service = new AnalyticsService(makeFakePrisma({ bookings, hotelBookings, wallets }), makeFxFake() as any);
    const overview = await service.getOverview();
    expect(overview.walletBalanceByCurrency).toMatchObject({ USD: 100, BDT: 11000 });
  });

  it('keeps the deprecated mixed-currency walletBalanceTotal for backward compatibility', async () => {
    const service = new AnalyticsService(makeFakePrisma({ bookings, hotelBookings, wallets }), makeFxFake() as any);
    const overview = await service.getOverview();
    expect(overview.walletBalanceTotal).toBe(11100);
  });

  it('excludes non-settled bookings from grossRevenueByCurrency', async () => {
    const service = new AnalyticsService(makeFakePrisma({ bookings, hotelBookings, wallets }), makeFxFake() as any);
    const overview = await service.getOverview();
    expect(overview.grossRevenueByCurrency).toMatchObject({ USD: 500, BDT: 11000, EUR: 50 });
  });

  it('grossRevenueConvertedTotal and walletBalanceConvertedTotal are both null when FX is not configured', async () => {
    const service = new AnalyticsService(makeFakePrisma({ bookings, hotelBookings, wallets }), makeFxFake({ configured: false }) as any);
    const overview = await service.getOverview();
    expect(overview.grossRevenueConvertedTotal).toBe(null);
    expect(overview.walletBalanceConvertedTotal).toBe(null);
  });

  it('converts and sums wallet balances into the base currency when FX is configured', async () => {
    const service = new AnalyticsService(makeFakePrisma({ bookings, hotelBookings, wallets }), makeFxFake({ configured: true }) as any);
    const overview = await service.getOverview();
    // 100 USD + (11000 BDT / 110) = 100 + 100 = 200 USD.
    expect(overview.walletBalanceConvertedTotal).toMatchObject({ baseCurrency: 'USD', amount: 200, unconvertedCurrencies: [] });
  });

  it('converts what it can and lists the rest in unconvertedCurrencies, for a currency with no configured rate', async () => {
    const service = new AnalyticsService(makeFakePrisma({ bookings, hotelBookings, wallets }), makeFxFake({ configured: true }) as any);
    const overview = await service.getOverview();
    // 500 USD + (11000 BDT / 110 = 100 USD) = 600 USD, EUR skipped (no rate).
    expect(overview.grossRevenueConvertedTotal).toMatchObject({ baseCurrency: 'USD', amount: 600, unconvertedCurrencies: ['EUR'] });
  });
});
