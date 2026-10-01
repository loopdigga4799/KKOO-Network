-- ============================================================================
-- KARIAKOO SAAS PLATFORM — PURCHASING
-- Migration 005: Purchase orders and line items
-- ============================================================================
--
-- A purchase order is created as 'pending', then marked 'received' once
-- goods actually arrive — that's the moment stock is added, via the same
-- applyMovement ledger function used everywhere else (sales, manual
-- receiving). This keeps "what did we order" separate from "what actually
-- came in", which matters once partial/short deliveries are handled.
-- Cancelling a PO never deletes it — same audit-trail rule as everything else.
-- ============================================================================

CREATE TABLE purchase_orders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    supplier_id     UUID NOT NULL REFERENCES suppliers(id),
    branch_id       UUID NOT NULL REFERENCES branches(id),
    status          VARCHAR(20) NOT NULL DEFAULT 'pending',
    order_date      DATE NOT NULL DEFAULT CURRENT_DATE,
    expected_date   DATE,
    notes           TEXT,
    total_cost      NUMERIC(14, 2) NOT NULL DEFAULT 0,
    created_by      UUID NOT NULL REFERENCES users(id),
    received_at     TIMESTAMPTZ,
    received_by     UUID REFERENCES users(id),
    cancelled_at    TIMESTAMPTZ,
    cancelled_by    UUID REFERENCES users(id),
    cancel_reason   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_purchase_orders_tenant_id ON purchase_orders(tenant_id);
CREATE INDEX idx_purchase_orders_tenant_supplier ON purchase_orders(tenant_id, supplier_id);
CREATE INDEX idx_purchase_orders_tenant_status ON purchase_orders(tenant_id, status);

ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_purchase_orders ON purchase_orders
    USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);


CREATE TABLE purchase_order_items (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    purchase_order_id   UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    product_id          UUID NOT NULL REFERENCES products(id),
    quantity            NUMERIC(14, 3) NOT NULL,
    unit_cost           NUMERIC(14, 2) NOT NULL,
    line_total          NUMERIC(14, 2) NOT NULL
);

CREATE INDEX idx_po_items_tenant_id ON purchase_order_items(tenant_id);
CREATE INDEX idx_po_items_po ON purchase_order_items(tenant_id, purchase_order_id);

ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_po_items ON purchase_order_items
    USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
