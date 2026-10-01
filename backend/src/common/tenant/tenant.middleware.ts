import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request, Response, NextFunction } from 'express';
import { tenantContext } from './tenant-context';

interface JwtPayload {
  sub: string;       // user id
  tenantId: string;
  roleCode: string;
}

/**
 * Runs before every request that requires tenant context. Decodes the JWT,
 * then wraps the rest of the request pipeline in tenantContext.run(), so
 * every downstream service/guard/controller can call tenantContext.get()
 * and reliably know which tenant this request belongs to.
 *
 * This does NOT set the Postgres session variable directly — that happens
 * per-transaction in TenantAwareDbService, closer to the actual query.
 * Keeping those two concerns separate means the middleware doesn't need
 * to know anything about the database layer.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly jwtService: JwtService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      // Public routes (login, health check) are excluded from this
      // middleware entirely in AppModule — see configure() there.
      throw new UnauthorizedException('Missing authentication token');
    }

    const token = authHeader.slice('Bearer '.length);

    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    if (!payload.tenantId || !payload.sub) {
      throw new UnauthorizedException('Token missing required claims');
    }

    tenantContext.run(
      { tenantId: payload.tenantId, userId: payload.sub, roleCode: payload.roleCode },
      () => next(),
    );
  }
}
