// ============================================================================
// CENTRAL AUTHORIZATION MODEL
// ----------------------------------------------------------------------------
// This is the ONLY place permission logic lives. Routes never do
// `if (role === 'MANAGER')`. They call requirePermission('SOME_PERM').
// System Admin can move permissions between roles at runtime via
// PUT /api/roles/:role/permissions, without any code change or redeploy.
// ============================================================================

const ROLES = {
  CASHIER: 'CASHIER',
  INVENTORY_STAFF: 'INVENTORY_STAFF',
  STORE_MANAGER: 'STORE_MANAGER',
  HEAD_OFFICE_MANAGER: 'HEAD_OFFICE_MANAGER',
  SYSTEM_ADMIN: 'SYSTEM_ADMIN',
};

// Roles whose data access is naturally scoped to a single assigned store.
const STORE_LEVEL_ROLES = new Set([ROLES.CASHIER, ROLES.INVENTORY_STAFF, ROLES.STORE_MANAGER]);
// Roles that operate at organization scope.
const ORG_LEVEL_ROLES = new Set([ROLES.HEAD_OFFICE_MANAGER, ROLES.SYSTEM_ADMIN]);

const PERMISSIONS = [
  'CHECKOUT_VIEW', 'CHECKOUT_CREATE',
  'SALES_VIEW_OWN_STORE', 'SALES_VIEW_ALL_STORES',
  'INVENTORY_VIEW', 'INVENTORY_RECEIVE', 'INVENTORY_ADJUST', 'INVENTORY_DISPATCH', 'INVENTORY_REQUEST',
  'PRODUCT_VIEW', 'PRODUCT_MANAGE',
  'PROMOTION_VIEW', 'PROMOTION_MANAGE',
  'STORE_VIEW', 'STORE_MANAGE',
  'STOCK_REQUEST_CREATE', 'STOCK_REQUEST_APPROVE', 'STOCK_REQUEST_REJECT',
  'TRANSFER_CREATE', 'TRANSFER_DISPATCH', 'TRANSFER_RECEIVE',
  'USER_VIEW', 'USER_MANAGE',
  'ROLE_VIEW', 'ROLE_MANAGE',
  'PERMISSION_VIEW', 'PERMISSION_MANAGE',
  'AUDIT_VIEW',
];

// Default role -> permission mapping (Section 22). Stored as Sets, mutable
// at runtime through the Role/Permission management API (System Admin only).
const rolePermissions = {
  [ROLES.CASHIER]: new Set([
    'CHECKOUT_VIEW', 'CHECKOUT_CREATE', 'SALES_VIEW_OWN_STORE', 'PROMOTION_VIEW',
  ]),
  [ROLES.INVENTORY_STAFF]: new Set([
    'INVENTORY_VIEW', 'INVENTORY_RECEIVE', 'INVENTORY_ADJUST', 'INVENTORY_DISPATCH',
    'TRANSFER_DISPATCH', 'TRANSFER_RECEIVE', 'PRODUCT_VIEW',
  ]),
  [ROLES.STORE_MANAGER]: new Set([
    'SALES_VIEW_OWN_STORE', 'INVENTORY_VIEW', 'INVENTORY_REQUEST', 'PRODUCT_VIEW',
    'STOCK_REQUEST_CREATE',
  ]),
  [ROLES.HEAD_OFFICE_MANAGER]: new Set([
    'SALES_VIEW_ALL_STORES', 'INVENTORY_VIEW', 'PRODUCT_VIEW', 'PRODUCT_MANAGE',
    'PROMOTION_VIEW', 'PROMOTION_MANAGE', 'STOCK_REQUEST_APPROVE', 'STOCK_REQUEST_REJECT',
    'TRANSFER_CREATE', 'STORE_VIEW', 'AUDIT_VIEW',
  ]),
  [ROLES.SYSTEM_ADMIN]: new Set([
    'USER_VIEW', 'USER_MANAGE', 'ROLE_VIEW', 'ROLE_MANAGE',
    'PERMISSION_VIEW', 'PERMISSION_MANAGE', 'STORE_VIEW', 'STORE_MANAGE', 'AUDIT_VIEW',
    // NOTE: no CHECKOUT_*, INVENTORY_RECEIVE/DISPATCH, STOCK_REQUEST_* etc.
    // System Admin is administrative, not operational (Section 20/33.13),
    // unless explicitly granted here.
  ]),
};

function getPermissionsForRole(role) {
  return Array.from(rolePermissions[role] || []);
}

function hasPermission(user, permission) {
  if (!user || !user.role) return false;
  const set = rolePermissions[user.role];
  return !!(set && set.has(permission));
}

function setRolePermission(role, permission, enabled) {
  if (!rolePermissions[role]) throw new Error(`Unknown role: ${role}`);
  if (!PERMISSIONS.includes(permission)) throw new Error(`Unknown permission: ${permission}`);
  if (enabled) rolePermissions[role].add(permission);
  else rolePermissions[role].delete(permission);
  return getPermissionsForRole(role);
}

function getFullRoleMatrix() {
  const out = {};
  for (const role of Object.values(ROLES)) out[role] = getPermissionsForRole(role);
  return out;
}

/** Express middleware factory: centralized authorization gate. */
function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthenticated' });
    if (!hasPermission(req.user, permission)) {
      return res.status(403).json({
        error: `Forbidden: role ${req.user.role} lacks permission ${permission}`,
      });
    }
    next();
  };
}

/** Allow if the user holds ANY of the listed permissions. */
function requireAnyPermission(...perms) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthenticated' });
    if (!perms.some((p) => hasPermission(req.user, p))) {
      return res.status(403).json({
        error: `Forbidden: role ${req.user.role} lacks any of [${perms.join(', ')}]`,
      });
    }
    next();
  };
}

module.exports = {
  ROLES,
  STORE_LEVEL_ROLES,
  ORG_LEVEL_ROLES,
  PERMISSIONS,
  getPermissionsForRole,
  hasPermission,
  setRolePermission,
  getFullRoleMatrix,
  requirePermission,
  requireAnyPermission,
};
