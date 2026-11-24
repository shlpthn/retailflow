'use strict';
// Shared prerequisite text and business helpers for the QC catalog.
const { show } = require('../lib/harness');

// ---- prerequisite wording (step 0 of every test case) ----------------------
const FRESH = 'Fresh demo data: stop the app, delete data/retailflow.db, start it again (npm start) and open http://localhost:3000. '
  + 'Demo users, password "password123": cashier1 (Cashier, Downtown Store), inventory1 (Inventory Staff, Downtown), manager1 (Store Manager, Downtown), '
  + 'inventory2 and manager2 (Uptown Store), ho1 (Head Office Manager), admin1 (System Admin).';
const API = 'API client (e.g. Postman) at http://localhost:3000 with a bearer token per user, obtained from POST /api/auth/login {"username","password"}.';
const STOCK = 'Demo stock — Downtown: Classic T-Shirt (barcode 0001, price 15) 40, Denim Jeans (0002, 45) 8, Running Sneakers (0003, 65) 22, Rain Jacket (0004, 80) 3, Baseball Cap (0005, 12) 50. '
  + 'Uptown: T-Shirt 30, Denim Jeans 25, Sneakers 5, Rain Jacket 18, Cap 40. Minimum levels: T-Shirt 15, Rain Jacket 5, others 10.';
const PROMO_SEED = 'Demo promotion "Autumn 10% Off" (code SAVE10, 10 %) is active 2026-01-01 … 2026-12-31.';
const PRE_EXPECT = 'Application running with the demo data; every listed user can sign in.';

const pre = (...extra) => [FRESH, ...extra].join(' ');

// ---- prerequisite bullets (step 0 is rendered as "We need:" followed by these) --------
const USERS = {
  cashier1: 'Cashier, Downtown Store', inventory1: 'Inventory Staff, Downtown Store', manager1: 'Store Manager, Downtown Store',
  inventory2: 'Inventory Staff, Uptown Store', manager2: 'Store Manager, Uptown Store', ho1: 'Head Office Manager', admin1: 'System Admin',
};
const PRODUCTS = {
  'Classic T-Shirt': ['0001', 15], 'Denim Jeans': ['0002', 45], 'Running Sneakers': ['0003', 65], 'Rain Jacket': ['0004', 80], 'Baseball Cap': ['0005', 12],
};
const who = (u) => `${u} (${USERS[u] || 'see below'})`;
const listOf = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
/** Collect prerequisite bullets (flattens nested arrays, drops empties). */
const need = (...items) => items.flat().filter(Boolean);
const FRESH_DATA = 'A fresh copy of the demo data: stop the app, delete data/retailflow.db and start it again with npm start. Every demo account uses the password "password123".';
const signedIn = (u, screen) => `The user ${who(u)} signed in${screen ? ` on the ${screen} screen` : ''}.`;
const accounts = (...us) => `The demo account${us.length > 1 ? 's' : ''} ${listOf(us.map(who))}.`;
/** stock('Downtown', ['Rain Jacket', 3], ['Classic T-Shirt', 40, 15]) — optional third value = minimum level. */
const stock = (store, ...items) => {
  const one = ([name, qty, min]) => `${qty} × ${name} (barcode ${PRODUCTS[name][0]}, price ${PRODUCTS[name][1]}${min != null ? `, minimum level ${min}` : ''})`;
  return `${store} Store has ${listOf(items.map(one))} in stock.`;
};
const API_CLIENT = 'An API client such as Postman, with a login token for each user involved (POST /api/auth/login with the username and password).';
const PROMO_ON = 'The demo promotion "Autumn 10% Off" (code SAVE10, 10 %) is active — valid from 2026-01-01 to 2026-12-31.';
const PROMO_OFF = 'No promotion is active: ho1 has ended the demo promotion "Autumn 10% Off" (code SAVE10) early.';
const READY = 'Everything listed above is in place.';

// ---- sales helpers -----------------------------------------------------------
const history = async (ctx, user, query = '') => (await ctx.as(user).get(`/api/sales/history${query ? '?' + query : ''}`));
const historyIds = (r) => ((r.body && (r.body.transactions || r.body.sales)) || []).map((s) => s.id);
const receiptsOf = async (ctx, storeId) => (await ctx.as('ho1').get(`/api/sales/history?storeId=${storeId}&limit=100`)).body.transactions;

// ---- RF-08 helpers (current API: /api/stock-requests, /api/transfers) -----------
const RF08 = {
  requests: '/api/stock-requests',
  cancelRequest: (id) => `/api/stock-requests/${id}/cancel`,
  closeRequest: (id) => `/api/stock-requests/${id}/close`,
  availability: (id) => `/api/stock-requests/${id}/availability`,
  issue: (id) => `/api/stock-requests/${id}/approve`,
  reject: (id) => `/api/stock-requests/${id}/reject`,
  orders: '/api/transfers',
  dispatch: (id) => `/api/transfers/${id}/dispatch`,
  receive: (id) => `/api/transfers/${id}/receive`,
  cancelOrder: (id) => `/api/transfers/${id}/cancel`,
  unfulfillable: (id) => `/api/transfers/${id}/unfulfillable`,
  adjust: '/api/inventory/adjust',
};
// Current status names → BA enums (the raw names are checked in TC-08.8-03).
const REQ_STATUS = { REQUESTED: 'SUBMITTED', UNDER_REVIEW: 'SUBMITTED', FULFILLMENT_PENDING: 'IN_PROGRESS' };
const ORD_STATUS = { PENDING_DISPATCH: 'ISSUED', COMPLETED: 'RECEIVED' };
const nReq = (s) => REQ_STATUS[s] || s;
const nOrd = (s) => ORD_STATUS[s] || s;

async function submitRequest(ctx, lines, user = 'manager1', extra = {}) {
  const [first] = lines;
  return ctx.as(user).post(RF08.requests, {
    productId: first[0], quantity: first[1],
    lines: lines.map(([productId, quantity]) => ({ productId, quantity })), ...extra,
  });
}
async function getRequest(ctx, id, user = 'ho1') {
  return ((await ctx.as(user).get(RF08.requests)).body || []).find((x) => x.id === id);
}
async function issueOrder(ctx, req, sourceStoreId = 'STORE_002', qty) {
  const q = qty == null ? req.quantity : qty;
  return ctx.as('ho1').post(RF08.issue(req.id), {
    fulfillmentType: 'TRANSFER', sourceStoreId,
    allocations: [{ sourceStoreId, lines: [{ productId: req.productId, quantity: q }] }],
  });
}
async function ordersFor(ctx, reqId, user = 'ho1') {
  return ((await ctx.as(user).get(RF08.orders)).body || []).filter((o) => o.stockRequestId === reqId);
}
/** Request Denim Jeans x qty for Downtown and issue it to Uptown. */
async function issuedOrder(ctx, qty = 10, product = 'P002') {
  const req = (await submitRequest(ctx, [[product, qty]])).body;
  const r = await issueOrder(ctx, req);
  if (r.status !== 200) throw new Error('setup: issue failed ' + show(r));
  const [order] = await ordersFor(ctx, req.id);
  return { req, order };
}
async function inTransitOrder(ctx, qty = 10, product = 'P002') {
  const x = await issuedOrder(ctx, qty, product);
  const r = await ctx.as('inventory2').post(RF08.dispatch(x.order.id));
  if (r.status !== 200) throw new Error('setup: dispatch failed ' + show(r));
  return x;
}
/** Third active store with Denim Jeans stock (admin creates store + inventory user, staff receives goods). */
async function thirdStore(ctx, p002 = 20) {
  const s = (await ctx.as('admin1').post('/api/stores', { name: 'QC Store 3', address: 'QC' })).body;
  await ctx.createUser('inventory3', 'INVENTORY_STAFF', s.id);
  if (p002) await ctx.as('inventory3').post('/api/inventory/add-stock', { productId: 'P002', quantity: p002, note: 'QC seed' });
  return s.id;
}
const missingRoute = (r) => r.status === 404;

// ---- RF-09 helpers --------------------------------------------------------------
const PROMO = { list: '/api/promotions', endEarly: (id) => `/api/promotions/${id}/end`, seed: { id: 'PROMO001', name: 'Autumn 10% Off', code: 'SAVE10' } };
const DAY = 86400000;
const at = (ms) => new Date(Date.now() + ms).toISOString();
const isoDay = (n) => new Date(Date.now() + n * DAY).toISOString().slice(0, 10);
async function createPromo(ctx, { name = 'QC promo', code = 'QC' + Math.floor(Math.random() * 1e6), percent = 15, from = -1, to = 10, startAt, endAt, extra = {} } = {}, user = 'ho1') {
  const s = startAt || at(from * DAY); const e = endAt || at(to * DAY);
  return ctx.as(user).post(PROMO.list, {
    name, code, type: 'PERCENT', value: percent, discountPercent: percent,
    validFrom: s.slice(0, 10), validTo: e.slice(0, 10), startAt: s, endAt: e, ...extra,
  });
}
/** BA "End early"; falls back to PUT active:false so dependent cases can still run. */
async function endEarly(ctx, id) {
  const r = await ctx.as('ho1').post(PROMO.endEarly(id), {});
  if (r.status !== 404) return r;
  return ctx.as('ho1').put(`${PROMO.list}/${id}`, { active: false, status: 'INACTIVE' });
}
const promoById = async (ctx, id) => ((await ctx.as('ho1').get(PROMO.list)).body || []).find((p) => p.id === id);
const sellWithCode = (ctx, items, code, extra = {}, user = 'cashier1') => ctx.checkout(items, { promotionCode: code, ...extra }, user);

// ---- RF-10 helpers --------------------------------------------------------------
const REPORT = { sales: '/api/reports/sales', bestSellers: '/api/reports/best-sellers', stock: '/api/reports/stock', transfers: '/api/reports/transfers', audit: '/api/audit-logs' };
/** Sales report; falls back to today's report data (GET /api/sales summary) while the report API is missing. */
async function salesReport(ctx, user, query = '') {
  const r = await ctx.as(user).get(`${REPORT.sales}${query ? '?' + query : ''}`);
  if (r.status !== 404) return { ...r, source: 'report', data: r.body };
  const f = await ctx.as(user).get(`/api/sales${query ? '?' + query : ''}`);
  const s = f.body && f.body.summary;
  return {
    status: f.status, source: 'Sales screen data', body: f.body,
    data: s && { receiptCount: s.transactions, netRevenue: s.revenue, grossRevenue: s.grossRevenue, totalDiscount: s.totalDiscount, averageReceiptValue: s.averageReceiptValue, buckets: s.trend, bestSellers: s.bestSellers, storeId: f.body.storeId },
  };
}
async function historyTotals(ctx, storeId) {
  const h = (await ctx.as('ho1').get(`/api/sales/history?storeId=${storeId}&limit=100`)).body;
  return { count: h.totalCount, revenue: h.transactions.reduce((a, s) => a + s.total, 0) };
}
/** 3 sales at Downtown (199) by cashier1, 2 at Uptown (310) by cashier2. */
async function seedSales(ctx) {
  await ctx.createUser('cashier2', 'CASHIER', 'STORE_002');
  for (const it of [[['P001', 2]], [['P003', 1], ['P005', 2]], [['P004', 1]]]) await ctx.checkout(it);
  for (const it of [[['P002', 3]], [['P004', 2], ['P001', 1]]]) await ctx.checkout(it, {}, 'cashier2');
}
const num = (v) => Math.round(v * 100) / 100;

module.exports = {
  FRESH, API, STOCK, PROMO_SEED, PRE_EXPECT, pre,
  need, FRESH_DATA, signedIn, accounts, stock, API_CLIENT, PROMO_ON, PROMO_OFF, READY,
  history, historyIds, receiptsOf,
  RF08, nReq, nOrd, submitRequest, getRequest, issueOrder, ordersFor, issuedOrder, inTransitOrder, thirdStore, missingRoute,
  PROMO, DAY, at, isoDay, createPromo, endEarly, promoById, sellWithCode,
  REPORT, salesReport, historyTotals, seedSales, num,
};
