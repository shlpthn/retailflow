export interface NavItem {
  key: string
  label: string
  icon: string
}

export const NAV_BY_ROLE: Record<string, NavItem[]> = {
  CASHIER: [{ key: 'checkout', label: 'Checkout', icon: '🧾' }],
  INVENTORY_STAFF: [
    { key: 'inventory', label: 'Inventory', icon: '📦' },
    { key: 'products', label: 'Products', icon: '🏷️' },
  ],
  STORE_MANAGER: [
    { key: 'dashboard', label: 'Dashboard', icon: '📊' },
    { key: 'sales', label: 'Sales', icon: '💵' },
    { key: 'reports', label: 'Reports', icon: '📈' },
    { key: 'inventory', label: 'Inventory', icon: '📦' },
    { key: 'products', label: 'Products', icon: '🏷️' },
  ],
  HEAD_OFFICE_MANAGER: [
    { key: 'home', label: 'Home', icon: '🏢' },
    { key: 'stores', label: 'Stores', icon: '🏬' },
    { key: 'sales', label: 'Sales', icon: '💵' },
    { key: 'reports', label: 'Reports', icon: '📈' },
    { key: 'inventory', label: 'Inventory', icon: '📦' },
    { key: 'products', label: 'Products', icon: '🏷️' },
    { key: 'promotions', label: 'Promotions', icon: '🎟️' },
    { key: 'stock-requests', label: 'Stock Requests', icon: '🔄' },
    { key: 'users', label: 'Users', icon: '👤' },
    { key: 'audit', label: 'Audit Log', icon: '🗂️' },
  ],
  SYSTEM_ADMIN: [
    { key: 'users', label: 'Users', icon: '👤' },
    { key: 'stores', label: 'Stores', icon: '🏬' },
    { key: 'audit', label: 'Audit Log', icon: '🗂️' },
  ],
}

export const ROLE_LABEL: Record<string, string> = {
  CASHIER: 'Cashier',
  INVENTORY_STAFF: 'Inventory Staff',
  STORE_MANAGER: 'Store Manager',
  HEAD_OFFICE_MANAGER: 'Head Office Manager',
  SYSTEM_ADMIN: 'System Admin',
}

export const PAGE_TITLES: Record<string, string> = {
  checkout: 'Checkout',
  inventory: 'Inventory',
  products: 'Products',
  dashboard: 'Store Dashboard',
  sales: 'Sales',
  reports: 'Sales Report',
  home: 'Organization Overview',
  stores: 'Stores',
  promotions: 'Promotions',
  'stock-requests': 'Stock Requests',
  audit: 'Audit Log',
  users: 'Users',
  roles: 'Roles & Permissions',
  'store-detail': 'Store',
}

export function defaultRoute(role?: string): string {
  if (role === 'CASHIER') return '/checkout'
  if (role === 'INVENTORY_STAFF') return '/inventory'
  if (role === 'STORE_MANAGER') return '/dashboard'
  if (role === 'HEAD_OFFICE_MANAGER') return '/home'
  if (role === 'SYSTEM_ADMIN') return '/users'
  return '/'
}
