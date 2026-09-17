import { randomBytes } from 'crypto';

// No 0/O/1/I — avoids lookalike confusion when a customer reads this
// back over the phone or types it into a support form.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** A short, human-typeable reference code (e.g. a booking reference) — not a security token, just collision-resistant enough for a unique DB column. */
export function generateReferenceCode(prefix: string, length = 6): string {
  const bytes = randomBytes(length);
  let out = prefix;
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}
