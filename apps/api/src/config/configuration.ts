export interface AppConfig {
  nodeEnv: string;
  port: number;
  corsOrigins: string[];
  databaseUrl: string;
  redisUrl: string;
  /** Base URL of the public web app — used only to build a clickable link in the (mock/logged) password-reset email. Defaults to the local dev server. */
  webAppUrl: string;
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessTtl: string;
    refreshTtl: string;
  };
  /** Optional integrations — each is undefined unless its env vars are set, and every consumer must treat "unset" as "not configured", never throw. */
  integrations: {
    anthropicApiKey?: string;
    anthropicModel?: string;
    aiMaxTokens?: number;
    aiMaxToolIterations?: number;
    googleSheets?: { spreadsheetId: string; clientEmail: string; privateKey: string };
    /**
     * Amadeus for Developers "Self-Service" APIs (Flight Offers Search/
     * Price/Create Orders) — a real GDS/NDC-adjacent flight supplier.
     * `baseUrl` defaults to Amadeus's test environment; production use
     * requires both real (paid-tier) credentials AND switching this to
     * `https://api.amadeus.com` — never assume test-environment
     * credentials work against production or vice versa.
     */
    amadeus?: { apiKey: string; apiSecret: string; baseUrl: string };
    /**
     * Stripe REST API (called directly via fetch — no `stripe` SDK
     * dependency, since Stripe's HTTP API is stable and well-documented
     * enough that a raw client is a legitimate, dependency-free choice
     * here rather than a shortcut). Test-mode secret keys start with
     * `sk_test_`; never let a `sk_live_` key be used outside NODE_ENV=production.
     */
    stripe?: { secretKey: string };
    /**
     * Multi-currency support. Undefined by default — every consumer
     * (TravelPolicyService, AnalyticsService, ...) treats "unset" as
     * "no FX conversion", the exact behavior this platform had before
     * FxRatesService existed, so a deployment that never sets these env
     * vars sees no change at all. `rates` is a static table (currency
     * code -> units of that currency per 1 unit of `baseCurrency`;
     * `baseCurrency` itself is always pinned to 1 regardless of what
     * FX_RATES_JSON says). `provider`, when also set, is tried first on
     * every conversion (with an in-memory TTL cache — see
     * FxRatesService) and falls back to the static table on any fetch
     * error, so a transient outage degrades gracefully instead of
     * breaking every cross-currency comparison.
     */
    fx?: { baseCurrency: string; rates: Record<string, number>; provider?: { apiUrl: string; apiKey?: string } };
    /**
     * Meta's WhatsApp Cloud API (Graph API), called directly via fetch —
     * same "no vendor SDK, just fetch against a documented REST API"
     * choice as Stripe/Amadeus above. `phoneNumberId` is the Cloud API
     * phone number id (not the raw phone number itself) that sends the
     * message. NOT EXERCISED AGAINST A LIVE META ACCOUNT in this build
     * (no network access to graph.facebook.com from this environment) —
     * see WhatsAppCloudApiProvider's own doc comment.
     */
    whatsapp?: { accessToken: string; phoneNumberId: string };
  };
  /**
   * Which registered PaymentProvider PAYMENT_PROVIDER resolves to.
   * 'MANUAL' (default) is the mock/demo provider Phase 2 shipped with;
   * 'STRIPE' selects the real gateway IF `integrations.stripe` is also
   * configured — payments.module.ts falls back to MANUAL with a boot
   * warning if STRIPE is requested but not configured, rather than
   * booting into a broken payment path.
   */
  paymentProviderStrategy: 'MANUAL' | 'STRIPE';
  /**
   * Which registered WhatsAppProvider WHATSAPP_PROVIDER resolves to —
   * same dual-gate shape as paymentProviderStrategy above. 'MOCK'
   * (default) just logs; 'META' selects the real WhatsApp Cloud API
   * gateway IF `integrations.whatsapp` is also configured —
   * notifications.module.ts falls back to MOCK with a boot warning
   * otherwise.
   */
  whatsappProviderStrategy: 'MOCK' | 'META';
  rateLimit: {
    /** Window length in seconds. */
    ttl: number;
    /** Max requests per window, per client (IP by default). */
    limit: number;
  };
}

export default (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.API_PORT ?? '4000', 10),
  corsOrigins: (process.env.API_CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  databaseUrl: process.env.DATABASE_URL as string,
  redisUrl: process.env.REDIS_URL as string,
  webAppUrl: process.env.WEB_APP_URL ?? 'http://localhost:3000',
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET as string,
    refreshSecret: process.env.JWT_REFRESH_SECRET as string,
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '30d',
  },
  integrations: {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || undefined,
    anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
    aiMaxTokens: parseInt(process.env.AI_MAX_TOKENS || '800', 10),
    aiMaxToolIterations: parseInt(process.env.AI_MAX_TOOL_ITERATIONS || '4', 10),
    googleSheets:
      process.env.GOOGLE_SHEETS_SPREADSHEET_ID && process.env.GOOGLE_SHEETS_CLIENT_EMAIL && process.env.GOOGLE_SHEETS_PRIVATE_KEY
        ? {
            spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
            clientEmail: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
            // Real private keys are typically stored with literal "\n"
            // sequences in a single-line env var — never a real newline
            // in the .env file itself — so this is the standard un-escape,
            // not a parsing hack specific to this codebase.
            privateKey: process.env.GOOGLE_SHEETS_PRIVATE_KEY.replace(/\\n/g, '\n'),
          }
        : undefined,
    amadeus:
      process.env.AMADEUS_API_KEY && process.env.AMADEUS_API_SECRET
        ? {
            apiKey: process.env.AMADEUS_API_KEY,
            apiSecret: process.env.AMADEUS_API_SECRET,
            baseUrl: process.env.AMADEUS_BASE_URL || 'https://test.api.amadeus.com',
          }
        : undefined,
    stripe: process.env.STRIPE_SECRET_KEY ? { secretKey: process.env.STRIPE_SECRET_KEY } : undefined,
    fx: parseFxConfig(),
    whatsapp:
      process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID
        ? { accessToken: process.env.WHATSAPP_ACCESS_TOKEN, phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID }
        : undefined,
  },
  paymentProviderStrategy: process.env.PAYMENT_PROVIDER_STRATEGY === 'STRIPE' ? 'STRIPE' : 'MANUAL',
  whatsappProviderStrategy: process.env.WHATSAPP_PROVIDER_STRATEGY === 'META' ? 'META' : 'MOCK',
  rateLimit: {
    ttl: parseInt(process.env.RATE_LIMIT_TTL_SECONDS ?? '60', 10),
    limit: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS ?? '120', 10),
  },
});

/**
 * FX_RATES_JSON is only ever hand-edited (there's no admin UI for it, by
 * design — see FxRatesService's own doc comment on why this is a
 * config-driven table rather than a database one), so a malformed value
 * degrades to "FX not configured" with a boot-time warning rather than
 * crashing the whole API on a typo — the same posture every other
 * optional integration in this file takes.
 */
function parseFxConfig(): AppConfig['integrations']['fx'] {
  const baseCurrency = (process.env.FX_BASE_CURRENCY || 'USD').toUpperCase();
  const provider = process.env.FX_PROVIDER_API_URL ? { apiUrl: process.env.FX_PROVIDER_API_URL, apiKey: process.env.FX_PROVIDER_API_KEY || undefined } : undefined;

  if (!process.env.FX_RATES_JSON) {
    // A live provider with no static fallback table is still "configured"
    // (FxRatesService.convert just has nothing to fall back to on a
    // provider outage) — the base currency alone is always a valid
    // one-entry table.
    return provider ? { baseCurrency, rates: { [baseCurrency]: 1 }, provider } : undefined;
  }

  try {
    const parsed = JSON.parse(process.env.FX_RATES_JSON) as Record<string, number>;
    const rates: Record<string, number> = { [baseCurrency]: 1 };
    for (const [code, rate] of Object.entries(parsed)) {
      if (typeof rate === 'number' && rate > 0) rates[code.toUpperCase()] = rate;
    }
    return { baseCurrency, rates, provider };
  } catch {
    // eslint-disable-next-line no-console
    console.warn('FX_RATES_JSON is set but is not valid JSON — FX conversion stays OFF until it is fixed.');
    return provider ? { baseCurrency, rates: { [baseCurrency]: 1 }, provider } : undefined;
  }
}
