const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { ROLES } = require('../permissions');
const { login, publicUser, authenticate } = require('../auth');

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  const result = login(username, password);
  if (!result) return res.status(401).json({ error: 'Invalid credentials' });
  res.json(result);
});

router.get('/stores', (req, res) => {
  res.json(db.getAllStores().map((s) => ({ id: s.id, name: s.name })));
});

router.post('/signup', (req, res) => {
  const { name, username, password, role, storeId } = req.body || {};
  if (!name || !username || !password || !role) {
    return res.status(400).json({ error: 'name, username, password, role required' });
  }
  if (!Object.values(ROLES).includes(role)) {
    return res.status(400).json({ error: `Unknown role ${role}` });
  }
  if (['SYSTEM_ADMIN', 'HEAD_OFFICE_MANAGER', 'DATA_SCIENTIST'].includes(role)) {
    return res.status(403).json({ error: 'This role can only be created by an authorized administrator' });
  }
  if (db.getUserByUsername(username)) {
    return res.status(409).json({ error: 'Username already exists' });
  }
  const storeLevel = ['CASHIER', 'INVENTORY_STAFF', 'STORE_MANAGER'].includes(role);
  if (storeLevel && !storeId) {
    return res.status(400).json({ error: `${role} requires a storeId` });
  }
  if (storeLevel && !db.getStore(storeId)) {
    return res.status(404).json({ error: 'Unknown store' });
  }

  const user = {
    id: db.id('U'),
    name: name.trim(),
    username: username.trim(),
    role,
    storeId: storeLevel ? storeId : null,
    disabled: false,
    passwordHash: bcrypt.hashSync(password, 8),
  };
  db.users.push(user);
  db.logAudit({ user: null, action: 'SIGNUP_USER', resource: user.id, after: { ...user, passwordHash: undefined } });
  res.status(201).json({ message: 'User registered successfully', user: publicUser(user) });
});

// /me carries its own authenticate() since this whole router is mounted
// publicly (login has to be reachable without a token).
router.get('/me', authenticate, (req, res) => {
  res.json(publicUser(req.user));
});

module.exports = router;
