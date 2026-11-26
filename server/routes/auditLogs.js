const express = require('express');
const router = express.Router();
const db = require('../db');
const { requirePermission, STORE_LEVEL_ROLES, ROLES } = require('../permissions');

// BA US-10.5: append-only audit log (no update / delete routes exist).
// Scope (AC3): Store Manager — own store; HO Manager — whole chain; System Admin — administration actions only.
// Filters (AC2): from / to (yyyy-MM-dd), userId, action, entityType, entityId. Paging: page (1-based), pageSize (default 200).
const ADMIN_ACTIONS = /^(LOGIN_|SIGNUP_USER|CREATE_USER|UPDATE_USER|DELETE_USER|UPDATE_ROLE|CREATE_STORE|UPDATE_STORE|DELETE_STORE)/;

router.get('/', requirePermission('AUDIT_VIEW'), (req, res) => {
  const q = req.query;
  const user = req.user;
  const pageSize = Math.min(500, Math.max(1, parseInt(q.pageSize, 10) || 200));
  const page = Math.max(1, parseInt(q.page, 10) || 1);

  const rows = db.auditLogs.map((e, i) => ({ e, i })).filter(({ e }) => {
    if (user.role === ROLES.SYSTEM_ADMIN && !ADMIN_ACTIONS.test(e.action || '')) return false;
    if (STORE_LEVEL_ROLES.has(user.role) && e.storeId !== user.storeId) return false;
    const day = (e.createdAt || '').slice(0, 10);
    if (q.from && day < q.from) return false;
    if (q.to && day > q.to) return false;
    if (q.userId && e.userId !== q.userId) return false;
    if (q.action && e.action !== q.action) return false;
    if (q.entityType && e.entityType !== q.entityType) return false;
    if (q.entityId && e.entityId !== q.entityId && e.resource !== q.entityId) return false;
    return true;
  });
  // Newest first; entries written in the same millisecond keep their insertion order.
  rows.sort((a, b) => (b.e.createdAt || '').localeCompare(a.e.createdAt || '') || b.i - a.i);
  res.set('X-Total-Count', String(rows.length));
  res.json(rows.slice((page - 1) * pageSize, page * pageSize).map(({ e }) => e));
});

module.exports = router;
