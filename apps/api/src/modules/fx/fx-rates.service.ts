import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/configuration';

const LIVE_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour — a live provider is polled at most this often, not on every conversion.

interface LiveRatesSnapshot {
  rates: Record<string, number>;
  fetchedAt: number;
}

/**
 * Opt-in FX conversion, undefined/inert by default — see
 * AppConfig['integrations']['fx']'s own doc comment. Every consumer
 * (TravelPolicyService's cross-currency fare-cap check, AnalyticsService's
 * money aggregation) calls `convert()` and treats a `null` result exactly
 * like "FX not configured": this service is additive, never a
 * requirement, so a deployment that never sets FX_RATES_JSON/
 * FX_PROVIDER_API_URL keeps the platform's original single-currency-only
 * behavior byte-for-byte.
 *
 * Rate convention: `rates[code]` is how many units of `code` equal 1
 * unit of the configured base currency (baseCurrency itself is always
 * pinned to exactly 1 — see parseFxConfig) — the same convention
 * exchangerate-api-shaped providers use, which is also why
 * fetchLiveRates below expects a `{ rates: {...} }` response shape.
 *
 * The live-provider path is NOT EXERCISED against a real FX API in this
 * build (no network access to any such provider from this sandbox — see
 * every other Phase 9 integration's own note on this) — written strictly
 * to the documented shape of exchangerate-api-style providers
 * (https://exchangerate.host, https://exchangerate-api.com, etc.) and
 * this codebase's own contract (fall back to the static table on any
 * error, in-memory-cache successful fetches for LIVE_CACHE_TTL_MS).
 * Treat as real-but-unverified, exactly like StripePaymentProvider.
 */
@Injectable()
export class FxRatesService {
  private readonly logger = new Logger(FxRatesService.name);
  private liveCache: LiveRatesSnapshot | null = null;

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  private get settings() {
    return this.config.get('integrations', { infer: true }).fx;
  }

  isConfigured(): boolean {
    return !!this.settings;
  }

  get baseCurrency(): string | null {
    return this.settings?.baseCurrency ?? null;
  }

  /**
   * Converts `amount` from `from` to `to`. Returns `null` — never
   * throws, never guesses — whenever a real conversion can't be done:
   * FX isn't configured at all, or either currency code is missing from
   * whichever rate table (live or static) ends up in use. Same-currency
   * conversion always succeeds and returns `amount` unchanged, even when
   * FX isn't configured at all — that's not a conversion, just an
   * identity, so it never depends on FX being set up.
   */
  async convert(amount: number, from: string, to: string): Promise<number | null> {
    const fromCode = from.toUpperCase();
    const toCode = to.toUpperCase();
    if (fromCode === toCode) return amount;

    const rates = await this.getRates();
    if (!rates) return null;

    const fromRate = rates[fromCode];
    const toRate = rates[toCode];
    if (fromRate === undefined || toRate === undefined) return null;

    const amountInBaseCurrency = amount / fromRate;
    return round2(amountInBaseCurrency * toRate);
  }

  private async getRates(): Promise<Record<string, number> | null> {
    const settings = this.settings;
    if (!settings) return null;

    if (settings.provider) {
      const live = await this.fetchLiveRates(settings.provider).catch((err: unknown) => {
        this.logger.warn(`Live FX provider fetch failed, falling back to the static FX_RATES_JSON table: ${(err as Error).message}`);
        return null;
      });
      if (live) return live;
    }
    return settings.rates;
  }

  private async fetchLiveRates(provider: { apiUrl: string; apiKey?: string }): Promise<Record<string, number> | null> {
    const now = Date.now();
    if (this.liveCache && now - this.liveCache.fetchedAt < LIVE_CACHE_TTL_MS) {
      return this.liveCache.rates;
    }

    const url = new URL(provider.apiUrl);
    if (provider.apiKey) url.searchParams.set('access_key', provider.apiKey);

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`FX provider returned HTTP ${res.status}`);

    const json = (await res.json()) as { rates?: Record<string, number> };
    if (!json.rates || typeof json.rates !== 'object') {
      throw new Error('FX provider response did not include a "rates" object');
    }

    this.liveCache = { rates: json.rates, fetchedAt: now };
    return json.rates;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
