export interface NavItem {
  label: string;
  href: string;
  icon: string;
}

const NAV_BY_ROLE: Record<string, NavItem[]> = {
  owner: [
    { label: 'Overview', href: '/dashboard', icon: '📊' },
    { label: 'Point of Sale', href: '/pos', icon: '🧾' },
    { label: 'Products', href: '/dashboard/products', icon: '📦' },
    { label: 'Inventory', href: '/dashboard/inventory', icon: '🏬' },
    { label: 'Purchasing', href: '/dashboard/purchasing', icon: '🚚' },
    { label: 'Sales', href: '/dashboard/sales', icon: '💰' },
  ],
  administrator: [
    { label: 'Overview', href: '/dashboard', icon: '📊' },
    { label: 'Point of Sale', href: '/pos', icon: '🧾' },
    { label: 'Products', href: '/dashboard/products', icon: '📦' },
    { label: 'Inventory', href: '/dashboard/inventory', icon: '🏬' },
    { label: 'Purchasing', href: '/dashboard/purchasing', icon: '🚚' },
    { label: 'Sales', href: '/dashboard/sales', icon: '💰' },
  ],
  manager: [
    { label: 'Overview', href: '/dashboard', icon: '📊' },
    { label: 'Point of Sale', href: '/pos', icon: '🧾' },
    { label: 'Products', href: '/dashboard/products', icon: '📦' },
    { label: 'Inventory', href: '/dashboard/inventory', icon: '🏬' },
    { label: 'Purchasing', href: '/dashboard/purchasing', icon: '🚚' },
    { label: 'Sales', href: '/dashboard/sales', icon: '💰' },
  ],
  accountant: [
    { label: 'Overview', href: '/dashboard', icon: '📊' },
    { label: 'Sales', href: '/dashboard/sales', icon: '💰' },
  ],
  warehouse_manager: [
    { label: 'Overview', href: '/dashboard', icon: '📊' },
    { label: 'Products', href: '/dashboard/products', icon: '📦' },
    { label: 'Inventory', href: '/dashboard/inventory', icon: '🏬' },
    { label: 'Purchasing', href: '/dashboard/purchasing', icon: '🚚' },
  ],
  storekeeper: [
    { label: 'Overview', href: '/dashboard', icon: '📊' },
    { label: 'Inventory', href: '/dashboard/inventory', icon: '🏬' },
  ],
};

export function getNavForRole(roleCode: string): NavItem[] {
  return NAV_BY_ROLE[roleCode] ?? [{ label: 'Overview', href: '/dashboard', icon: '📊' }];
}

export function shouldUsePosLanding(roleCode: string): boolean {
  return roleCode === 'cashier' || roleCode === 'salesperson';
}
