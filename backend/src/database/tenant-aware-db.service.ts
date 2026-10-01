import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { tenantContext } from '../common/tenant/tenant-context';

/**
 * This is the ONE place in the codebase that should run raw queries against
 * tenant-owned tables. Every call:
 *   1. Opens a transaction
 *   2. SET LOCAL app.current_tenant_id — scoped to this transaction only,
 *      automatically cleared when it commits/rolls back (no leakage between
 *      pooled connections reused by later requests)
 *   3. Runs your query — RLS policies now silently filter to this tenant
 *   4. Commits
 *
 * If you swap to TypeORM or Prisma later, the pattern stays identical —
 * wrap in a transaction, SET LOCAL first, then use the ORM's query builder
 * inside that same transaction. The RLS policies don't care which client
 * library issued the query.
 */
@Injectable()
export class TenantAwareDbService implements OnModuleInit, OnModuleDestroy {
  private readonly pool: Pool;
  private readonly platformPool: Pool;

  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 20,
    });
    this.platformPool = new Pool({
      connectionString: process.env.PLATFORM_DATABASE_URL,
      max: 5,
    });
  }

  async onModuleInit() {
    const runtimeRole = await this.pool.query<{ bypasses_rls: boolean }>(
      'SELECT rolsuper OR rolbypassrls AS bypasses_rls FROM pg_roles WHERE rolname = current_user',
    );
    if (runtimeRole.rows[0]?.bypasses_rls) {
      throw new Error('DATABASE_URL must use a PostgreSQL role without BYPASSRLS.');
    }

    const platformRole = await this.platformPool.query<{
      rolsuper: boolean;
      rolbypassrls: boolean;
      can_write_tenant_data: boolean;
    }>(
      `SELECT r.rolsuper, r.rolbypassrls,
              EXISTS (
                SELECT 1
                  FROM pg_class c
                  JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE n.nspname = 'public'
                   AND c.relkind IN ('r', 'p')
                   AND EXISTS (
                     SELECT 1 FROM pg_attribute a
                      WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped
                   )
                   AND (has_table_privilege(current_user, c.oid, 'INSERT')
                     OR has_table_privilege(current_user, c.oid, 'UPDATE')
                     OR has_table_privilege(current_user, c.oid, 'DELETE'))
              ) AS can_write_tenant_data
         FROM pg_roles r
        WHERE r.rolname = current_user`,
    );
    const platform = platformRole.rows[0];
    if (!platform?.rolbypassrls || platform.rolsuper || platform.can_write_tenant_data) {
      throw new Error(
        'PLATFORM_DATABASE_URL must use a non-superuser BYPASSRLS role with read-only access to tenant data.',
      );
    }
  }

  /**
   * Run one or more queries within a single tenant-scoped transaction.
   * Pass a callback that receives a client scoped to the current tenant.
   *
   * Example:
   *   const products = await db.withTenant(client =>
   *     client.query('SELECT * FROM products WHERE branch_id = $1', [branchId])
   *   );
   */
  async withTenant<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const { tenantId } = tenantContext.get();
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Parameterized SET LOCAL isn't supported by the driver, so we
      // validate the shape of tenantId strictly before interpolating —
      // it MUST be a UUID that came from a verified JWT, never raw user input.
      if (!isUuid(tenantId)) {
        throw new Error(`Refusing to set invalid tenant_id: ${tenantId}`);
      }
      await client.query(`SET LOCAL app.current_tenant_id = '${tenantId}'`);

      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /** Convenience wrapper for a single query within a tenant-scoped transaction. */
  async query<T extends QueryResultRow = any>(
    text: string,
    params: unknown[] = [],
  ): Promise<QueryResult<T>> {
    return this.withTenant((client) => client.query<T>(text, params));
  }

  /**
   * For platform-admin / cross-tenant jobs ONLY (e.g. billing sweeps,
   * support tooling). Deliberately named loudly so it's easy to grep for
   * and code-review. Never call this from a request handler that serves
   * tenant users.
   */
  async queryAsPlatformAdmin<T extends QueryResultRow = any>(
    text: string,
    params: unknown[] = [],
  ): Promise<QueryResult<T>> {
    return this.platformPool.query<T>(text, params);
  }

  async onModuleDestroy() {
    await Promise.all([this.pool.end(), this.platformPool.end()]);
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
