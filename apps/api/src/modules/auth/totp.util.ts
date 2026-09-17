import { createHmac, randomBytes } from 'crypto';

/**
 * Dependency-free TOTP (RFC 6238, built on RFC 4226 HOTP) for opt-in
 * admin 2FA. There is no network access in this environment to install
 * a package such as `otplib`/`speakeasy`, so this implements the
 * standard algorithm directly against Node's built-in `crypto` module —
 * it interoperates with any standard authenticator app (Google
 * Authenticator, Authy, 1Password, etc.) since it's the same spec they
 * implement, not a custom scheme.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** RFC 4648 base32 — used because otpauth:// secrets are conventionally base32, not because anything here relies on the encoding beyond that convention. */
export function base32Encode(buffer: Buffer): string {
  let bits = '';
  for (const byte of buffer) bits += byte.toString(2).padStart(8, '0');

  let output = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    output += BASE32_ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  }
  const remainder = bits.length % 5;
  if (remainder !== 0) {
    const lastChunk = bits.slice(bits.length - remainder).padEnd(5, '0');
    output += BASE32_ALPHABET[parseInt(lastChunk, 2)];
  }
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const char of clean) {
    const value = BASE32_ALPHABET.indexOf(char);
    if (value === -1) continue;
    bits += value.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

/** A fresh random 160-bit (20-byte) secret, base32-encoded for display/QR entry — the length recommended by RFC 4226 §4. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

interface TotpOptions {
  timeStepSeconds?: number;
  digits?: number;
  timestampMs?: number;
}

function hotp(secret: Buffer, counter: number, digits: number): string {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter), 0);
  const hmac = createHmac('sha1', secret).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const binCode =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (binCode % 10 ** digits).toString().padStart(digits, '0');
}

export function generateTotp(secretBase32: string, options: TotpOptions = {}): string {
  const { timeStepSeconds = 30, digits = 6, timestampMs = Date.now() } = options;
  const counter = Math.floor(timestampMs / 1000 / timeStepSeconds);
  return hotp(base32Decode(secretBase32), counter, digits);
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Accepts the current time step and one step of clock drift on either
 * side (±30s by default) — real authenticator apps and server clocks
 * are rarely perfectly in sync, and a zero-tolerance check would lock
 * out legitimate logins over ordinary clock skew.
 */
export function verifyTotp(secretBase32: string, token: string, options: TotpOptions & { window?: number } = {}): boolean {
  const { window = 1, timeStepSeconds = 30, digits = 6, timestampMs = Date.now() } = options;
  const cleanToken = token.replace(/\s+/g, '');
  if (!/^\d{6,8}$/.test(cleanToken)) return false;

  const secret = base32Decode(secretBase32);
  const counter = Math.floor(timestampMs / 1000 / timeStepSeconds);
  for (let drift = -window; drift <= window; drift++) {
    const candidate = hotp(secret, counter + drift, digits);
    if (timingSafeEqualStr(candidate, cleanToken)) return true;
  }
  return false;
}

/** For display/QR generation by the operator's own authenticator app — this codebase has no QR-image library available, so the setup screen shows this URI as text plus the raw secret for manual entry. */
export function buildOtpAuthUri(secretBase32: string, accountEmail: string, issuer = 'Muhammad Tours and Travels'): string {
  const label = encodeURIComponent(`${issuer}:${accountEmail}`);
  const params = new URLSearchParams({ secret: secretBase32, issuer, algorithm: 'SHA1', digits: '6', period: '30' });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** One-time recovery codes for when the authenticator device is unavailable — each is meant to be stored hashed and consumed once (see AuthService). */
export function generateBackupCodes(count = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = randomBytes(5).toString('hex');
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 10)}`);
  }
  return codes;
}
