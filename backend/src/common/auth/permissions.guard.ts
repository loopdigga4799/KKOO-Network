import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from './permissions.decorator';
import { tenantContext } from '../tenant/tenant-context';
import { TenantAwareDbService } from '../../database/tenant-aware-db.service';

/**
 * Runs after TenantMiddleware (so tenantContext is populated) and after
 * JwtAuthGuard (so we know the user's role). Checks the required
 * permission codes against role_permissions.
 *
 * Note: roles/permissions are global tables (not tenant-scoped), so this
 * lookup is intentionally done via queryAsPlatformAdmin — there's no
 * tenant data being read here, just the shared role definitions.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly db: TenantAwareDbService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) {
      return true; // route has no explicit permission requirement
    }

    const { roleCode } = tenantContext.get();

    const result = await this.db.queryAsPlatformAdmin<{ code: string }>(
      `SELECT p.code
         FROM permissions p
         JOIN role_permissions rp ON rp.permission_id = p.id
         JOIN roles r ON r.id = rp.role_id
        WHERE r.code = $1`,
      [roleCode],
    );

    const grantedCodes = new Set(result.rows.map((r) => r.code));
    const hasAll = required.every((code) => grantedCodes.has(code));

    if (!hasAll) {
      throw new ForbiddenException(
        `Missing required permission(s): ${required.filter((c) => !grantedCodes.has(c)).join(', ')}`,
      );
    }

    return true;
  }
}
