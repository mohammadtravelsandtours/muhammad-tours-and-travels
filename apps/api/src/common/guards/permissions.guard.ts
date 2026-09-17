import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AuthenticatedUser, Permission } from '@mohammad-travels/types';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

/**
 * Runs after JwtAuthGuard. Reads the permissions the route declared via
 * @RequirePermissions(...) and checks them against the permissions
 * JwtStrategy attached to req.user for *this* request — which
 * AuthService loads fresh from the database on every token validation,
 * not from a cached JWT claim — so a revoked permission takes effect
 * immediately rather than at next token refresh (docs/SECURITY.md).
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Not authenticated');
    }

    const hasAll = required.every((permission) => user.permissions.includes(permission));
    if (!hasAll) {
      throw new ForbiddenException(`Missing required permission(s): ${required.join(', ')}`);
    }

    return true;
  }
}
