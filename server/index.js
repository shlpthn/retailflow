const path = require('path');
const express = require('express');
const cors = require('cors');
const { authenticate } = require('./auth');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

// Persist any data changes to SQLite once the response has been fully sent.
// db.maybeFlush() writes only when the in-memory state actually changed, so
// no-op requests (GET, failed auth, etc.) incur zero SQL work.
app.use((req, res, next) => {
  res.on('finish', () => db.maybeFlush());
  next();
});

// ---- Public (unauthenticated) ----------------------------------------------
// Mounted before the global authenticate() gate below, because /login must be
// reachable without a token. /me inside this router authenticates itself.
app.use('/api/auth', require('./routes/auth'));

// ---- Everything else requires a valid session ------------------------------
app.use('/api', authenticate);

app.use('/api/products', require('./routes/products'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/checkout', require('./routes/checkout'));
app.use('/api/sales', require('./routes/sales'));
app.use('/api/stock-requests', require('./routes/stockRequests'));
app.use('/api/transfers', require('./routes/transfers'));
app.use('/api/stores', require('./routes/stores'));
app.use('/api/promotions', require('./routes/promotions'));
app.use('/api/users', require('./routes/users'));
app.use('/api/roles', require('./routes/roles'));
app.use('/api/audit-logs', require('./routes/auditLogs'));

// ---- Static SPA frontend ----------------------------------------------------
const fs = require('fs');
const clientDist = path.join(__dirname, '..', 'client', 'dist');
const staticDir = fs.existsSync(clientDist) ? clientDist : path.join(__dirname, '..', 'public');

app.use(express.static(staticDir));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(staticDir, 'index.html'));
});

// ---- Boot: open (and seed if needed) the SQLite database -------------------
db.init();

// Best-effort final flush on shutdown — normal requests are already persisted
// via the response hook above.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    try { db.flush(); } catch (e) { /* best-effort */ }
    process.exit(0);
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`RetailFlow running at http://localhost:${PORT}`);
});
