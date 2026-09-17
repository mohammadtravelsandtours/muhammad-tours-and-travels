import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

export interface AirportSearchResult {
  iataCode: string;
  name: string;
  city: string;
  country: string;
  timezone: string;
}

const CACHE_TTL_SECONDS = 300; // reference data changes rarely; 5 min is generous headroom
const CACHE_PREFIX = 'airports:search:';
const MAX_RESULTS = 10;
const FETCH_LIMIT = 30; // over-fetch so client-side ranking has something to sort

@Injectable()
export class AirportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Autocomplete search for the flight-search origin/destination fields.
   * Ranks an exact/prefix IATA-code match above a city/name/country
   * substring match, since a traveler typing "DAC" almost always means
   * the airport code, not a coincidental substring elsewhere.
   */
  async search(rawQuery: string): Promise<AirportSearchResult[]> {
    const query = rawQuery.trim();
    if (!query) return [];

    const cacheKey = CACHE_PREFIX + query.toLowerCase();
    const cached = await this.getCached(cacheKey);
    if (cached) return cached;

    const upper = query.toUpperCase();
    const rows = await this.prisma.airport.findMany({
      where: {
        OR: [
          { iataCode: { startsWith: upper } },
          { city: { contains: query, mode: 'insensitive' } },
          { name: { contains: query, mode: 'insensitive' } },
          { country: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: FETCH_LIMIT,
      select: { iataCode: true, name: true, city: true, country: true, timezone: true },
    });

    const ranked = rows
      .map((row) => ({ row, score: this.rank(row, query, upper) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RESULTS)
      .map((r) => r.row);

    await this.setCached(cacheKey, ranked);
    return ranked;
  }

  private rank(row: AirportSearchResult, query: string, upper: string): number {
    if (row.iataCode === upper) return 100;
    if (row.iataCode.startsWith(upper)) return 80;
    const lowerQuery = query.toLowerCase();
    if (row.city.toLowerCase().startsWith(lowerQuery)) return 60;
    if (row.name.toLowerCase().startsWith(lowerQuery)) return 40;
    if (row.city.toLowerCase().includes(lowerQuery)) return 30;
    if (row.name.toLowerCase().includes(lowerQuery)) return 20;
    return 10;
  }

  private async getCached(key: string): Promise<AirportSearchResult[] | null> {
    try {
      const raw = await this.redis.client.get(key);
      return raw ? (JSON.parse(raw) as AirportSearchResult[]) : null;
    } catch {
      // Cache is a performance optimization, not a correctness dependency —
      // a Redis hiccup should fall through to the database, not fail the request.
      return null;
    }
  }

  private async setCached(key: string, value: AirportSearchResult[]): Promise<void> {
    try {
      await this.redis.client.set(key, JSON.stringify(value), 'EX', CACHE_TTL_SECONDS);
    } catch {
      // Best-effort — see getCached.
    }
  }
}
