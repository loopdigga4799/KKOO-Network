-- ============================================================================
-- KARIAKOO SAAS PLATFORM — MULTI-TENANT FOUNDATION
-- Migration 001: Tenant isolation architecture (RLS-based)
-- ============================================================================
--
-- STRATEGY: Shared database, shared schema, row-level isolation.
--
-- Every tenant-owned table carries a `tenant_id` column. PostgreSQL Row-Level
-- Security (RLS) policies enforce — at the database layer — that a given
-- connection can only read/write rows belonging to its current tenant.
-- This means even a buggy query, a missing WHERE clause, or a compromised
-- app-layer check CANNOT leak data across tenants. The database itself is
-- the last line of defense.
--
-- HOW TENANT CONTEXT IS SET:
-- On every request, the application sets a session-local variable
-- identifying the current tenant BEFORE running any query:
--
--   SET LOCAL app.current_tenant_id = '<tenant-uuid>';
--
-- This is typically done inside a transaction, in NestJS via a middleware
-- or interceptor that wraps each request. RLS policies read this variable
-- to decide which rows are visible.
--
-- WHY "shared schema" over "schema-per-tenant" or "database-per-tenant":
-- - Migrations run ONCE, not once per tenant (critical at 10,000+ tenants)
-- - Connection pooling stays simple (no per-tenant connection routing)
-- - Cross-tenant analytics/admin tooling stays trivial
-- - Backup/restore is a single operation
-- Trade-off: requires discipline — every tenant table MUST have RLS enabled,
-- no exceptions. A migration checklist enforces this (see bottom of file).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- EXTENSIONS
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- for gen_random_uuid()


-- ----------------------------------------------------------------------------
-- TENANTS TABLE
-- This is the one table that is NOT tenant-scoped itself — it's the root.
-- Every other tenant-owned table has a foreign key back here.
-- ----------------------------------------------------------------------------
CREATE TABLE tenants (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_name       VARCHAR(255) NOT NULL,
    business_type       VARCHAR(100),        -- e.g. 'clothing', 'electronics', 'pharmacy'
    subscription_plan   VARCHAR(50) NOT NULL DEFAULT 'starter',
                        -- 'starter' | 'business' | 'professional' | 'enterprise'
                        -- (entitlements resolved via plan_features table, not hard-coded here)
    subscription_status VARCHAR(50) NOT NULL DEFAULT 'trial',
                        -- 'trial' | 'active' | 'past_due' | 'suspended' | 'cancelled'
    trial_ends_at       TIMESTAMPTZ,
    country             VARCHAR(2) NOT NULL DEFAULT 'TZ',
    default_currency    VARCHAR(3) NOT NULL DEFAULT 'TZS',
    timezone            VARCHAR(64) NOT NULL DEFAULT 'Africa/Dar_es_Salaam',
    is_active           BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE tenants IS 'Root tenant record. Not itself RLS-scoped — access controlled at the application/admin layer.';


-- ----------------------------------------------------------------------------
-- ROLES (system-defined, shared across all tenants — not tenant-owned data)
-- Keeping this global (not per-tenant) means role permissions are consistent
-- and centrally maintainable. Tenants assign these roles to their users.
-- ----------------------------------------------------------------------------
CREATE TABLE roles (
    id          SMALLSERIAL PRIMARY KEY,
    code        VARCHAR(50) UNIQUE NOT NULL,
    label       VARCHAR(100) NOT NULL,
    description TEXT
);

INSERT INTO roles (code, label, description) VALUES
    ('owner',            'Business Owner',      'Full access to all modules, billing, and settings'),
    ('administrator',    'Administrator',       'Full operational access, no billing access'),
    ('manager',          'Manager',             'Branch-level management: reports, staff, inventory oversight'),
    ('accountant',       'Accountant',          'Financial records, expenses, reports — no POS operation'),
    ('warehouse_manager','Warehouse Manager',   'Inventory, stock transfers, purchasing across warehouses'),
    ('storekeeper',      'Storekeeper',         'Single-branch inventory management'),
    ('salesperson',      'Salesperson',         'Sales, customer records, no financial reports'),
    ('cashier',          'Cashier',             'POS operation only');


-- ----------------------------------------------------------------------------
-- PERMISSIONS (fine-grained, resource:action pattern)
-- Roles map to permissions via role_permissions. This lets you adjust what
-- a "Manager" can do without touching code — and supports future custom
-- roles per tenant if that's ever needed.
-- ----------------------------------------------------------------------------
CREATE TABLE permissions (
    id          SERIAL PRIMARY KEY,
    code        VARCHAR(100) UNIQUE NOT NULL,  -- e.g. 'pos:operate', 'inventory:adjust', 'reports:financial'
    description TEXT
);

CREATE TABLE role_permissions (
    role_id       SMALLINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);


-- ----------------------------------------------------------------------------
-- USERS (tenant-owned — this is the first RLS-protected table)
-- ----------------------------------------------------------------------------
CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email         VARCHAR(255) NOT NULL,
    phone         VARCHAR(20),
    password_hash TEXT NOT NULL,
    full_name     VARCHAR(255) NOT NULL,
    role_id       SMALLINT NOT NULL REFERENCES roles(id),
    is_active     BOOLEAN NOT NULL DEFAULT true,
    last_login_at TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Email must be unique PER TENANT, not globally — two different
    -- businesses can both have an owner at the same email address.
    CONSTRAINT uq_users_tenant_email UNIQUE (tenant_id, email)
);

CREATE INDEX idx_users_tenant_id ON users(tenant_id);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY; -- applies RLS even to the table owner role

CREATE POLICY tenant_isolation_users ON users
    USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);


-- ----------------------------------------------------------------------------
-- BRANCHES / WAREHOUSES (tenant-owned)
-- A tenant can have multiple physical locations, each acting as both a
-- sales point and/or a stock-holding warehouse.
-- ----------------------------------------------------------------------------
CREATE TABLE branches (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name         VARCHAR(255) NOT NULL,
    branch_type  VARCHAR(20) NOT NULL DEFAULT 'both',
                 -- 'retail' | 'warehouse' | 'both'
    address      TEXT,
    phone        VARCHAR(20),
    is_active    BOOLEAN NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_branches_tenant_id ON branches(tenant_id);

ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_branches ON branches
    USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);


-- ----------------------------------------------------------------------------
-- USER <-> BRANCH ASSIGNMENT
-- Staff (cashiers, storekeepers) are often scoped to a single branch;
-- owners/managers may have access to all branches (handled at app layer
-- by checking role, absence of a row here can mean "all branches").
-- ----------------------------------------------------------------------------
CREATE TABLE user_branches (
    tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    branch_id  UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, branch_id)
);

ALTER TABLE user_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_branches FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_user_branches ON user_branches
    USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);


-- ----------------------------------------------------------------------------
-- AUDIT LOG (tenant-owned, append-only)
-- Since financial records are never hard-deleted, and every state change
-- needs a trail, this table captures who did what, when, to which record.
-- Populate via application-layer hooks (not triggers) so business context
-- (e.g. "voided due to customer return") can be attached.
-- ----------------------------------------------------------------------------
CREATE TABLE audit_logs (
    id           BIGSERIAL PRIMARY KEY,
    tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id      UUID REFERENCES users(id),
    action       VARCHAR(100) NOT NULL,   -- e.g. 'sale.voided', 'inventory.adjusted'
    entity_type  VARCHAR(100) NOT NULL,   -- e.g. 'sale', 'product', 'expense'
    entity_id    UUID,
    metadata     JSONB,                    -- before/after values, reason, etc.
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_tenant_id ON audit_logs(tenant_id);
CREATE INDEX idx_audit_logs_entity ON audit_logs(tenant_id, entity_type, entity_id);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_audit_logs ON audit_logs
    USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);


-- ============================================================================
-- MIGRATION CHECKLIST — apply to EVERY future tenant-owned table:
--
--   [ ] tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE
--   [ ] CREATE INDEX idx_<table>_tenant_id ON <table>(tenant_id);
--   [ ] ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
--   [ ] ALTER TABLE <table> FORCE ROW LEVEL SECURITY;
--   [ ] CREATE POLICY tenant_isolation_<table> ON <table>
--         USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
--
-- Consider a code-review lint or a CI check that fails if a new migration
-- adds a table without a matching RLS policy — this is the single easiest
-- thing to forget and the most damaging thing to forget.
-- ============================================================================
