'use strict';
// ============================================================================
// QC harness — boots an isolated RetailFlow server per test case (fresh
// seeded SQLite file), exposes per-role API clients and helpers for stock
// integrity checks. No external dependencies.
// ============================================================================
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const TMP = path.join(ROOT, 'qc', '.tmp');

// Seed accounts (server/db.js). Password is the same for all.
const USERS = {
  cashier1: 'STORE_001', inventory1: 'STORE_001', inventory2: 'STORE_002',
  manager1: 'STORE_001', manager2: 'STORE_002', ho1: null, admin1: null,
};
const PASSWORD = 'password123';

// Seed stock snapshot — the baseline the integrity checks reconcile against.
const SEED_STOCK = {
  STORE_001: { P001: 40, P002: 8, P003: 22, P004: 3, P005: 50 },
  STORE_002: { P001: 30, P002: 25, P003: 5, P004: 18, P005: 40 },
};
const SEED_MIN = { P001: 15, P002: 10, P003: 10, P004: 5, P005: 10 };

// Sign of each stock movement type on on-hand quantity. DISPATCH is the
// legacy ad-hoc dispatch (not a BA movement type) but it does move stock.
const MOVEMENT_SIGN = { RECEIVE: 1, TRANSFER_IN: 1, ADJUST: 1, SALE: -1, TRANSFER_OUT: -1, DISPATCH: -1 };

// ---- result signalling -----------------------------------------------------
class CheckFailed extends Error {}
class Blocked extends Error {}

/** Fail the case with a description of what actually happened. */
function check(cond, actual) {
  if (!cond) throw new CheckFailed(typeof actual === 'string' ? actual : JSON.stringify(actual));
}
/** The case cannot be executed (missing prerequisite feature / endpoint). */
function blocked(reason) { throw new Blocked(reason); }

const short = (v, n = 220) => {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s && s.length > n ? s.slice(0, n) + '…' : s;
};
/** Compact "HTTP <status> <body>" for actual-result text. */
const show = (r) => {
  // Express' default 404 is an HTML page — reduce it to "no such route".
  if (typeof r.body === 'string' && /Cannot (GET|POST|PUT|PATCH|DELETE)/.test(r.body)) {
    const m = r.body.match(/Cannot (\w+) ([^<\s]+)/);
    return `HTTP ${r.status} (route does not exist: ${m[1]} ${m[2]})`;
  }
  const b = r.body;
  if (b && typeof b === 'object' && !Array.isArray(b)) {
    if (b.error) return `HTTP ${r.status} "${b.error}"`;
    if (b.receipt) return `HTTP ${r.status} (receipt ${b.receipt.id} created, total ${b.receipt.total}, method ${b.receipt.paymentMethod})`;
    if (b.id && b.status) return `HTTP ${r.status} (${b.id} status ${b.status})`;
  }
  return `HTTP ${r.status} ${short(b)}`;
};

// ---- HTTP ------------------------------------------------------------------
function request(port, method, urlPath, token, body) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    const r = http.request({ host: '127.0.0.1', port, path: urlPath, method, headers }, (res) => {
      let out = '';
      res.on('data', (c) => (out += c));
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(out); } catch (e) { json = out || null; }
        resolve({ status: res.statusCode, body: json });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- server lifecycle ------------------------------------------------------
class Server {
  constructor(port, dbFile) {
    this.port = port;
    this.dbFile = dbFile;
    this.proc = null;
    this.log = '';
  }

  static wipe(dbFile) {
    for (const f of [dbFile, dbFile + '-wal', dbFile + '-shm']) {
      try { fs.unlinkSync(f); } catch (e) { /* not there */ }
    }
  }

  async start() {
    this.proc = spawn(process.execPath, ['server/index.js'], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(this.port), RETAILFLOW_DB_PATH: this.dbFile },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.proc.stdout.on('data', (d) => (this.log += d));
    this.proc.stderr.on('data', (d) => (this.log += d));
    for (let i = 0; i < 100; i++) {
      if (this.proc.exitCode !== null) throw new Error('server exited during boot:\n' + this.log);
      try {
        const r = await request(this.port, 'GET', '/api/auth/stores');
        if (r.status === 200) return;
      } catch (e) { /* not listening yet */ }
      await sleep(50);
    }
    throw new Error('server did not become ready:\n' + this.log);
  }

  get alive() { return this.proc && this.proc.exitCode === null; }

  async stop() {
    if (!this.proc || this.proc.exitCode !== null) return;
    const exited = new Promise((r) => this.proc.once('exit', r));
    this.proc.kill('SIGTERM'); // index.js flushes to SQLite on SIGTERM
    await Promise.race([exited, sleep(3000)]);
    if (this.proc.exitCode === null) this.proc.kill('SIGKILL');
  }
}

// ---- per-case context ------------------------------------------------------
class Context {
  constructor(server) {
    this.server = server;
    this.tokens = {};
  }

  async token(username) {
    if (!this.tokens[username]) {
      const r = await request(this.server.port, 'POST', '/api/auth/login', null, { username, password: PASSWORD });
      if (r.status !== 200) throw new Error(`login ${username} failed: ${show(r)}`);
      this.tokens[username] = r.body.token;
    }
    return this.tokens[username];
  }

  /** API client acting as `username` (or anonymous when null). */
  as(username) {
    const call = async (method, p, body) => {
      const t = username ? await this.token(username) : null;
      return request(this.server.port, method, p, t, body);
    };
    return {
      get: (p) => call('GET', p),
      post: (p, b) => call('POST', p, b === undefined ? {} : b),
      put: (p, b) => call('PUT', p, b === undefined ? {} : b),
      patch: (p, b) => call('PATCH', p, b === undefined ? {} : b),
      del: (p) => call('DELETE', p),
      raw: (method, p, token, b) => request(this.server.port, method, p, token, b),
    };
  }

  /** Restart the same database file (persistence checks). Tokens stay valid. */
  async restart() {
    await this.server.stop();
    await this.server.start();
  }

  // ---- domain helpers (go through the API as a privileged reader) --------

  /** On-hand quantity of productId at storeId (read as HO Manager). */
  async stock(storeId, productId) {
    const r = await this.as('ho1').get(`/api/inventory?storeId=${storeId}`);
    if (r.status !== 200) throw new Error('inventory read failed: ' + show(r));
    const row = r.body.rows.find((x) => x.productId === productId);
    return row ? row.quantity : undefined;
  }

  async stockMap(storeId) {
    const r = await this.as('ho1').get(`/api/inventory?storeId=${storeId}`);
    if (r.status !== 200) throw new Error('inventory read failed: ' + show(r));
    const m = {};
    for (const row of r.body.rows) m[row.productId] = row.quantity;
    return m;
  }

  async movements(storeId) {
    const r = await this.as('ho1').get(`/api/inventory/movements?storeId=${storeId}`);
    if (r.status !== 200) throw new Error('movements read failed: ' + show(r));
    return r.body;
  }

  async audit() {
    const r = await this.as('ho1').get('/api/audit-logs');
    if (r.status !== 200) throw new Error('audit read failed: ' + show(r));
    return r.body;
  }

  async stores() {
    return (await this.as('ho1').get('/api/stores')).body.map((s) => s.id);
  }

  /**
   * Reconcile every (store, product): seed qty + Σ signed movements must equal
   * current on-hand, and on-hand must be a finite integer ≥ 0. Returns the
   * list of mismatches (empty = consistent).
   */
  async reconcile() {
    const problems = [];
    for (const storeId of await this.stores()) {
      const current = await this.stockMap(storeId);
      const movs = await this.movements(storeId);
      const delta = {};
      for (const m of movs) {
        const sign = MOVEMENT_SIGN[m.type];
        if (sign === undefined) { problems.push(`${storeId}: unknown movement type ${m.type}`); continue; }
        delta[m.productId] = (delta[m.productId] || 0) + sign * m.quantity;
      }
      for (const [pid, qty] of Object.entries(current)) {
        const base = (SEED_STOCK[storeId] || {})[pid] || 0;
        const expected = base + (delta[pid] || 0);
        if (typeof qty !== 'number' || !Number.isInteger(qty) || qty < 0) problems.push(`${storeId}/${pid}: invalid on-hand ${JSON.stringify(qty)}`);
        else if (qty !== expected) problems.push(`${storeId}/${pid}: on-hand ${qty} ≠ seed ${base} + movements ${delta[pid] || 0}`);
      }
    }
    return problems;
  }

  /** Cashier checkout through the current API (POST /api/checkout). */
  checkout(items, extra = {}, user = 'cashier1') {
    return this.as(user).post('/api/checkout', {
      items: items.map(([productId, quantity]) => ({ productId, quantity })),
      paymentMethod: 'CASH',
      ...extra,
    });
  }

  /** Create a store-level user through the Admin API and return its username. */
  async createUser(username, role, storeId) {
    const r = await this.as('admin1').post('/api/users', { name: username, username, password: PASSWORD, role, storeId });
    if (r.status !== 201) throw new Error('create user failed: ' + show(r));
    return username;
  }
}

module.exports = {
  ROOT, TMP, USERS, PASSWORD, SEED_STOCK, SEED_MIN, MOVEMENT_SIGN,
  CheckFailed, Blocked, check, blocked, show, short, sleep,
  request, Server, Context,
};
