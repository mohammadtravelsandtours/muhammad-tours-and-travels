import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { createHash } from 'crypto';
import { RedisService } from '../../redis/redis.service';

const WINDOW_SECONDS = 15 * 60;
const MAX_ATTEMPTS = 8;

/**
 * A 6-digit TOTP code is only ~1 million possibilities — LoginThrottleGuard
 * doesn't cover this route (it's keyed on req.body.email, which
 * /auth/2fa/verify never receives), so without a guard here the 5-minute
 * challenge window would be brute-forceable well within its lifetime.
 * Keyed on IP + the challenge token itself (hashed, never logged in the
 * clear) rather than email, since this endpoint never sees one.
 */
@Injectable()
export class TwoFactorThrottleGuard implements CanActivate {
  constructor(private readonly redis: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const token = String(req.body?.twoFactorToken ?? 'unknown');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const key = `2fa-attempts:${req.ip}:${tokenHash}`;

    const attempts = await this.redis.incrementWithExpiry(key, WINDOW_SECONDS);
    if (attempts > MAX_ATTEMPTS) {
      throw new HttpException('Too many attempts. Please sign in again.', HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}
