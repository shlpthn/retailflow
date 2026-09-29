// RetailFlow API smoke/regression test — no external dependencies.
// Boots server/index.js on PORT 3100 (in-memory data), drives it over HTTP,
// and asserts the fixes for: approve-never-strands (Bug 1), strict quantity
// validation (Bug 2), finite non-negative money (Bug 3).
// Run from repo root:  node test/api.smoke.js   (exits 0 on full pass)
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const PORT = 3100;

// Isolated SQLite DB for the test — the seed-based assertions assume a fresh
// database every run, and the persistence section proves new data survives a
// restart of the SAME database file.
const DB_DIR = path.join(ROOT, 'test', '.tmp');
const DB_FILE = path.join(DB_DIR, 'retailflow_smoke.db');
const SERVER_ENV = { ...process.env, PORT: String(PORT), RETAILFLOW_DB_PATH: DB_FILE };

function cleanDbFiles() {
  fs.mkdirSync(DB_DIR, { recursive: true });
  for (const f of [DB_FILE, DB_FILE + '-wal', DB_FILE + '-shm']) {
    try { fs.unlinkSync(f); } catch (e) { /* ignore */ }
  }
}
cleanDbFiles();

function req(method, urlPath, token, body) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const options = { host: 'localhost', port: PORT, path: urlPath, method, headers: { 'Content-Type': 'application/json' } };
    if (token) options.headers.Authorization = 'Bearer ' + token;
    const client = http.request(options, (res) => {
      let out = '';
      res.on('data', (c) => (out += c));
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(out); } catch (e) { /* no/empty body */ }
        resolve({ status: res.statusCode, body: json });
      });
    });
    client.on('error', reject);
    if (data) client.write(data);
    client.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let pass = 0, fail = 0;
  const check = (name, cond, extra) => {
    if (cond) { pass++; console.log('PASS ' + name); }
    else { fail++; console.log('FAIL ' + name + ' :: ' + (extra || '')); }
  };

  const server = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: SERVER_ENV,
  });

  try {
    let ready = false;
    for (let i = 0; i < 40 && !ready; i++) {
      try { const p = await req('GET', '/api/stores'); if (p.status > 0) ready = true; } catch (e) { /* not up yet */ }
      if (!ready) await sleep(250);
    }
    if (!ready) throw new Error('server did not become ready on :' + PORT);

    const login = async (u) => (await req('POST', '/api/auth/login', null, { username: u, password: 'password123' })).body.token;
    const T = { cashier: await login('cashier1'), inv1: await login('inventory1'), inv2: await login('inventory2'), mgr1: await login('manager1'), ho: await login('ho1') };

    // ---- Bug 2: quantity must be finite, whole, positive ----
    let r = await req('POST', '/api/inventory/add-stock', T.inv1, { productId: 'P001', quantity: '1e309' });
    check('add-stock rejects Infinity (1e309)', r.status === 400, r.status + ' ' + JSON.stringify(r.body));
    r = await req('POST', '/api/inventory/add-stock', T.inv1, { productId: 'P001', quantity: 1.5 });
    check('add-stock rejects fraction 1.5', r.status === 400, r.status + ' ' + JSON.stringify(r.body));
    r = await req('POST', '/api/inventory/add-stock', T.inv1, { productId: 'P001', quantity: -3 });
    check('add-stock rejects negative -3', r.status === 400, r.status + ' ' + JSON.stringify(r.body));
    r = await req('POST', '/api/inventory/add-stock', T.inv1, { productId: 'P001', quantity: 5 });
    check('add-stock accepts 5 (qty 40->45)', r.status === 200 && r.body && r.body.quantity === 45, r.status + ' ' + JSON.stringify(r.body));
    r = await req('POST', '/api/inventory/dispatch-stock', T.inv1, { productId: 'P001', quantity: '0x10' });
    check('dispatch-stock rejects hex "0x10"', r.status === 400, r.status + ' ' + JSON.stringify(r.body));
    r = await req('POST', '/api/inventory/dispatch-stock', T.inv1, { productId: 'P001', quantity: 3 });
    check('dispatch-stock accepts 3 (qty 45->42)', r.status === 200 && r.body && r.body.quantity === 42, r.status + ' ' + JSON.stringify(r.body));
    r = await req('POST', '/api/inventory/dispatch-stock', T.inv1, { productId: 'P001', quantity: '2' });
    check('dispatch-stock accepts decimal string "2" (qty 42->40)', r.status === 200 && r.body && r.body.quantity === 40, r.status + ' ' + JSON.stringify(r.body));
    r = await req('POST', '/api/stock-requests', T.mgr1, { productId: 'P001', quantity: '1e309' });
    check('stock-request rejects Infinity', r.status === 400, r.status + ' ' + JSON.stringify(r.body));
    r = await req('POST', '/api/checkout', T.cashier, { items: [{ productId: 'P001', quantity: 1.5 }], paymentMethod: 'CASH' });
    check('checkout rejects fraction qty', r.status === 400, r.status + ' ' + JSON.stringify(r.body));

    // ---- Bug 3 (POST side): finite non-negative money ----
    r = await req('POST', '/api/products', T.ho, { name: 'Socks', barcode: '0006', price: 'abc' });
    check('POST product rejects NaN price', r.status === 400, r.status + ' ' + JSON.stringify(r.body));
    r = await req('POST', '/api/products', T.ho, { name: 'Socks', barcode: '0006', price: 9.5 });
    check('POST product accepts 9.5', r.status === 201 && r.body && r.body.price === 9.5, r.status + ' ' + JSON.stringify(r.body));
    r = await req('POST', '/api/promotions', T.ho, { name: 'BOGO', code: 'BOGO1', type: 'PERCENT', value: '1e309', validFrom: '2026-01-01', validTo: '2026-12-31' });
    check('POST promo rejects Infinity value', r.status === 400, r.status + ' ' + JSON.stringify(r.body));
    r = await req('POST', '/api/promotions', T.ho, { name: 'BOGO', code: 'BOGO1', type: 'BOGO', value: 10, validFrom: '2026-01-01', validTo: '2026-12-31' });
    check('POST promo rejects bad type', r.status === 400, r.status + ' ' + JSON.stringify(r.body));
    r = await req('POST', '/api/promotions', T.ho, { name: 'BOGO', code: 'BOGO1', type: 'PERCENT', value: 10, validFrom: '2026-01-01', validTo: '2026-12-31' });
    check('POST promo accepts valid promo', r.status === 201 && r.body && r.body.value === 10, r.status + ' ' + JSON.stringify(r.body));

// ---- Bug 1: approve must not strand requests ----
    r = await req('POST', '/api/stock-requests', T.mgr1, { productId: 'P001', quantity: 2, note: 'smoke' });
    const reqId = r.body && r.body.id;
    check('stock request created (201)', r.status === 201 && !!reqId, r.status + ' ' + JSON.stringify(r.body));
    const list = async () => (await req('GET', '/api/stock-requests', T.ho)).body;
    const findReq = (items) => (items || []).find((x) => x.id === reqId) || {};

    r = await req('POST', '/api/stock-requests/' + reqId + '/approve', T.ho, { fulfillmentType: 'TRANSFER' });
    check('approve without sourceStoreId -> 400', r.status === 400, r.status + ' ' + JSON.stringify(r.body));
    check('request still REQUESTED after bad approve', findReq(await list()).status === 'REQUESTED', JSON.stringify(findReq(await list())));

    r = await req('POST', '/api/stock-requests/' + reqId + '/approve', T.ho, { fulfillmentType: 'TRANSFER', sourceStoreId: 'STORE_999' });
    check('approve unknown source store -> 404', r.status === 404, r.status + ' ' + JSON.stringify(r.body));
    check('request still REQUESTED after unknown-store approve', findReq(await list()).status === 'REQUESTED', JSON.stringify(findReq(await list())));

    r = await req('POST', '/api/stock-requests/' + reqId + '/approve', T.ho, { fulfillmentType: 'TRANSFER', sourceStoreId: 'STORE_002' });
    check('approve valid transfer -> 200', r.status === 200, r.status + ' ' + JSON.stringify(r.body));
    const afterApprove = findReq(await list());
    check('request reached FULFILLMENT_PENDING', afterApprove.status === 'FULFILLMENT_PENDING', JSON.stringify(afterApprove));
    const transferId = afterApprove.fulfillment && afterApprove.fulfillment.transferId;
    check('transfer was created', !!transferId, JSON.stringify(afterApprove.fulfillment));

    // regression: lifecycle still completes end-to-end after the approve reorder
    r = await req('POST', '/api/transfers/' + transferId + '/dispatch', T.inv2);
    check('transfer dispatch (source store staff) ok', r.status === 200 && r.body && r.body.status === 'IN_TRANSIT', r.status + ' ' + JSON.stringify(r.body));
    r = await req('POST', '/api/transfers/' + transferId + '/receive', T.inv1);
    check('transfer receive (dest store staff) ok', r.status === 200 && r.body && r.body.status === 'COMPLETED', r.status + ' ' + JSON.stringify(r.body));
    check('stock request COMPLETED after receive', findReq(await list()).status === 'COMPLETED', JSON.stringify(findReq(await list())));

//__END__
    // ---- Database persistence: NEW data must survive a full server restart ----
    r = await req('POST', '/api/products', T.ho, { name: 'Persisted Socks', barcode: '9001', price: 3 });
    const persistedProductId = r.body && r.body.id;
    check('persistence: product created pre-restart', r.status === 201 && !!persistedProductId, r.status + ' ' + JSON.stringify(r.body));
    r = await req('POST', '/api/checkout', T.cashier, { items: [{ productId: 'P001', quantity: 1 }], paymentMethod: 'CASH' });
    const persistedSaleId = r.body && r.body.receipt && r.body.receipt.id;
    check('persistence: sale created pre-restart', r.status === 201 && !!persistedSaleId, r.status + ' ' + JSON.stringify(r.body));

    // Hard-restart the server against the SAME database file — like `npm start`
    // again. (The response hook has already flushed each change to SQLite.)
    try { server.kill(); } catch (e) {}
    await sleep(600);

    let server2 = null;
    try {
      server2 = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: SERVER_ENV });
      let ready2 = false;
      for (let i = 0; i < 40 && !ready2; i++) {
        try { const p = await req('GET', '/api/stores'); if (p.status > 0) ready2 = true; } catch (e) { /* not up yet */ }
        if (!ready2) await sleep(250);
      }
      if (!ready2) throw new Error('server did not come back up after restart');

      const ho2 = await login('ho1');
      const cashier2 = await login('cashier1');

      const products2 = await req('GET', '/api/products', ho2);
      check('persistence: product survived restart', (products2.body || []).some((p) => p.id === persistedProductId && p.name === 'Persisted Socks'), JSON.stringify(products2.body));

      const sales2 = await req('GET', '/api/sales', cashier2);
      check('persistence: sale survived restart', ((sales2.body && sales2.body.sales) || []).some((s) => s.id === persistedSaleId), JSON.stringify(sales2.body));

      const stores2 = await req('GET', '/api/stores', ho2);
      check('persistence: seed data still intact after restart', (stores2.body || []).length === 2, JSON.stringify(stores2.body));

      r = await req('POST', '/api/products', ho2, { name: 'Post Restart Socks', barcode: '9002', price: 4 });
      check('persistence: nextId continues, no id collision', r.status === 201 && r.body && r.body.id !== persistedProductId, r.status + ' ' + JSON.stringify(r.body));
    } finally {
      try { if (server2) server2.kill(); } catch (e) {}
    }

    console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
  } catch (e) {
    console.log('SCRIPT ERROR: ' + e.message);
    fail += 1;
  } finally {
    try { server.kill(); } catch (e) {}
    cleanDbFiles();
    process.exit(fail ? 1 : 0);
  }
})();