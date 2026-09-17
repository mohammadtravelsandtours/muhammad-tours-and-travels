#!/usr/bin/env node
import fs from 'node:fs';

const required = [
  'PUBLIC_DOMAIN',
  'B2B_DOMAIN',
  'CORPORATE_DOMAIN',
  'ADMIN_DOMAIN',
  'API_DOMAIN',
  'PUBLIC_API_URL',
  'POSTGRES_USER',
  'POSTGRES_PASSWORD',
  'POSTGRES_DB',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
];

const file = process.argv[2] ?? '.env.production';
if (!fs.existsSync(file)) {
  console.error(`Missing ${file}. Copy .env.production.example to ${file} and fill every production secret.`);
  process.exit(1);
}

const values = {};
for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith('#')) continue;
  const i = line.indexOf('=');
  if (i > 0) values[line.slice(0, i)] = line.slice(i + 1);
}

const errors = [];
for (const key of required) {
  if (!values[key]) errors.push(`${key} is missing`);
}
for (const key of ['POSTGRES_PASSWORD', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
  if ((values[key] ?? '').includes('CHANGE_THIS')) errors.push(`${key} still contains a placeholder`);
}
if (values.JWT_ACCESS_SECRET && values.JWT_ACCESS_SECRET.length < 32) errors.push('JWT_ACCESS_SECRET must be at least 32 characters');
if (values.JWT_REFRESH_SECRET && values.JWT_REFRESH_SECRET.length < 32) errors.push('JWT_REFRESH_SECRET must be at least 32 characters');
if (values.JWT_ACCESS_SECRET && values.JWT_ACCESS_SECRET === values.JWT_REFRESH_SECRET) errors.push('JWT access and refresh secrets must be different');
if (values.PUBLIC_API_URL && !values.PUBLIC_API_URL.startsWith('https://')) errors.push('PUBLIC_API_URL must use HTTPS in production');
if (values.NODE_ENV !== 'production') errors.push('NODE_ENV must be production');

// Never allow a production deployment to silently use the project's
// demo payment or demo WhatsApp adapters. If the business chooses an
// offline/manual collection workflow, it must have a real receipt +
// admin-approval implementation before this check is relaxed.
if ((values.PAYMENT_PROVIDER_STRATEGY ?? 'MANUAL') === 'MANUAL') {
  errors.push('PAYMENT_PROVIDER_STRATEGY=MANUAL is a demo provider and is not permitted in production; configure a real payment gateway before accepting live bookings');
}
if ((values.PAYMENT_PROVIDER_STRATEGY ?? '') === 'STRIPE' && !values.STRIPE_SECRET_KEY) {
  errors.push('PAYMENT_PROVIDER_STRATEGY=STRIPE requires STRIPE_SECRET_KEY');
}
if (values.STRIPE_SECRET_KEY && values.STRIPE_SECRET_KEY.startsWith('sk_test_') && values.NODE_ENV === 'production') {
  errors.push('STRIPE_SECRET_KEY is a test-mode key; use a live key only for a real production payment account');
}
if ((values.WHATSAPP_PROVIDER_STRATEGY ?? 'MOCK') === 'META') {
  if (!values.WHATSAPP_ACCESS_TOKEN || !values.WHATSAPP_PHONE_NUMBER_ID) {
    errors.push('WHATSAPP_PROVIDER_STRATEGY=META requires WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID');
  }
}
if (values.AMADEUS_BASE_URL && /test\.api\.amadeus\.com/i.test(values.AMADEUS_BASE_URL)) {
  errors.push('AMADEUS_BASE_URL points to the Amadeus test environment; production deployment requires the production endpoint');
}

if (errors.length) {
  console.error('Production deployment check failed:');
  for (const e of errors) console.error(` - ${e}`);
  process.exit(1);
}

console.log(`Production configuration check passed for ${file}.`);
