import { AsyncLocalStorage } from 'async_hooks';

/**
 * Holds the current request's tenant + user context for the lifetime of
 * that request, without needing to thread it through every function call.
 *
 * Set once per request (see TenantMiddleware), read anywhere downstream
 * (services, the tenant-aware DB wrapper, audit logging, etc.).
 */
export interface RequestContext {
  tenantId: string;
  userId: string;
  roleCode: string;
}

class TenantContextStore {
  private readonly storage = new AsyncLocalStorage<RequestContext>();

  run<T>(context: RequestContext, callback: () => T): T {
    return this.storage.run(context, callback);
  }

  get(): RequestContext {
    const ctx = this.storage.getStore();
    if (!ctx) {
      // Fail loud. A query running with no tenant context is a bug that
      // must never silently fall through to "see everything" or "see nothing"
      // without anyone noticing.
      throw new Error(
        'No tenant context set. This code path is running outside of an ' +
          'authenticated request — check that TenantMiddleware ran first.',
      );
    }
    return ctx;
  }

  /** Use only in code paths that are legitimately tenant-less (e.g. platform admin jobs). */
  getOptional(): RequestContext | undefined {
    return this.storage.getStore();
  }
}

export const tenantContext = new TenantContextStore();
