import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Used for: login rate limiting, search-result caching (Phase 2),
 * and distributed locks around repricing (Phase 2). Kept as one
 * shared client rather than one-per-use-case.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  public readonly client: Redis;

  constructor(private readonly config: ConfigService) {
    this.client = new Redis(this.config.get<string>('redisUrl') as string, {
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    });

    this.client.on('error', (err) => this.logger.error(`Redis error: ${err.message}`));
    this.client.on('connect', () => this.logger.log('Connected to Redis'));
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  /** Fixed-window counter used by the login throttle guard. Returns the count after incrementing. */
  async incrementWithExpiry(key: string, windowSeconds: number): Promise<number> {
    const count = await this.client.incr(key);
    if (count === 1) {
      await this.client.expire(key, windowSeconds);
    }
    return count;
  }
}
