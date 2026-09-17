import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthenticatedUser } from '@mohammad-travels/types';
import { PrismaService } from '../../../prisma/prisma.service';

interface AccessTokenPayload {
  sub: string;
}

/**
 * Validates the access token signature/expiry, then loads the user's
 * CURRENT roles/permissions from the database — not from the token
 * payload — on every request. Slightly more DB load than trusting the
 * JWT claims; the payoff is that revoking a role takes effect on the
 * very next request instead of waiting for token expiry.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.accessSecret') as string,
    });
  }

  async validate(payload: AccessTokenPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub, deletedAt: null },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: { include: { permission: true } },
              },
            },
          },
        },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    const roles = user.roles.map((userRole) => userRole.role.name);
    const permissions = Array.from(
      new Set(
        user.roles.flatMap((userRole) => userRole.role.permissions.map((rp) => rp.permission.name)),
      ),
    );

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      roles,
      permissions,
    };
  }
}
