import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { TenantAwareDbService } from '../database/tenant-aware-db.service';

interface UserRow {
  id: string;
  tenant_id: string;
  password_hash: string;
  role_code: string;
  is_active: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly db: TenantAwareDbService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Login is the one legitimate case of looking a user up BEFORE we know
   * their tenant — we don't have a JWT yet, so there's no tenant context
   * to scope the query to RLS. This uses queryAsPlatformAdmin deliberately.
   *
   * Email is unique per-tenant (not globally), so in principle the same
   * email could exist under two different businesses. For Phase 1, this
   * implementation takes the first active match; if you need to support
   * one person legitimately belonging to multiple tenants, add a
   * business-picker step here rather than guessing which one they meant.
   */
  async login(email: string, password: string) {
    const result = await this.db.queryAsPlatformAdmin<UserRow>(
      `SELECT u.id, u.tenant_id, u.password_hash, u.is_active, r.code AS role_code
         FROM users u
         JOIN roles r ON r.id = u.role_id
        WHERE u.email = $1
        LIMIT 2`, // fetch 2 so we can detect (and log) an ambiguous cross-tenant email
      [email],
    );

    if (result.rows.length === 0) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (result.rows.length > 1) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const user = result.rows[0];

    if (!user.is_active) {
      throw new UnauthorizedException('This account has been deactivated');
    }

    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const accessToken = this.jwtService.sign({
      sub: user.id,
      tenantId: user.tenant_id,
      roleCode: user.role_code,
    });

    return {
      accessToken,
      user: { id: user.id, tenantId: user.tenant_id, roleCode: user.role_code },
    };
  }
}
