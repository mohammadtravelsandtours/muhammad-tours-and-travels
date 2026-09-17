import * as Joi from 'joi';

/**
 * Fail fast on boot if required configuration is missing or malformed —
 * a travel booking API should never start in a half-configured state
 * and discover that at the first real request.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'staging', 'production', 'test').default('development'),

  DATABASE_URL: Joi.string().uri().required(),
  REDIS_URL: Joi.string().uri().required(),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_TTL: Joi.string().default('15m'),
  JWT_REFRESH_TTL: Joi.string().default('30d'),

  API_PORT: Joi.number().port().default(4000),
  API_CORS_ORIGINS: Joi.string().default(''),
  // Used only to build the link in the (mock/logged) password-reset email.
  WEB_APP_URL: Joi.string().uri().optional(),

  // All optional — each integration below degrades to a clearly-labeled
  // "not configured" response rather than failing boot when unset. None
  // of these are required for the mock-first platform to run.
  ANTHROPIC_API_KEY: Joi.string().optional(),
  ANTHROPIC_MODEL: Joi.string().optional(),
  AI_MAX_TOKENS: Joi.number().integer().min(100).max(4000).optional(),
  AI_MAX_TOOL_ITERATIONS: Joi.number().integer().min(1).max(10).optional(),
  GOOGLE_SHEETS_SPREADSHEET_ID: Joi.string().optional(),
  GOOGLE_SHEETS_CLIENT_EMAIL: Joi.string().optional(),
  GOOGLE_SHEETS_PRIVATE_KEY: Joi.string().optional(),

  // Phase 9 — real (non-mock) integrations, both optional and both
  // inert unless explicitly enabled (AMADEUS_* set; STRIPE_SECRET_KEY
  // set AND PAYMENT_PROVIDER_STRATEGY=STRIPE) — see configuration.ts.
  AMADEUS_API_KEY: Joi.string().optional(),
  AMADEUS_API_SECRET: Joi.string().optional(),
  AMADEUS_BASE_URL: Joi.string().uri().optional(),
  STRIPE_SECRET_KEY: Joi.string().optional(),
  PAYMENT_PROVIDER_STRATEGY: Joi.string().valid('MANUAL', 'STRIPE').optional(),

  // Hajj/Umrah phase — WhatsApp (Meta Cloud API) notifications, optional
  // and inert unless WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID are
  // both set AND WHATSAPP_PROVIDER_STRATEGY=META — see configuration.ts.
  WHATSAPP_ACCESS_TOKEN: Joi.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: Joi.string().optional(),
  WHATSAPP_PROVIDER_STRATEGY: Joi.string().valid('MOCK', 'META').optional(),

  // Multi-currency / FX conversion — all optional, and FX conversion
  // stays OFF (this platform's original behavior) unless FX_RATES_JSON
  // and/or FX_PROVIDER_API_URL is set. See configuration.ts's parseFxConfig.
  FX_BASE_CURRENCY: Joi.string().length(3).optional(),
  FX_RATES_JSON: Joi.string().optional(),
  FX_PROVIDER_API_URL: Joi.string().uri().optional(),
  FX_PROVIDER_API_KEY: Joi.string().optional(),

  // Phase 9 — rate limiting (wired via @nestjs/throttler in app.module.ts).
  RATE_LIMIT_TTL_SECONDS: Joi.number().positive().optional(),
  RATE_LIMIT_MAX_REQUESTS: Joi.number().positive().optional(),
});
