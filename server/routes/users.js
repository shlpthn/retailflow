const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requirePermission, ROLES } = require('../permissions');

function publicUser(u) {
  const { passwordHash, ...rest } = u;
  return rest;
}

router.get('/', requirePermission('USER_VIEW'), (req, res) => {
  res.json(db.users.map(publicUser));
});

router.post('/', requirePermission('USER_MANAGE'), (req, res) => {
  const { name, username, password, role, storeId } = req.body || {};
  if (!name || !username || !password || !role) return res.status(400).json({ error: 'name, username, password, role required' });
  if (!Object.values(ROLES).includes(role)) return res.status(400).json({ error: `Unknown role ${role}` });
  if (db.getUserByUsername(username)) return res.status(409).json({ error: 'Username already exists' });
  const storeLevel = ['CASHIER', 'INVENTORY_STAFF', 'STORE_MANAGER'].includes(role);
  if (storeLevel && !storeId) return res.status(400).json({ error: `${role} requires a storeId` });
  if (storeLevel && !db.getStore(storeId)) return res.status(404).json({ error: 'Unknown store' });

  const user = {
    id: db.id('U'), name, username, role,
    storeId: storeLevel ? storeId : null,
    disabled: false,
    passwordHash: bcrypt.hashSync(password, 8),
  };
  db.users.push(user);
  db.logAudit({ user: req.user, action: 'CREATE_USER', resource: user.id, after: { ...user, passwordHash: undefined } });
  res.status(201).json(publicUser(user));
});

router.put('/:userId', requirePermission('USER_MANAGE'), (req, res) => {
  const user = db.getUserById(req.params.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const before = publicUser(user);
  const { name, role, storeId, disabled } = req.body || {};
  if (role) {
    if (!Object.values(ROLES).includes(role)) return res.status(400).json({ error: `Unknown role ${role}` });
    user.role = role;
  }
  if (name) user.name = name;
  if (storeId !== undefined) user.storeId = storeId;
  if (disabled !== undefined) user.disabled = !!disabled;
  db.logAudit({ user: req.user, action: 'UPDATE_USER', resource: user.id, before, after: publicUser(user) });
  res.json(publicUser(user));
});

module.exports = router;
