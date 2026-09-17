import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

/**
 * Liveness/readiness probe for orchestration + the deployment pipeline's
 * "does the new revision actually work" check before traffic shifts to
 * it. Deliberately unauthenticated — health checks shouldn't require a
 * credential to answer "is this instance up." Also exempt from the
 * global rate limiter (see app.module.ts) — an orchestrator polling this
 * every few seconds from a shared node IP must never itself trip
 * "too many requests."
 */
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  async check() {
    const [dbOk, redisOk] = await Promise.all([this.checkDatabase(), this.checkRedis()]);

    const healthy = dbOk && redisOk;
    const payload = {
      status: healthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      dependencies: {
        database: dbOk ? 'up' : 'down',
        redis: redisOk ? 'up' : 'down',
      },
    };

    if (!healthy) {
      throw new ServiceUnavailableException(payload);
    }

    return payload;
  }

  private async checkDatabase(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  private async checkRedis(): Promise<boolean> {
    try {
      const pong = await this.redis.client.ping();
      return pong === 'PONG';
    } catch {
      return false;
    }
  }
}
