const express = require('express');
const router = express.Router();
const { login, publicUser, authenticate } = require('../auth');

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  const result = login(username, password);
  if (!result) return res.status(401).json({ error: 'Invalid credentials' });
  res.json(result);
});

// /me carries its own authenticate() since this whole router is mounted
// publicly (login has to be reachable without a token).
router.get('/me', authenticate, (req, res) => {
  res.json(publicUser(req.user));
});

module.exports = router;
