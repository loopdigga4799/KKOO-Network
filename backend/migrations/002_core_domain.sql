-- ============================================================================
-- KARIAKOO SAAS PLATFORM — CORE DOMAIN TABLES
-- Migration 002: Products, Inventory, Customers, Suppliers
-- ============================================================================
--
-- Every table below follows the RLS checklist from migration 001:
-- tenant_id + index + RLS enabled + FORCE + tenant_isolation policy.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- PRODUCT CATEGORIES (tenant-owned, simple flat list for Phase 1 —
-- nested/hierarchical categories can be added later without breaking this)
-- ----------------------------------------------------------------------------
CREATE TABLE product_categories (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_categories_tenant_name UNIQUE (tenant_id, name)
);

CREATE INDEX idx_product_categories_tenant_id ON product_categories(tenant_id);

ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_categories FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_product_categories ON product_categories
    USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);


-- ----------------------------------------------------------------------------
-- PRODUCTS (tenant-owned)
-- One catalog per tenant, shared across all their branches. Stock LEVELS
-- are tracked separately per-branch in inventory_stock below, since the
-- same product exists as different quantities in different warehouses.
-- ----------------------------------------------------------------------------
CREATE TABLE products (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category_id     UUID REFERENCES product_categories(id) ON DELETE SET NULL,
    sku             VARCHAR(100),
    barcode         VARCHAR(100),
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    unit            VARCHAR(50) NOT NULL DEFAULT 'piece',
                    -- 'piece' | 'kg' | 'litre' | 'box' | 'dozen' | 'metre' etc.
    cost_price      NUMERIC(14, 2) NOT NULL DEFAULT 0,
    selling_price   NUMERIC(14, 2) NOT NULL DEFAULT 0,
    reorder_level   INTEGER NOT NULL DEFAULT 0,
                    -- triggers "low stock" flag when total stock across
                    -- branches falls at or below this — used by Phase 2's
                    -- reorder-recommendation feature, present now so the
                    -- schema doesn't need reshaping later
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_products_tenant_sku UNIQUE (tenant_id, sku)
);

CREATE INDEX idx_products_tenant_id ON products(tenant_id);
CREATE INDEX idx_products_tenant_barcode ON products(tenant_id, barcode);
CREATE INDEX idx_products_tenant_active ON products(tenant_id, is_active);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE products FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_products ON products
    USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);


-- ----------------------------------------------------------------------------
-- INVENTORY STOCK (tenant-owned) — current quantity of each product at
-- each branch. This is the "live balance"; stock_movements below is the
-- append-only ledger of every change that produced that balance.
-- ----------------------------------------------------------------------------
CREATE TABLE inventory_stock (
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id    UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    branch_id     UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    quantity      NUMERIC(14, 3) NOT NULL DEFAULT 0,
                  -- NUMERIC not INTEGER: some Kariakoo goods are sold by
                  -- weight/volume (e.g. kg of rice, litres of oil)
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    PRIMARY KEY (product_id, branch_id)
);

CREATE INDEX idx_inventory_stock_tenant_id ON inventory_stock(tenant_id);
CREATE INDEX idx_inventory_stock_branch ON inventory_stock(tenant_id, branch_id);

ALTER TABLE inventory_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_stock FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_inventory_stock ON inventory_stock
    USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);


-- ----------------------------------------------------------------------------
-- STOCK MOVEMENTS (tenant-owned, append-only ledger)
-- Every change to inventory_stock — a sale, a purchase received, a manual
-- adjustment, a transfer between branches — gets a row here FIRST, and
-- inventory_stock.quantity is derived from applying these. Never update
-- or delete a row here; corrections are new offsetting rows, matching the
-- "never hard-delete financial records" rule already decided for the
-- platform. This is what makes "how did stock end up at this number"
-- always answerable.
-- ----------------------------------------------------------------------------
CREATE TABLE stock_movements (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id      UUID NOT NULL REFERENCES products(id),
    branch_id       UUID NOT NULL REFERENCES branches(id),
    movement_type   VARCHAR(30) NOT NULL,
                    -- 'purchase_in' | 'sale_out' | 'transfer_in' | 'transfer_out'
                    -- | 'adjustment' | 'return_in' | 'return_out'
    quantity_delta  NUMERIC(14, 3) NOT NULL, -- positive or negative
    reference_type  VARCHAR(50),   -- e.g. 'sale', 'purchase_order', 'manual'
    reference_id    UUID,          -- FK to the sale/purchase/etc. once those exist
    notes           TEXT,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_stock_movements_tenant_id ON stock_movements(tenant_id);
CREATE INDEX idx_stock_movements_product ON stock_movements(tenant_id, product_id);
CREATE INDEX idx_stock_movements_reference ON stock_movements(tenant_id, reference_type, reference_id);

ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_stock_movements ON stock_movements
    USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);


-- ----------------------------------------------------------------------------
-- CUSTOMERS (tenant-owned) — includes credit tracking, since Kariakoo
-- retailers commonly extend informal credit ("deni") to regular customers.
-- ----------------------------------------------------------------------------
CREATE TABLE customers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    phone           VARCHAR(20),
    email           VARCHAR(255),
    address         TEXT,
    credit_limit    NUMERIC(14, 2) NOT NULL DEFAULT 0,
                    -- 0 means "no credit allowed" — cash/mobile-money only
    credit_balance  NUMERIC(14, 2) NOT NULL DEFAULT 0,
                    -- current amount owed; increases on credit sales,
                    -- decreases on payment. Updated via application logic
                    -- alongside a ledger entry, not edited directly.
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_customers_tenant_id ON customers(tenant_id);
CREATE INDEX idx_customers_tenant_phone ON customers(tenant_id, phone);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_customers ON customers
    USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);


-- ----------------------------------------------------------------------------
-- SUPPLIERS (tenant-owned)
-- ----------------------------------------------------------------------------
CREATE TABLE suppliers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    contact_person  VARCHAR(255),
    phone           VARCHAR(20),
    email           VARCHAR(255),
    address         TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_suppliers_tenant_id ON suppliers(tenant_id);

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_suppliers ON suppliers
    USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
