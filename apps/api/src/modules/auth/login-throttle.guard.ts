import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { RedisService } from '../../redis/redis.service';

const WINDOW_SECONDS = 15 * 60;
const MAX_ATTEMPTS = 10;

/**
 * Per-IP+email fixed-window counter, incremented on every login attempt
 * (success or failure) and checked before AuthService touches the
 * database or argon2. This is deliberately a soft, time-boxed limit —
 * "exponential lockout, not a hard permanent lock" per docs/SECURITY.md —
 * so it can't be used to lock a real user out indefinitely by an
 * attacker who just knows their email.
 */
@Injectable()
export class LoginThrottleGuard implements CanActivate {
  constructor(private readonly redis: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const email = (req.body?.email ?? 'unknown').toLowerCase();
    const key = `login-attempts:${req.ip}:${email}`;

    const attempts = await this.redis.incrementWithExpiry(key, WINDOW_SECONDS);

    if (attempts > MAX_ATTEMPTS) {
      throw new HttpException(
        'Too many login attempts. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
