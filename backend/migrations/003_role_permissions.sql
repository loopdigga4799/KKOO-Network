-- ============================================================================
-- KARIAKOO SAAS PLATFORM — PERMISSION GRANTS
-- Migration 003: Define permission codes and assign them to roles
-- ============================================================================
--
-- This is the piece that was deliberately left out of migration 001 —
-- role NAMES existed, but no role had any actual permissions, so
-- PermissionsGuard correctly denied everyone. This migration is the
-- considered version of that mapping, not a rushed default.
--
-- Naming convention: '<resource>:<action>'
-- ============================================================================

INSERT INTO permissions (code, description) VALUES
    ('pos:operate',            'Operate the point-of-sale / process sales'),
    ('inventory:view',         'View product catalog and stock levels'),
    ('inventory:adjust',       'Create manual stock adjustments'),
    ('inventory:manage',       'Create/edit/deactivate products and categories'),
    ('purchasing:view',        'View purchase orders and suppliers'),
    ('purchasing:manage',      'Create purchase orders, receive stock, manage suppliers'),
    ('customers:view',         'View customer records and credit balances'),
    ('customers:manage',       'Create/edit customers, adjust credit limits'),
    ('expenses:view',          'View recorded expenses'),
    ('expenses:manage',        'Record and edit expenses'),
    ('cash:manage',            'Open/close cash drawer, record cash movements'),
    ('reports:view',           'View operational reports (sales, stock)'),
    ('reports:financial',      'View financial reports (profit, expenses, cash flow)'),
    ('users:manage',           'Create/edit staff accounts and assign roles'),
    ('settings:manage',        'Change tenant-wide settings and branch configuration'),
    ('branches:manage',        'Create and edit branches/warehouses');


-- Owner: everything. Full stop.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.code = 'owner';

-- Administrator: everything except nothing is withheld in Phase 1 — the
-- distinction from Owner today is conceptual (billing access, once billing
-- exists); revisit when billing is built.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.code = 'administrator';

-- Manager: full operational access, no user/settings management
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'manager'
  AND p.code IN (
    'pos:operate', 'inventory:view', 'inventory:adjust', 'inventory:manage',
    'purchasing:view', 'purchasing:manage', 'customers:view', 'customers:manage',
    'expenses:view', 'expenses:manage', 'cash:manage',
    'reports:view', 'reports:financial'
  );

-- Accountant: financial visibility and expense/cash handling, no POS, no inventory edits
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'accountant'
  AND p.code IN (
    'inventory:view', 'purchasing:view', 'customers:view',
    'expenses:view', 'expenses:manage', 'cash:manage',
    'reports:view', 'reports:financial'
  );

-- Warehouse Manager: inventory and purchasing across branches, no sales/financial
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'warehouse_manager'
  AND p.code IN (
    'inventory:view', 'inventory:adjust', 'inventory:manage',
    'purchasing:view', 'purchasing:manage', 'reports:view'
  );

-- Storekeeper: inventory at their own branch only (branch-scoping enforced
-- at the application layer via user_branches, not by permission code alone)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'storekeeper'
  AND p.code IN ('inventory:view', 'inventory:adjust');

-- Salesperson: sales and customer handling, no financial reports
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'salesperson'
  AND p.code IN ('pos:operate', 'inventory:view', 'customers:view', 'customers:manage');

-- Cashier: POS only
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'cashier'
  AND p.code IN ('pos:operate', 'inventory:view');
