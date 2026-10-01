# Kariakoo Backend

Multi-tenant business operations API built on PostgreSQL row-level security,
role-based permissions, inventory ledgers, sales, and purchasing workflows.

## How a request flows

1. **Login** (`POST /auth/login`) — the one endpoint that runs before we
   know the caller's tenant. Looks the user up by email across all tenants,
  rejects ambiguous cross-tenant email matches, verifies the password, and
  issues a JWT containing `tenantId`, `sub` (user id), and `roleCode`.

2. **TenantMiddleware** — runs on every other route. Decodes the JWT and
   stores `{ tenantId, userId, roleCode }` in an `AsyncLocalStorage`
   (`tenantContext`), so any service downstream can read it without it
   being passed through every function call.

3. **PermissionsGuard** — for routes annotated with `@RequirePermissions(...)`,
   checks the caller's role actually has that permission (via the
   `roles` / `permissions` / `role_permissions` tables from the schema
   migration).

4. **TenantAwareDbService** — the only place that talks to Postgres directly.
   Every query runs inside a transaction that does
   `SET LOCAL app.current_tenant_id = '<tenant-uuid>'` before anything else,
   so the Row-Level Security policies from the migration silently scope
   every query to the caller's tenant. Application code never needs to
   remember to add `WHERE tenant_id = ...` — the database enforces it.

Sales reports use the same tenant-scoped path. `GET /sales/summary?days=30`
requires `reports:view` and accepts 7, 30, or 90 days (default 7). It returns
completed-sale revenue, counts, daily totals, payment-method totals, voided
counts, and a matching prior-period comparison. Business-day boundaries use
`Africa/Dar_es_Salaam`; dashboard totals are aggregated from the full period,
not the 100-row recent-sales list.

## Setup

```powershell
npm ci
Copy-Item .env.example .env
# Edit .env with the credentials for your local PostgreSQL installation.
createdb kariakoo
npm run migrate
npm run seed
npm run start:dev
```

Set `JWT_SECRET` to a unique random value of at least 32 characters. Generate
one in PowerShell with:

```powershell
[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
```

URL-encode reserved characters in the PostgreSQL password used by
the database URLs. Use `DATABASE_URL` for a role without `BYPASSRLS`,
`MIGRATION_DATABASE_URL` for the schema owner used only by migrations, and
`PLATFORM_DATABASE_URL` for a separate `BYPASSRLS` role with read-only access
to `users`, `roles`, `permissions`, and `role_permissions`. The app checks the
RLS attributes of both runtime roles on startup. Never give the platform role
write access to tenant tables. The `.env` file is ignored by Git. The seeded
`password123` account is for local development only; do not use it in a
deployed environment.

Create separate login roles as a PostgreSQL administrator before configuring
the URLs. Set each role's password interactively with `\\password <role>` in
`psql`, rather than embedding it in SQL history:

```sql
CREATE ROLE kariakoo_app LOGIN NOBYPASSRLS;
CREATE ROLE kariakoo_migrator LOGIN NOBYPASSRLS;
CREATE ROLE kariakoo_platform_auth LOGIN BYPASSRLS;
GRANT CONNECT ON DATABASE kariakoo TO kariakoo_app, kariakoo_migrator, kariakoo_platform_auth;
GRANT CREATE ON DATABASE kariakoo TO kariakoo_migrator;
GRANT CREATE ON SCHEMA public TO kariakoo_migrator;
```

After running migrations, grant `kariakoo_app` DML only on tenant-owned
tables, plus sequence access. Grant `kariakoo_platform_auth` `SELECT` only on
`users`, `roles`, `permissions`, and `role_permissions`. The migration owner
and demo seed use `MIGRATION_DATABASE_URL`; the API never uses that connection.

```sql
GRANT USAGE ON SCHEMA public TO kariakoo_app, kariakoo_platform_auth;
DO $$
DECLARE tenant_table RECORD;
BEGIN
  FOR tenant_table IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind IN ('r', 'p')
       AND EXISTS (
         SELECT 1 FROM pg_attribute a
          WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped
       )
  LOOP
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO kariakoo_app',
      tenant_table.relname
    );
  END LOOP;
END $$;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO kariakoo_app;
GRANT SELECT ON users, roles, permissions, role_permissions TO kariakoo_platform_auth;
```
The API listens on port 3005 by default so it can run beside the frontend on
port 3000. Set `CORS_ORIGINS` to a comma-separated list of trusted frontend
origins when deploying; do not use a wildcard with credentials enabled.

Then log in:

```powershell
curl.exe -X POST http://localhost:3005/auth/login `
  -H "Content-Type: application/json" `
  -d '{"email":"seed-owner@example.com","password":"password123"}'
```

That returns an `accessToken` — use it as `Authorization: Bearer <token>`
to call `GET /products`, `GET /sales`, and `GET /sales/summary?days=30`.
The summary route requires the role's `reports:view` permission.

There's no signup flow yet — `npm run seed` is a stand-in until that's built.

## What's deliberately NOT here yet

- Signup / tenant onboarding flow (`npm run seed` is a stand-in)
- Refresh tokens and session revocation (access tokens currently expire after 8h)
- Rate limiting on `/auth/login`
- Tenant onboarding and user-management endpoints

## Files

```
src/
  main.ts                   App bootstrap
  app.module.ts             Wires middleware, controllers, guards together
  health.controller.ts      GET /health — public, no auth required
  auth/                     Login endpoint, JWT issuing
  common/
    tenant/                 AsyncLocalStorage context + middleware
    auth/                   Permission decorator + guard
  database/                 Tenant-aware Postgres wrapper (the RLS binding)
  inventory/                Example controller showing the full chain
migrations/
  001-005                         Tenant foundation and domain schemas
scripts/
  migrate.ts                Applies numbered SQL migrations once, in order
  seed.ts                   Creates a local demo tenant + owner login
```
