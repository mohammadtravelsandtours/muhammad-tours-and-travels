import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Validates the access token and populates req.user via JwtStrategy. */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
