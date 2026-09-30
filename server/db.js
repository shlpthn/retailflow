const bcrypt = require('bcryptjs');
const path   = require('path');
const fs     = require('fs');
const Database = require('better-sqlite3');

// ============================================================================
// DATA LAYER — SQLite-backed persistence
// ----------------------------------------------------------------------------
// The RUNTIME model is unchanged: routes keep reading/writing the plain
// in-memory arrays exported below (db.stores, db.sales, …). SQLite is the
// durability layer behind them:
//
//   db.init()        Opens data/retailflow.db, creates the schema, seeds it
//                    from the hardcoded seed data on FIRST boot, and loads
//                    every table into memory. Nothing above this module needs
//                    to change.
//
//   db.maybeFlush()  Persists any in-memory change back to SQLite
//                    incrementally — only rows whose content actually changed
//                    are upserted (and only vanished rows are deleted), all
//                    inside one transaction. index.js calls it after every
//                    response via the `finish` event.
//
//   db.flush()       Same as maybeFlush() but unconditional (used on SIGTERM).
//
// All NEW data created at runtime is stored in SQLite, so `npm start` restarts
// no longer reset the app to the hardcoded state. Delete data/retailflow.db to
// get a fresh seeded database. Set RETAILFLOW_DB_PATH to override the path.
// ============================================================================

const DB_PATH      = path.resolve(
  process.env.RETAILFLOW_DB_PATH || path.join(__dirname, '..', 'data', 'retailflow.db'),
);
const SCHEMA_VERSION = 1;

// ---- hardcoded seed data (seeds a brand-new database only) ------------------

const seedStores = [
  { id: 'STORE_001', name: 'Downtown Store', address: '12 Market St' },
  { id: 'STORE_002', name: 'Uptown Store',   address: '88 Fifth Ave' },
];

const seedUsers = [
  { id: 'U001', name: 'Cara Chen',     username: 'cashier1',   role: 'CASHIER',               storeId: 'STORE_001', disabled: false },
  { id: 'U002', name: 'Ivan Ruiz',     username: 'inventory1', role: 'INVENTORY_STAFF',        storeId: 'STORE_001', disabled: false },
  { id: 'U003', name: 'Priya Nair',    username: 'inventory2', role: 'INVENTORY_STAFF',        storeId: 'STORE_002', disabled: false },
  { id: 'U004', name: 'Sam Okafor',    username: 'manager1',   role: 'STORE_MANAGER',          storeId: 'STORE_001', disabled: false },
  { id: 'U005', name: 'Lena Kim',      username: 'manager2',   role: 'STORE_MANAGER',          storeId: 'STORE_002', disabled: false },
  { id: 'U006', name: 'Grace Adeyemi', username: 'ho1',        role: 'HEAD_OFFICE_MANAGER',    storeId: null,        disabled: false },
  { id: 'U007', name: 'Tom Becker',    username: 'admin1',     role: 'SYSTEM_ADMIN',           storeId: null,        disabled: false },
];
// demo password for every seed user: "password123"
const seedPasswordHash = bcrypt.hashSync('password123', 8);
seedUsers.forEach((u) => { u.passwordHash = seedPasswordHash; });

const seedProducts = [
  { id: 'P001', name: 'Classic T-Shirt',    barcode: '0001', price: 15.0, image: '👕' },
  { id: 'P002', name: 'Denim Jeans',        barcode: '0002', price: 45.0, image: '👖' },
  { id: 'P003', name: 'Running Sneakers',   barcode: '0003', price: 65.0, image: '👟' },
  { id: 'P004', name: 'Rain Jacket',        barcode: '0004', price: 80.0, image: '🧥' },
  { id: 'P005', name: 'Baseball Cap',       barcode: '0005', price: 12.0, image: '🧢' },
];

// inventory: one row per (storeId, productId)
const seedInventory = [
  { storeId: 'STORE_001', productId: 'P001', quantity: 40, threshold: 15 },
  { storeId: 'STORE_001', productId: 'P002', quantity:  8, threshold: 10 },
  { storeId: 'STORE_001', productId: 'P003', quantity: 22, threshold: 10 },
  { storeId: 'STORE_001', productId: 'P004', quantity:  3, threshold:  5 },
  { storeId: 'STORE_001', productId: 'P005', quantity: 50, threshold: 10 },
  { storeId: 'STORE_002', productId: 'P001', quantity: 30, threshold: 15 },
  { storeId: 'STORE_002', productId: 'P002', quantity: 25, threshold: 10 },
  { storeId: 'STORE_002', productId: 'P003', quantity:  5, threshold: 10 },
  { storeId: 'STORE_002', productId: 'P004', quantity: 18, threshold:  5 },
  { storeId: 'STORE_002', productId: 'P005', quantity: 40, threshold: 10 },
];

const seedPromotions = [
  {
    id: 'PROMO001', name: 'Autumn 10% Off', code: 'SAVE10', type: 'PERCENT', value: 10,
    active: true, applicableProductIds: null, applicableStoreIds: null,
    validFrom: '2026-01-01', validTo: '2026-12-31',
  },
];

const seedSales          = []; // { id, storeId, cashierId, items:[...], subtotal, discount, total, promotionCode, paymentMethod, createdAt }
const seedStockMovements = []; // { id, storeId, productId, type, quantity, actorId, note, createdAt }
const seedStockRequests  = []; // { id, storeId, productId, quantity, status, requestedBy, createdAt, history, fulfillment }
const seedTransfers      = []; // { id, stockRequestId, productId, quantity, sourceStoreId, destinationStoreId, status, createdAt }
const seedFactoryOrders  = []; // { id, stockRequestId, productId, quantity, destinationStoreId, status, createdAt }
const seedAuditLogs      = []; // { id, userId, userName, role, action, resource, storeId, before, after, createdAt }
const seedNotifications  = []; // { id, storeId, type, message, createdAt, read }

// ---- runtime state (exported; populated from SQLite by init()) --------------

let nextId = 1000;
const id = (prefix) => `${prefix}${nextId++}`;

const stores        = [];
const users         = [];
const products      = [];
const inventory     = [];
const promotions    = [];
const sales         = [];
const stockMovements= [];
const stockRequests = [];
const transfers     = [];
const factoryOrders = [];
const auditLogs     = [];
const notifications = [];

// ---- schema -----------------------------------------------------------------

const SCHEMA_SQL = [
  'CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);',
  'CREATE TABLE IF NOT EXISTS stores (id TEXT PRIMARY KEY, name TEXT NOT NULL, address TEXT NOT NULL);',
  'CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, username TEXT NOT NULL UNIQUE, role TEXT NOT NULL, storeId TEXT, disabled INTEGER NOT NULL DEFAULT 0, passwordHash TEXT NOT NULL);',
  'CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, name TEXT NOT NULL, barcode TEXT, price REAL NOT NULL, image TEXT);',
  'CREATE TABLE IF NOT EXISTS inventory (storeId TEXT NOT NULL, productId TEXT NOT NULL, quantity INTEGER NOT NULL, threshold INTEGER NOT NULL DEFAULT 10, PRIMARY KEY (storeId, productId));',
  'CREATE TABLE IF NOT EXISTS promotions     (id TEXT PRIMARY KEY, json TEXT NOT NULL);',
  'CREATE TABLE IF NOT EXISTS sales          (id TEXT PRIMARY KEY, json TEXT NOT NULL);',
  'CREATE TABLE IF NOT EXISTS stockMovements (id TEXT PRIMARY KEY, json TEXT NOT NULL);',
  'CREATE TABLE IF NOT EXISTS stockRequests  (id TEXT PRIMARY KEY, json TEXT NOT NULL);',
  'CREATE TABLE IF NOT EXISTS transfers      (id TEXT PRIMARY KEY, json TEXT NOT NULL);',
  'CREATE TABLE IF NOT EXISTS factoryOrders  (id TEXT PRIMARY KEY, json TEXT NOT NULL);',
  'CREATE TABLE IF NOT EXISTS auditLogs      (id TEXT PRIMARY KEY, json TEXT NOT NULL);',
  'CREATE TABLE IF NOT EXISTS notifications  (id TEXT PRIMARY KEY, json TEXT NOT NULL);',
].join('\n');

// Tables stored as (id, json) blobs — routes read them in bulk and filter in JS.
const JSON_TABLES = ['promotions', 'sales', 'stockMovements', 'stockRequests', 'transfers', 'factoryOrders', 'auditLogs', 'notifications'];
const COLLECTIONS_BY_TABLE = { promotions, sales, stockMovements, stockRequests, transfers, factoryOrders, auditLogs, notifications };

let conn = null;

// ============================================================================
// Incremental flush support
// ============================================================================
// `rowCache` stores a JSON fingerprint of every row that is currently
// persisted to disk. On each flush() / maybeFlush() call we:
//   1. Walk every in-memory array and compute each row's fingerprint.
//   2. If the fingerprint differs from the cache → upsert that row.
//   3. If a cached key is gone from memory → delete that row.
// The SQL work is O(changed rows), not O(total rows).

/** All runtime collections keyed by their SQL table name. */
const ARRAYS_BY_TABLE = {
  stores, users, products, inventory,
  promotions, sales, stockMovements, stockRequests,
  transfers, factoryOrders, auditLogs, notifications,
};

/** Row identity: most tables key on `id`; inventory uses a composite key. */
const keyOf = (table, row) =>
  table === 'inventory' ? `${row.storeId}|${row.productId}` : row.id;

/** SQL to delete a single row by its key. */
const deleteSqlFor  = (table) => table === 'inventory'
  ? 'DELETE FROM inventory WHERE storeId = ? AND productId = ?'
  : `DELETE FROM ${table} WHERE id = ?`;
const deleteArgsFor = (table, key) =>
  table === 'inventory' ? key.split('|') : [key];

/** Fingerprint cache: table → Map(key → JSON string of the persisted row). */
const rowCache    = new Map();
const rowCacheFor = (table) => {
  if (!rowCache.has(table)) rowCache.set(table, new Map());
  return rowCache.get(table);
};

/** Rebuild the fingerprint cache from whatever is currently in memory.
 *  Called once by init() so the first maybeFlush() is always a no-op. */
function buildRowCache() {
  rowCache.clear();
  for (const [table, arr] of Object.entries(ARRAYS_BY_TABLE)) {
    const cache = rowCacheFor(table);
    for (const row of arr) cache.set(keyOf(table, row), JSON.stringify(row));
  }
}

/** Compare memory vs cache; return only what actually changed. */
function computeDiff() {
  const upserts = []; // { table, row, key, fp }
  const deletes = []; // { table, key }
  let changed = false;

  for (const [table, arr] of Object.entries(ARRAYS_BY_TABLE)) {
    const cache = rowCacheFor(table);
    const seen  = new Set();

    for (const row of arr) {
      const key = keyOf(table, row);
      seen.add(key);
      const fp = JSON.stringify(row);
      if (cache.get(key) !== fp) {
        upserts.push({ table, row, key, fp });
        changed = true;
      }
    }

    for (const key of cache.keys()) {
      if (!seen.has(key)) {
        deletes.push({ table, key });
        changed = true;
      }
    }
  }

  return { changed, upserts, deletes };
}

let lastFlushedNextId = -1;

/** Prepared upsert statements for each structured (non-JSON) table. */
const buildDim = () => ({
  stores:    conn.prepare('INSERT INTO stores (id, name, address) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, address = excluded.address'),
  users:     conn.prepare('INSERT INTO users (id, name, username, role, storeId, disabled, passwordHash) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, username = excluded.username, role = excluded.role, storeId = excluded.storeId, disabled = excluded.disabled, passwordHash = excluded.passwordHash'),
  products:  conn.prepare('INSERT INTO products (id, name, barcode, price, image) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, barcode = excluded.barcode, price = excluded.price, image = excluded.image'),
  inventory: conn.prepare('INSERT INTO inventory (storeId, productId, quantity, threshold) VALUES (?, ?, ?, ?) ON CONFLICT(storeId, productId) DO UPDATE SET quantity = excluded.quantity, threshold = excluded.threshold'),
});

/** How to bind each structured table's row to its prepared statement. */
const BINDERS = {
  stores:    (s, r) => s.run(r.id, r.name, r.address),
  users:     (s, r) => s.run(r.id, r.name, r.username, r.role, r.storeId, r.disabled ? 1 : 0, r.passwordHash),
  products:  (s, r) => s.run(r.id, r.name, r.barcode, r.price, r.image),
  inventory: (s, r) => s.run(r.storeId, r.productId, r.quantity, r.threshold),
};

/**
 * Write ONLY the changed rows to SQLite, inside a single transaction.
 * After the transaction commits, the local rowCache is updated to mirror disk.
 */
function flushDiff(diff) {
  if (!conn || !diff.changed) return;

  const dim      = buildDim();
  const jsonStmt = new Map(); // lazily-built per JSON table

  conn.transaction(() => {
    // Upserts
    for (const { table, row } of diff.upserts) {
      const binder = BINDERS[table];
      if (binder) {
        binder(dim[table], row);
      } else {
        if (!jsonStmt.has(table)) {
          jsonStmt.set(table,
            conn.prepare(`INSERT INTO ${table} (id, json) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json`),
          );
        }
        jsonStmt.get(table).run(row.id, JSON.stringify(row));
      }
    }

    // Deletes
    for (const { table, key } of diff.deletes) {
      conn.prepare(deleteSqlFor(table)).run(...deleteArgsFor(table, key));
    }

    // Persist the nextId counter whenever it advanced
    if (nextId !== lastFlushedNextId) {
      conn.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run('nextId', String(nextId));
      lastFlushedNextId = nextId;
    }

    conn.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run('schema_version', String(SCHEMA_VERSION));
  })();

  // Transaction committed — update the cache so the next diff is clean
  for (const { table, key, fp } of diff.upserts) rowCacheFor(table).set(key, fp);
  for (const { table, key }     of diff.deletes) rowCacheFor(table).delete(key);
}

// ============================================================================
// Lifecycle
// ============================================================================

/** Open the database, create the schema, seed on first boot, load into memory. */
function init() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  conn = new Database(DB_PATH);
  conn.pragma('journal_mode = WAL');
  conn.exec(SCHEMA_SQL);

  const { c } = conn.prepare('SELECT COUNT(*) AS c FROM meta').get();
  if (c === 0) _seedDatabase();

  _loadAll();
  buildRowCache();         // cache == disk == memory → first flush is a no-op
  lastFlushedNextId = nextId;
}

/** Insert the hardcoded seed data. Runs only once, on a brand-new database. */
function _seedDatabase() {
  conn.transaction(() => {
    const insStore = conn.prepare('INSERT INTO stores (id, name, address) VALUES (?, ?, ?)');
    for (const s of seedStores) insStore.run(s.id, s.name, s.address);

    const insUser = conn.prepare('INSERT INTO users (id, name, username, role, storeId, disabled, passwordHash) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const u of seedUsers) insUser.run(u.id, u.name, u.username, u.role, u.storeId, u.disabled ? 1 : 0, u.passwordHash);

    const insProduct = conn.prepare('INSERT INTO products (id, name, barcode, price, image) VALUES (?, ?, ?, ?, ?)');
    for (const p of seedProducts) insProduct.run(p.id, p.name, p.barcode, p.price, p.image);

    const insInv = conn.prepare('INSERT INTO inventory (storeId, productId, quantity, threshold) VALUES (?, ?, ?, ?)');
    for (const r of seedInventory) insInv.run(r.storeId, r.productId, r.quantity, r.threshold);

    const insPromo = conn.prepare('INSERT INTO promotions (id, json) VALUES (?, ?)');
    for (const pr of seedPromotions) insPromo.run(pr.id, JSON.stringify(pr));

    conn.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run('schema_version', String(SCHEMA_VERSION));
    conn.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run('nextId', String(nextId));
  })();
}

/** Load every table from SQLite into the runtime arrays (called once by init). */
function _loadAll() {
  stores.splice(0, stores.length,
    ...conn.prepare('SELECT id, name, address FROM stores').all());

  users.splice(0, users.length,
    ...conn.prepare('SELECT id, name, username, role, storeId, disabled, passwordHash FROM users').all()
      .map((r) => ({ ...r, disabled: !!r.disabled })));

  products.splice(0, products.length,
    ...conn.prepare('SELECT id, name, barcode, price, image FROM products').all());

  inventory.splice(0, inventory.length,
    ...conn.prepare('SELECT storeId, productId, quantity, threshold FROM inventory').all());

  for (const table of JSON_TABLES) {
    const col  = COLLECTIONS_BY_TABLE[table];
    const rows = conn.prepare(`SELECT json FROM ${table}`).all().map((r) => JSON.parse(r.json));
    col.splice(0, col.length, ...rows);
  }

  const meta = conn.prepare("SELECT value FROM meta WHERE key = 'nextId'").get();
  nextId = meta ? Number(meta.value) : 1000;
}

/**
 * Unconditional incremental flush — persists only changed rows.
 * Called on SIGTERM/SIGINT by index.js as a best-effort final save.
 */
function flush() {
  if (!conn) return;
  flushDiff(computeDiff());
}

/**
 * Conditional incremental flush — skips ALL SQL work when nothing changed.
 * Called by index.js on every response `finish` event.
 */
function maybeFlush() {
  if (!conn) return;
  const diff = computeDiff();
  if (!diff.changed && nextId === lastFlushedNextId) return;
  flushDiff(diff);
}

// ============================================================================
// Audit + notifications
// ============================================================================

function logAudit({ user, action, resource, storeId, before, after }) {
  auditLogs.push({
    id: id('LOG'),
    userId:   user ? user.id   : null,
    userName: user ? user.name : 'system',
    role:     user ? user.role : 'SYSTEM',
    action,
    resource,
    storeId:  storeId || null,
    before:   before  ?? null,
    after:    after   ?? null,
    createdAt: new Date().toISOString(),
  });
}

function notify(storeId, type, message) {
  notifications.push({ id: id('NOTIF'), storeId, type, message, createdAt: new Date().toISOString(), read: false });
}

// ---- accessors (same names/signatures as before) ---------------------------
const getStore          = (storeId)            => stores.find((s) => s.id === storeId);
const getAllStores       = ()                   => stores;
const getUserByUsername = (username)            => users.find((u) => u.username === username);
const getUserById       = (uid)                 => users.find((u) => u.id === uid);
const getProduct        = (pid)                 => products.find((p) => p.id === pid);
const getAllProducts     = ()                   => products;
const getInventoryRow   = (storeId, productId) => inventory.find((r) => r.storeId === storeId && r.productId === productId);
const getInventoryForStore = (storeId)         => inventory.filter((r) => r.storeId === storeId);

module.exports = {
  id,
  stores, users, products, inventory, promotions, sales,
  stockMovements, stockRequests, transfers, factoryOrders, auditLogs, notifications,
  logAudit, notify,
  getStore, getAllStores, getUserByUsername, getUserById,
  getProduct, getAllProducts, getInventoryRow, getInventoryForStore,

  // ---- persistence surface (used by server/index.js) -----------------------
  init, flush, maybeFlush, DB_PATH,

  // ---- original hardcoded seed data, kept intact ---------------------------
  seed: {
    stores:        seedStores,
    users:         seedUsers,
    products:      seedProducts,
    inventory:     seedInventory,
    promotions:    seedPromotions,
    sales:         seedSales,
    stockMovements:seedStockMovements,
    stockRequests: seedStockRequests,
    transfers:     seedTransfers,
    factoryOrders: seedFactoryOrders,
    auditLogs:     seedAuditLogs,
    notifications: seedNotifications,
  },
};