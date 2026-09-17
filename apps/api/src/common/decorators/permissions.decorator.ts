import { SetMetadata } from '@nestjs/common';
import { Permission } from '@mohammad-travels/types';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Declares which permission(s) a route requires. Combined with
 * PermissionsGuard, which re-checks current DB state on every request —
 * see docs/SECURITY.md § Authorization for why we don't trust the JWT
 * payload alone for this.
 */
export const RequirePermissions = (...permissions: Permission[]) => SetMetadata(PERMISSIONS_KEY, permissions);
