import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'requiredPermissions';

/**
 * Attach to any controller method to require one or more permission codes.
 *
 * Example:
 *   @RequirePermissions('inventory:adjust')
 *   @Post('inventory/adjust')
 *   adjustStock(...) { ... }
 *
 * Codes match the `permissions.code` column from the 001 migration
 * (e.g. 'pos:operate', 'reports:financial').
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
