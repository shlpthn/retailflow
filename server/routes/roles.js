const express = require('express');
const router = express.Router();
const db = require('../db');
const { requirePermission, getFullRoleMatrix, setRolePermission, PERMISSIONS, ROLES } = require('../permissions');

router.get('/', requirePermission('ROLE_VIEW'), (req, res) => {
  res.json({ roles: Object.values(ROLES), permissions: PERMISSIONS, matrix: getFullRoleMatrix() });
});

// This is the concrete answer to Section 23: System Admin can move a
// permission on/off a role at runtime, with no code change, because every
// route checks the *permission*, never the role name.
router.put('/:role/permissions', requirePermission('ROLE_MANAGE'), requirePermission('PERMISSION_MANAGE'), (req, res) => {
  const { role } = req.params;
  const { permission, enabled } = req.body || {};
  if (!Object.values(ROLES).includes(role)) return res.status(404).json({ error: 'Unknown role' });
  if (!PERMISSIONS.includes(permission)) return res.status(400).json({ error: 'Unknown permission' });
  try {
    const updated = setRolePermission(role, permission, !!enabled);
    db.logAudit({ user: req.user, action: 'UPDATE_ROLE_PERMISSIONS', resource: role, after: { permission, enabled: !!enabled } });
    res.json({ role, permissions: updated });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
