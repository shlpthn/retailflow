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
  let list = db.users.map(publicUser);
  if (req.user.role === ROLES.HEAD_OFFICE_MANAGER) {
    list = list.filter((u) => u.role !== ROLES.SYSTEM_ADMIN);
  }
  res.json(list);
});

router.post('/', requirePermission('USER_MANAGE'), (req, res) => {
  const { name, username, password, role, storeId } = req.body || {};
  if (!name || !username || !password || !role) return res.status(400).json({ error: 'name, username, password, role required' });
  if (!Object.values(ROLES).includes(role)) return res.status(400).json({ error: `Unknown role ${role}` });

  // Security constraint: Head Office Manager cannot create System Admin or Head Office Manager
  if (req.user.role === ROLES.HEAD_OFFICE_MANAGER) {
    if (role === ROLES.SYSTEM_ADMIN || role === ROLES.HEAD_OFFICE_MANAGER) {
      return res.status(403).json({ error: 'Head Office Manager is not allowed to create System Admin or Head Office Manager accounts' });
    }
  }

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

  // Security constraint: Head Office Manager cannot modify System Admin accounts
  if (req.user.role === ROLES.HEAD_OFFICE_MANAGER) {
    if (user.role === ROLES.SYSTEM_ADMIN) {
      return res.status(403).json({ error: 'Permission denied: cannot modify System Admin accounts' });
    }
  }

  const before = publicUser(user);
  const { name, role, storeId, disabled } = req.body || {};
  if (role) {
    if (!Object.values(ROLES).includes(role)) return res.status(400).json({ error: `Unknown role ${role}` });
    if (req.user.role === ROLES.HEAD_OFFICE_MANAGER) {
      if (role === ROLES.SYSTEM_ADMIN || role === ROLES.HEAD_OFFICE_MANAGER) {
        return res.status(403).json({ error: 'Head Office Manager is not allowed to assign System Admin or Head Office Manager role' });
      }
    }
    user.role = role;
  }
  if (name) user.name = name;
  if (storeId !== undefined) user.storeId = storeId;
  if (disabled !== undefined) user.disabled = !!disabled;
  db.logAudit({ user: req.user, action: 'UPDATE_USER', resource: user.id, before, after: publicUser(user) });
  res.json(publicUser(user));
});

module.exports = router;
