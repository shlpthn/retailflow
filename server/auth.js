const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('./db');
const { getPermissionsForRole } = require('./permissions');

// ============================================================================
// AUTHENTICATION ("who are you?") — deliberately kept separate from
// AUTHORIZATION ("what can you do?"), per Section 29 / mistake #11.
// In production the secret comes from an env var / secrets manager.
// ============================================================================
const JWT_SECRET = process.env.RETAILFLOW_JWT_SECRET || 'dev-only-secret-change-me';
const TOKEN_TTL = '8h';

function login(username, password) {
  const user = db.getUserByUsername(username);
  if (!user || user.disabled) return null;
  if (!bcrypt.compareSync(password, user.passwordHash)) return null;

  const token = jwt.sign(
    { sub: user.id, role: user.role, storeId: user.storeId },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
  return { token, user: publicUser(user) };
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
    storeId: user.storeId,
    scope: user.storeId ? 'STORE' : (
      user.role === 'HEAD_OFFICE_MANAGER'
        ? 'ALL_STORES'
        : 'SYSTEM'
    ),
    permissions: getPermissionsForRole(user.role),
  };
}

/** Express middleware: verifies the JWT and attaches the CURRENT, live user record to req.user. */
function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing bearer token' });

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // Re-fetch from the DB every request rather than trusting the token's
  // embedded snapshot — if System Admin disables the user or changes their
  // role/store mid-session, that takes effect on the very next request.
  const user = db.getUserById(payload.sub);
  if (!user || user.disabled) return res.status(401).json({ error: 'Account not found or disabled' });

  req.user = user; // full server-side user record (role, storeId, etc.)
  next();
}

module.exports = { login, publicUser, authenticate, JWT_SECRET };
