/**
 * Deterministic PRNG seeded from a string (xmur3 hash → mulberry32
 * generator — a standard, well-known small-PRNG combination). The same
 * seed always produces the same sequence, so two identical searches
 * against a mock supplier return stable results — useful for demos and
 * for writing assertions in tests — while different routes/dates/
 * suppliers still diverge normally. Not cryptographic; mock data only,
 * never use this for anything security-sensitive.
 */
export function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function next(): number {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

export function randomInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function randomInRange(rng: () => number, [min, max]: [number, number]): number {
  return rng() * (max - min) + min;
}

export function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length) % items.length];
}

const ALPHANUM = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I — avoids lookalike confusion in a fake PNR
export function randomAlphaNumeric(rng: () => number, length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHANUM[Math.floor(rng() * ALPHANUM.length)];
  }
  return out;
}
