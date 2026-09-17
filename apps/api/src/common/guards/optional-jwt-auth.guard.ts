import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Same JWT validation as JwtAuthGuard, but never rejects the request —
 * a missing or invalid token just means "treat this as anonymous", which
 * is correct for an endpoint (flight search) that must work for a
 * visitor who hasn't signed in yet, while still recognizing a logged-in
 * B2B/Corporate/B2C user when a valid token is present.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(_err: unknown, user: unknown) {
    return user ?? undefined;
  }
}
