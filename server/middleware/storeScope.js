const { STORE_LEVEL_ROLES, ROLES } = require('../permissions');
const db = require('../db');

// ============================================================================
// STORE-LEVEL DATA ISOLATION (Section 26)
// ----------------------------------------------------------------------------
// This is the one place that decides which store(s) a request is allowed to
// touch. It NEVER trusts a client-supplied storeId for store-level roles
// (Cashier, Inventory Staff, Store Manager) — their storeId always comes
// from the authenticated user record, never from req.query/req.body/req.params.
// Head Office Manager / System Admin may pass storeId to select a store, but
// only because their role scope permits organization-wide access.
// ============================================================================

function resolveStoreScope(req, res, next) {
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'Unauthenticated' });

  if (STORE_LEVEL_ROLES.has(user.role)) {
    // Ignore any client-supplied storeId entirely. This is what stops the
    // "GET /stores/STORE_002/inventory while assigned to STORE_001" attack
    // described in Section 25 — even if the frontend sends a different id,
    // the backend substitutes the authenticated user's own store.
    req.storeScope = { type: 'SINGLE', storeId: user.storeId };
  } else if (user.role === ROLES.HEAD_OFFICE_MANAGER) {
    const requested = req.query.storeId || (req.body && req.body.storeId) || null;
    req.storeScope = { type: 'ORG', storeId: requested };
  } else if (user.role === ROLES.SYSTEM_ADMIN) {
    const requested = req.query.storeId || (req.body && req.body.storeId) || null;
    req.storeScope = { type: 'ADMIN', storeId: requested };
  } else {
    req.storeScope = { type: 'NONE', storeId: null };
  }
  next();
}

/** Validate that a resolved target storeId is actually allowed for this request's scope. */
function assertStoreAccess(req, res, storeId) {
  const scope = req.storeScope;
  if (!scope) {
    res.status(500).json({ error: 'storeScope not resolved (missing resolveStoreScope middleware)' });
    return false;
  }
  if (scope.type === 'SINGLE' && scope.storeId !== storeId) {
    res.status(403).json({ error: `Forbidden: no access to store ${storeId}` });
    return false;
  }
  if (storeId && !db.getStore(storeId)) {
    res.status(404).json({ error: `Unknown store ${storeId}` });
    return false;
  }
  return true;
}

/** Resolve the effective storeId to operate on for GET-style "which store's data" requests. */
function effectiveStoreId(req) {
  const scope = req.storeScope;
  if (scope.type === 'SINGLE') return scope.storeId;
  if (scope.type === 'ORG' || scope.type === 'ADMIN') {
    return scope.storeId || db.getAllStores()[0].id; // default to first store if none selected
  }
  return null;
}

module.exports = { resolveStoreScope, assertStoreAccess, effectiveStoreId };
