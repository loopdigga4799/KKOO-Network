-- ============================================================================
-- KARIAKOO SAAS PLATFORM — SALES
-- Migration 004: Sales and sale line items
-- ============================================================================
--
-- Sales are never hard-deleted or edited after the fact — a mistake or
-- return is handled by voiding the sale (status change + a matching
-- reversal in stock_movements), preserving the full history. This mirrors
-- the audit-trail rule already decided for the whole platform.
-- ============================================================================

CREATE TABLE sales (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id       UUID NOT NULL REFERENCES branches(id),
    customer_id     UUID REFERENCES customers(id),  -- null = walk-in/cash customer
    sold_by         UUID NOT NULL REFERENCES users(id),
    status          VARCHAR(20) NOT NULL DEFAULT 'completed',
                    -- 'completed' | 'voided'
    payment_method  VARCHAR(20) NOT NULL,
                    -- 'cash' | 'mobile_money' | 'credit' | 'card'
    subtotal        NUMERIC(14, 2) NOT NULL,
    total           NUMERIC(14, 2) NOT NULL,
    amount_paid     NUMERIC(14, 2) NOT NULL DEFAULT 0,
                    -- for 'credit' sales this may be less than total;
                    -- the shortfall is added to customers.credit_balance
    voided_at       TIMESTAMPTZ,
    voided_by       UUID REFERENCES users(id),
    void_reason     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sales_tenant_id ON sales(tenant_id);
CREATE INDEX idx_sales_tenant_branch ON sales(tenant_id, branch_id);
CREATE INDEX idx_sales_tenant_customer ON sales(tenant_id, customer_id);
CREATE INDEX idx_sales_tenant_created ON sales(tenant_id, created_at);

ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_sales ON sales
    USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);


CREATE TABLE sale_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    sale_id         UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    product_id      UUID NOT NULL REFERENCES products(id),
    quantity        NUMERIC(14, 3) NOT NULL,
    unit_price      NUMERIC(14, 2) NOT NULL,  -- price AT TIME OF SALE — never
                                                -- look this up from products
                                                -- later, prices change
    line_total      NUMERIC(14, 2) NOT NULL
);

CREATE INDEX idx_sale_items_tenant_id ON sale_items(tenant_id);
CREATE INDEX idx_sale_items_sale ON sale_items(tenant_id, sale_id);

ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_sale_items ON sale_items
    USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);