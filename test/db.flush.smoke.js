// ============================================================================
// db.flush incremental-upsert smoke test
// Drives db.js directly (no HTTP server) against a throw-away SQLite file,
// then inspects what actually landed on disk with a second read-only connection.
//
// Run from repo root:  node test/db.flush.smoke.js   (exits 0 on full pass)
// ============================================================================
'use strict';

const path = require('path');
const fs   = require('fs');

// ---- Isolated DB file -------------------------------------------------------
const DB_DIR  = path.join(__dirname, '.tmp');
const DB_FILE = path.join(DB_DIR, 'flush_smoke.db');
fs.mkdirSync(DB_DIR, { recursive: true });
for (const f of [DB_FILE, DB_FILE + '-wal', DB_FILE + '-shm']) {
  try { fs.unlinkSync(f); } catch (_) {}
}
process.env.RETAILFLOW_DB_PATH = DB_FILE;

// ---- Load db module fresh ---------------------------------------------------
const db = require('../server/db');
db.init();   // seeds the DB and loads into memory

// ---- helpers ----------------------------------------------------------------
const Database  = require('better-sqlite3');
const inspector = () => new Database(DB_FILE, { readonly: true });

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else       { fail++; console.log('FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}

// ============================================================================
// 1. Baseline: seed data is on disk after init
// ============================================================================
{
  const r      = inspector();
  const stores = r.prepare('SELECT * FROM stores').all();
  check('baseline: 2 seed stores on disk', stores.length === 2, JSON.stringify(stores));

  const inv = r.prepare('SELECT * FROM inventory').all();
  check('baseline: 10 seed inventory rows on disk', inv.length === 10, `found ${inv.length}`);
  r.close();
}

// ============================================================================
// 2. Mutate ONE inventory row; flush; only that row should change on disk
// ============================================================================
{
  const row    = db.getInventoryRow('STORE_001', 'P001');
  const oldQty = row.quantity;   // seed = 40
  row.quantity = 999;

  db.flush();

  const r       = inspector();
  const updated = r.prepare("SELECT quantity FROM inventory WHERE storeId = 'STORE_001' AND productId = 'P001'").get();
  check('incremental update: changed row written to disk',
    updated && updated.quantity === 999,
    `disk has ${updated && updated.quantity}, expected 999`);

  const unchanged = r.prepare("SELECT quantity FROM inventory WHERE storeId = 'STORE_001' AND productId = 'P002'").get();
  check('incremental update: unchanged row still correct',
    unchanged && unchanged.quantity === 8,
    `disk has ${unchanged && unchanged.quantity}, expected 8 (seed)`);

  const total = r.prepare('SELECT COUNT(*) AS c FROM inventory').get();
  check('incremental update: no rows deleted', total.c === 10, `found ${total.c}`);
  r.close();

  row.quantity = oldQty;
  db.flush();
}

// ============================================================================
// 3. Add a new product to memory; flush; it should appear on disk
// ============================================================================
{
  const newProd = { id: db.id('P'), name: 'Test Widget', barcode: 'T001', price: 7.5, image: '🔧' };
  db.products.push(newProd);
  db.flush();

  const r       = inspector();
  const onDisk  = r.prepare('SELECT * FROM products WHERE id = ?').get(newProd.id);
  check('new product: inserted on flush',
    !!onDisk && onDisk.name === 'Test Widget', JSON.stringify(onDisk));

  const existing = r.prepare("SELECT * FROM products WHERE id = 'P001'").get();
  check('new product: existing products untouched',
    !!existing && existing.name === 'Classic T-Shirt', JSON.stringify(existing));
  r.close();
}

// ============================================================================
// 4. Remove a row from memory; flush; it should be gone from disk
// ============================================================================
{
  const idx      = db.products.findIndex((p) => p.name === 'Test Widget');
  const [removed] = db.products.splice(idx, 1);
  db.flush();

  const r      = inspector();
  const onDisk = r.prepare('SELECT * FROM products WHERE id = ?').get(removed.id);
  check('removed product: deleted from disk on flush',
    onDisk === undefined, `still found: ${JSON.stringify(onDisk)}`);

  const seedCount = r.prepare('SELECT COUNT(*) AS c FROM products').get();
  check('removed product: seed products intact', seedCount.c === 5, `found ${seedCount.c}`);
  r.close();
}

// ============================================================================
// 5. Flush with no changes is a true no-op
// ============================================================================
{
  const r0     = inspector();
  const before = r0.prepare('SELECT COUNT(*) AS c FROM inventory').get().c;
  r0.close();

  db.flush();
  db.flush();   // twice for good measure

  const r1    = inspector();
  const after = r1.prepare('SELECT COUNT(*) AS c FROM inventory').get().c;
  r1.close();

  check('no-op flush: row count unchanged', before === after, `before=${before} after=${after}`);
}

// ============================================================================
// 6. Structured table update: user disabled flag
// ============================================================================
{
  const user = db.users.find((u) => u.username === 'cashier1');
  check('precondition: cashier1 exists', !!user);

  user.disabled = true;
  db.flush();

  const r      = inspector();
  const onDisk = r.prepare("SELECT disabled FROM users WHERE username = 'cashier1'").get();
  check('user update: disabled=true written to disk',
    onDisk && onDisk.disabled === 1, `disk has disabled=${onDisk && onDisk.disabled}`);
  r.close();

  user.disabled = false;
  db.flush();

  const r2      = inspector();
  const restored = r2.prepare("SELECT disabled FROM users WHERE username = 'cashier1'").get();
  check('user restore: disabled=false written back', restored && restored.disabled === 0);
  r2.close();
}

// ============================================================================
// 7. JSON-table row: insert then update in-place
// ============================================================================
{
  const notifId = db.id('NOTIF');
  const notif   = { id: notifId, storeId: 'STORE_001', type: 'LOW_STOCK', message: 'Test notif', createdAt: new Date().toISOString(), read: false };
  db.notifications.push(notif);
  db.flush();

  const r   = inspector();
  const row = r.prepare('SELECT json FROM notifications WHERE id = ?').get(notifId);
  check('json-table insert: notification written', !!row, `not found in DB`);
  r.close();

  notif.read = true;
  db.flush();

  const r2      = inspector();
  const updated = r2.prepare('SELECT json FROM notifications WHERE id = ?').get(notifId);
  const parsed  = updated && JSON.parse(updated.json);
  check('json-table update: read flag written',
    parsed && parsed.read === true, `json on disk: ${updated && updated.json}`);
  r2.close();
}

// ============================================================================
// Summary
// ============================================================================
console.log(`\nRESULT: ${pass} passed, ${fail} failed`);

for (const f of [DB_FILE, DB_FILE + '-wal', DB_FILE + '-shm']) {
  try { fs.unlinkSync(f); } catch (_) {}
}
process.exit(fail ? 1 : 0);
