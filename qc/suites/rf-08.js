'use strict';
// RF-08 — HO-coordinated stock transfer (Sprint 4)
// BA mapping: US-08.1..08.8, BR-12..15, BR-20..22, FR-TRF-01..14, SD-03, ST-01, ST-02, activity 8.5, NFR-05/06/07.
//
// Endpoints under test today: /api/stock-requests (+/approve, /reject) and /api/transfers (+/dispatch, /receive).
// BA actions with no endpoint yet are called at the paths in PATHS below (named after the existing
// resources, mirroring SD-03). If Dev ships different paths, update PATHS only.
const { check, blocked, show } = require('../lib/harness');

const S = { sprint: 'S4', backlog: 'RF-08' };
const PATHS = {
  requests: '/api/stock-requests',
  cancelRequest: (id) => `/api/stock-requests/${id}/cancel`,
  closeRequest: (id) => `/api/stock-requests/${id}/close`,
  availability: (id) => `/api/stock-requests/${id}/availability`,
  issue: (id) => `/api/stock-requests/${id}/approve`, // BA: POST /replenishment-requests/:id/orders
  reject: (id) => `/api/stock-requests/${id}/reject`,
  orders: '/api/transfers',
  dispatch: (id) => `/api/transfers/${id}/dispatch`,
  receive: (id) => `/api/transfers/${id}/receive`,
  cancelOrder: (id) => `/api/transfers/${id}/cancel`,
  unfulfillable: (id) => `/api/transfers/${id}/unfulfillable`,
  adjust: '/api/inventory/adjust',
};

// Current status names → BA enums (ST-01 / ST-02). TC-RF08-056 checks the raw names.
const REQ_STATUS = { REQUESTED: 'SUBMITTED', UNDER_REVIEW: 'SUBMITTED', FULFILLMENT_PENDING: 'IN_PROGRESS' };
const ORD_STATUS = { PENDING_DISPATCH: 'ISSUED', COMPLETED: 'RECEIVED' };
const nReq = (s) => REQ_STATUS[s] || s;
const nOrd = (s) => ORD_STATUS[s] || s;

const PRE = 'Fresh seed DB. Destination STORE_001 (manager1, inventory1); source STORE_002 (manager2, inventory2). P002: STORE_001=8, STORE_002=25 (min 10).';

// ---- flow helpers (send current API fields AND BA-shaped fields) ----------
async function submit(ctx, lines, user = 'manager1', extra = {}) {
  const [first] = lines;
  return ctx.as(user).post(PATHS.requests, {
    productId: first[0], quantity: first[1],
    lines: lines.map(([productId, quantity]) => ({ productId, quantity })),
    ...extra,
  });
}
async function getRequest(ctx, id, user = 'ho1') {
  const r = await ctx.as(user).get(PATHS.requests);
  return (r.body || []).find((x) => x.id === id);
}
async function issue(ctx, req, sourceStoreId = 'STORE_002', qty) {
  const q = qty == null ? req.quantity : qty;
  return ctx.as('ho1').post(PATHS.issue(req.id), {
    fulfillmentType: 'TRANSFER', sourceStoreId,
    allocations: [{ sourceStoreId, lines: [{ productId: req.productId, quantity: q }] }],
  });
}
async function ordersFor(ctx, reqId, user = 'ho1') {
  const r = await ctx.as(user).get(PATHS.orders);
  return (r.body || []).filter((o) => o.stockRequestId === reqId);
}
/** Submit P002 x qty from manager1 and issue it to STORE_002. Returns { req, order }. */
async function issuedOrder(ctx, qty = 10) {
  const req = (await submit(ctx, [['P002', qty]])).body;
  const r = await issue(ctx, req);
  if (r.status !== 200) throw new Error('setup: issue failed ' + show(r));
  const [order] = await ordersFor(ctx, req.id);
  return { req, order };
}
async function inTransitOrder(ctx, qty = 10) {
  const x = await issuedOrder(ctx, qty);
  const r = await ctx.as('inventory2').post(PATHS.dispatch(x.order.id));
  if (r.status !== 200) throw new Error('setup: dispatch failed ' + show(r));
  return x;
}
/** Third active store with stock of P002 (admin creates store + inventory user, staff receives goods). */
async function thirdStore(ctx, p002 = 20) {
  const s = (await ctx.as('admin1').post('/api/stores', { name: 'QC Store 3', address: 'QC' })).body;
  await ctx.createUser('inventory3', 'INVENTORY_STAFF', s.id);
  if (p002) await ctx.as('inventory3').post('/api/inventory/add-stock', { productId: 'P002', quantity: p002, note: 'QC seed' });
  return s.id;
}
/** Call an endpoint the BA requires; 404 ⇒ the feature is missing. */
const missing = (r) => r.status === 404;

module.exports = [
  // =============================================================== US-08.1
  {
    ...S, id: 'TC-RF08-001', trace: 'US-08.1 AC1, AC3, BR-13, FR-TRF-01', area: 'Submit request',
    title: 'Store Manager submits a replenishment request for the active store',
    type: 'Functional', priority: 'High', pre: PRE,
    steps: ['manager1 submits P002 x10', 'manager1 submits P004 x5', 'HO reads the queue', 'Read P002 stock at both stores'],
    data: 'P002 x10, P004 x5',
    expected: 'Both 201 with unique numbers, status SUBMITTED, destination STORE_001, visible in HO queue; no stock change.',
    auto: async (ctx) => {
      const a = await submit(ctx, [['P002', 10]]); const b = await submit(ctx, [['P004', 5]]);
      check(a.status === 201 && b.status === 201 && a.body.id !== b.body.id, `${show(a)} / ${show(b)}`);
      check(nReq(a.body.status) === 'SUBMITTED' && a.body.storeId === 'STORE_001', a.body);
      const queue = (await ctx.as('ho1').get(PATHS.requests)).body.map((x) => x.id);
      const s1 = await ctx.stock('STORE_001', 'P002'); const s2 = await ctx.stock('STORE_002', 'P002');
      check(queue.includes(a.body.id) && queue.includes(b.body.id) && s1 === 8 && s2 === 25, `queue ${queue}; P002 ${s1}/${s2}`);
      return `201 ×2 (${a.body.id}, ${b.body.id}), SUBMITTED, in HO queue, stock unchanged`;
    },
  },
  {
    ...S, id: 'TC-RF08-002', trace: 'US-08.1 AC1, FR-TRF-01, D-06', area: 'Submit request',
    title: 'A request can contain several product lines',
    type: 'Functional', priority: 'High', pre: PRE,
    steps: ['manager1 submits lines P002 x10 and P004 x5 in one request', 'Read the request'],
    data: 'lines: [P002 10, P004 5]',
    expected: 'One request with 2 lines (P002 10, P004 5).',
    auto: async (ctx) => {
      const r = await submit(ctx, [['P002', 10], ['P004', 5]]);
      check(r.status === 201, show(r));
      const lines = r.body.lines || [];
      check(lines.length === 2 && lines.some((l) => l.productId === 'P004' && l.quantity === 5), `request ${r.body.id} stored without lines[]; only productId ${r.body.productId} qty ${r.body.quantity} kept (P004 line dropped)`);
      return '2 lines stored';
    },
  },
  {
    ...S, id: 'TC-RF08-003', trace: 'US-08.1 AC1, BR-13', area: 'Submit request',
    title: 'A request never carries a source store (field in the body is ignored or rejected)',
    type: 'Functional', priority: 'Medium', pre: PRE,
    steps: ['manager1 submits P002 x10 with body sourceStoreId = STORE_002'],
    data: 'sourceStoreId STORE_002',
    expected: 'Either 400, or 201 with no source store stored on the request.',
    auto: async (ctx) => {
      const r = await submit(ctx, [['P002', 10]], 'manager1', { sourceStoreId: 'STORE_002' });
      const stored = r.status === 201 ? JSON.stringify(r.body) : '';
      check(r.status === 400 || (r.status === 201 && !stored.includes('STORE_002')), show(r));
      return `${r.status}; no source store on request`;
    },
  },
  {
    ...S, id: 'TC-RF08-004', trace: 'US-08.1 AC1, BR-02, BR-13', area: 'Submit request',
    title: 'Destination is always the manager’s active store (body storeId cannot redirect it)',
    type: 'Security', priority: 'High', pre: PRE,
    steps: ['manager1 submits P002 x10 with body storeId = STORE_002'],
    data: 'storeId STORE_002',
    expected: 'Request destination is STORE_001 (or 403).',
    auto: async (ctx) => {
      const r = await submit(ctx, [['P002', 10]], 'manager1', { storeId: 'STORE_002', destStoreId: 'STORE_002' });
      check(r.status === 403 || (r.status === 201 && r.body.storeId === 'STORE_001'), show(r));
      return `${r.status}; destination ${r.body && r.body.storeId}`;
    },
  },
  {
    ...S, id: 'TC-RF08-005', trace: 'US-08.1 AC1, BR-13', area: 'Validation',
    title: 'Quantity must be a positive integer (0, -1, 1.5, 1e309 rejected)',
    type: 'Negative', priority: 'High', pre: PRE,
    steps: ['manager1 submits P002 with quantity 0, -1, 1.5, 1e309 (four requests)'],
    data: '0, -1, 1.5, "1e309" (sent as string — JSON cannot encode Infinity)',
    expected: 'HTTP 400 for all four; no request created.',
    auto: async (ctx) => {
      const st = [];
      for (const q of [0, -1, 1.5, '1e309']) st.push((await submit(ctx, [['P002', q]])).status);
      const n = (await ctx.as('ho1').get(PATHS.requests)).body.length;
      check(st.every((s) => s === 400) && n === 0, `statuses ${st.join(', ')}; requests created ${n}`);
      return '400 ×4';
    },
  },
  {
    ...S, id: 'TC-RF08-006', trace: 'US-08.1 AC1', area: 'Validation',
    title: 'Unknown product is rejected',
    type: 'Negative', priority: 'Medium', pre: PRE,
    steps: ['manager1 submits PXXX x5'], data: 'PXXX',
    expected: 'HTTP 404/400; no request created.',
    auto: async (ctx) => {
      const r = await submit(ctx, [['PXXX', 5]]);
      check(r.status === 404 || r.status === 400, show(r));
      return show(r);
    },
  },
  {
    ...S, id: 'TC-RF08-007', trace: 'US-08.1 AC1, BR-04', area: 'Validation',
    title: 'Inactive product cannot be requested',
    type: 'Negative', priority: 'Medium', pre: PRE + ' ho1 sets P002 status INACTIVE.',
    steps: ['HO PUT /products/P002 {status: INACTIVE}', 'manager1 submits P002 x10'], data: 'P002 INACTIVE',
    expected: 'HTTP 4xx; no request created.',
    auto: async (ctx) => {
      await ctx.as('ho1').put('/api/products/P002', { status: 'INACTIVE' });
      const r = await submit(ctx, [['P002', 10]]);
      check(r.status >= 400 && r.status < 500, show(r));
      return show(r);
    },
  },
  {
    ...S, id: 'TC-RF08-008', trace: 'US-08.1 AC4, §2.2 TRANSFER_REQUEST_CREATE', area: 'Authorization',
    title: 'Only Store Manager can create requests (Inventory Staff, Cashier, HO, Admin get 403)',
    type: 'Security', priority: 'High', pre: PRE,
    steps: ['Submit P002 x10 as inventory1, cashier1, ho1, admin1'], data: '-',
    expected: 'HTTP 403 for all; no request created.',
    auto: async (ctx) => {
      const users = ['inventory1', 'cashier1', 'ho1', 'admin1'];
      const st = [];
      for (const u of users) st.push((await submit(ctx, [['P002', 10]], u)).status);
      check(st.every((s) => s === 403), users.map((u, i) => `${u}=${st[i]}`).join(', '));
      return '403 ×4';
    },
  },
  {
    ...S, id: 'TC-RF08-009', trace: 'US-08.1 AC5, BR-21, FR-TRF-03', area: 'Cancel request',
    title: 'Store Manager cancels a Submitted request with a reason',
    type: 'Functional', priority: 'Medium', pre: PRE,
    steps: ['manager1 submits P002 x10', 'manager1 cancels it with reason "Found stock"'], data: 'reason "Found stock"',
    expected: 'Status CANCELLED, reason stored, removed from HO pending queue.',
    auto: async (ctx) => {
      const req = (await submit(ctx, [['P002', 10]])).body;
      const r = await ctx.as('manager1').post(PATHS.cancelRequest(req.id), { reason: 'Found stock' });
      const after = await getRequest(ctx, req.id);
      check(r.status === 200 && after.status === 'CANCELLED', `${show(r)}; status ${after.status}`);
      return 'CANCELLED';
    },
  },
  {
    ...S, id: 'TC-RF08-010', trace: 'BR-21, ST-01', area: 'Cancel request',
    title: 'A request can no longer be cancelled once In Progress; another store’s manager can never cancel it',
    type: 'Negative', priority: 'Medium', pre: PRE,
    steps: ['Submit P002 x10 and issue it (In Progress)', 'manager1 tries to cancel', 'manager2 tries to cancel a Submitted request of STORE_001'],
    data: '-', expected: 'In Progress cancel → 409; other-store manager → 403. Status unchanged.',
    auto: async (ctx) => {
      const { req } = await issuedOrder(ctx);
      const a = await ctx.as('manager1').post(PATHS.cancelRequest(req.id), { reason: 'x' });
      if (missing(a)) blocked('Cancel-request endpoint does not exist (see TC-RF08-009)');
      const other = (await submit(ctx, [['P004', 2]])).body;
      const b = await ctx.as('manager2').post(PATHS.cancelRequest(other.id), { reason: 'x' });
      check(a.status === 409 && b.status === 403, `in-progress cancel ${a.status}, other-store cancel ${b.status}`);
      return '409, 403';
    },
  },

  // =============================================================== US-08.2
  {
    ...S, id: 'TC-RF08-011', trace: 'US-08.2 AC1, FR-TRF-04', area: 'HO queue',
    title: 'HO queue lists Submitted and In Progress requests sorted by needed-by date, then oldest first',
    type: 'Functional', priority: 'Medium', pre: PRE,
    steps: ['manager1 submits R1 (needed-by +5d), R2 (+1d), R3 (+5d)', 'manager2 submits R4 then it is rejected', 'HO reads queue'],
    data: 'neededBy dates', expected: 'Queue order R2, R1, R3; rejected R4 not in the pending queue.',
    auto: async (ctx) => {
      const d = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
      const r1 = (await submit(ctx, [['P002', 1]], 'manager1', { neededBy: d(5) })).body;
      const r2 = (await submit(ctx, [['P002', 2]], 'manager1', { neededBy: d(1) })).body;
      const r3 = (await submit(ctx, [['P002', 3]], 'manager1', { neededBy: d(5) })).body;
      const r4 = (await submit(ctx, [['P003', 1]], 'manager2')).body;
      await ctx.as('ho1').post(PATHS.reject(r4.id), { reason: 'QC' });
      const q = (await ctx.as('ho1').get(PATHS.requests)).body.map((x) => x.id);
      const pending = q.filter((id) => [r1.id, r2.id, r3.id, r4.id].includes(id));
      check(JSON.stringify(pending) === JSON.stringify([r2.id, r1.id, r3.id]), `queue order ${JSON.stringify(pending)} (R1=${r1.id}, R2=${r2.id}, R3=${r3.id}, R4=${r4.id})`);
      return 'R2, R1, R3';
    },
  },
  {
    ...S, id: 'TC-RF08-012', trace: 'BR-02, US-08.8 AC1', area: 'Store scope',
    title: 'Store Manager sees only own store’s requests even when passing another storeId',
    type: 'Security', priority: 'High', pre: PRE,
    steps: ['manager1 and manager2 each submit a request', 'manager1 GET requests?storeId=STORE_002'],
    data: 'storeId STORE_002', expected: 'Only STORE_001 requests returned (or 403).',
    auto: async (ctx) => {
      await submit(ctx, [['P002', 1]]); const b = (await submit(ctx, [['P003', 1]], 'manager2')).body;
      const r = await ctx.as('manager1').get(`${PATHS.requests}?storeId=STORE_002`);
      check(r.status === 403 || (r.body.every((x) => x.storeId === 'STORE_001') && !r.body.some((x) => x.id === b.id)), show(r));
      return `${r.status}; no STORE_002 requests`;
    },
  },
  {
    ...S, id: 'TC-RF08-013', trace: 'US-08.2 AC2, BR-14, FR-TRF-05', area: 'Availability',
    title: 'HO sees on-hand, minimum level and transferable quantity at every other active store, sorted by transferable desc',
    type: 'Functional', priority: 'High', pre: PRE + ' QC Store 3 exists with P002=20 (min 10).',
    steps: ['manager1 submits P002 x10', 'ho1 GET availability for the request'],
    data: 'P002: STORE_002 25/10 → 15; STORE_003 20/10 → 10',
    expected: 'Rows for STORE_002 (15) then STORE_003 (10); destination STORE_001 not listed.',
    auto: async (ctx) => {
      await thirdStore(ctx, 20);
      const req = (await submit(ctx, [['P002', 10]])).body;
      const r = await ctx.as('ho1').get(PATHS.availability(req.id));
      check(r.status === 200, show(r));
      const rows = JSON.stringify(r.body);
      check(rows.includes('STORE_002') && !rows.includes('"STORE_001"') && /15/.test(rows), show(r));
      return 'availability rows returned';
    },
  },
  {
    ...S, id: 'TC-RF08-014', trace: 'US-05.1 AC2, US-08.1 AC2, D-06', area: 'Store scope',
    title: 'Store Manager cannot read another store’s stock',
    type: 'Security', priority: 'High', pre: PRE,
    steps: ['manager1 GET /inventory?storeId=STORE_002'], data: '-',
    expected: 'No STORE_002 rows returned (403 or own-store data only).',
    auto: async (ctx) => {
      const r = await ctx.as('manager1').get('/api/inventory?storeId=STORE_002');
      check(r.status === 403 || (r.body.storeId === 'STORE_001' && r.body.rows.every((x) => x.storeId === 'STORE_001')), show(r));
      return `${r.status}; storeId ${r.body && r.body.storeId}`;
    },
  },
  {
    ...S, id: 'TC-RF08-015', trace: 'US-08.2 AC3, BR-21, FR-TRF-07', area: 'Reject request',
    title: 'HO rejects a Submitted request with a reason',
    type: 'Functional', priority: 'High', pre: PRE,
    steps: ['manager1 submits P002 x10', 'ho1 rejects with reason "No store can supply"'], data: 'reason',
    expected: 'Status REJECTED, reason stored, audit entry; no stock change.',
    auto: async (ctx) => {
      const req = (await submit(ctx, [['P002', 10]])).body;
      const r = await ctx.as('ho1').post(PATHS.reject(req.id), { reason: 'No store can supply' });
      const after = await getRequest(ctx, req.id);
      const reason = after.rejectionReason || after.rejectedReason || after.reason;
      const a = (await ctx.audit()).find((x) => x.resource === req.id && /REJECT/.test(x.action));
      check(r.status === 200 && after.status === 'REJECTED' && reason === 'No store can supply' && a, `${show(r)}; audit ${!!a}`);
      return 'REJECTED with reason, audited';
    },
  },
  {
    ...S, id: 'TC-RF08-016', trace: 'BR-21, FR-TRF-07', area: 'Reject request',
    title: 'Rejecting without a reason is refused',
    type: 'Negative', priority: 'Medium', pre: PRE,
    steps: ['manager1 submits P002 x10', 'ho1 rejects with empty body'], data: 'no reason',
    expected: 'HTTP 400; request stays SUBMITTED.',
    auto: async (ctx) => {
      const req = (await submit(ctx, [['P002', 10]])).body;
      const r = await ctx.as('ho1').post(PATHS.reject(req.id), {});
      const after = await getRequest(ctx, req.id);
      check(r.status === 400 && nReq(after.status) === 'SUBMITTED', `${show(r)}; status ${after.status}`);
      return '400; still SUBMITTED';
    },
  },
  {
    ...S, id: 'TC-RF08-017', trace: 'BR-21, ST-01', area: 'Reject request',
    title: 'An In Progress request cannot be rejected',
    type: 'Negative', priority: 'Medium', pre: PRE,
    steps: ['Submit and issue P002 x10', 'ho1 rejects it'], data: '-',
    expected: 'HTTP 409; status stays IN_PROGRESS.',
    auto: async (ctx) => {
      const { req } = await issuedOrder(ctx);
      const r = await ctx.as('ho1').post(PATHS.reject(req.id), { reason: 'x' });
      const after = await getRequest(ctx, req.id);
      check(r.status === 409 && nReq(after.status) === 'IN_PROGRESS', `${show(r)}; status ${after.status}`);
      return '409; still IN_PROGRESS';
    },
  },
  {
    ...S, id: 'TC-RF08-018', trace: '§2.2 TRANSFER_ORDER_ISSUE', area: 'Authorization',
    title: 'Only HO can issue or reject (Store Managers and Inventory Staff get 403)',
    type: 'Security', priority: 'High', pre: PRE,
    steps: ['manager1 submits P002 x10', 'manager1, manager2, inventory2 try to issue', 'manager2 tries to reject'], data: '-',
    expected: 'HTTP 403 for every attempt; request stays SUBMITTED.',
    auto: async (ctx) => {
      const req = (await submit(ctx, [['P002', 10]])).body;
      const body = { fulfillmentType: 'TRANSFER', sourceStoreId: 'STORE_002' };
      const st = [];
      for (const u of ['manager1', 'manager2', 'inventory2']) st.push((await ctx.as(u).post(PATHS.issue(req.id), body)).status);
      st.push((await ctx.as('manager2').post(PATHS.reject(req.id), { reason: 'x' })).status);
      const after = await getRequest(ctx, req.id);
      check(st.every((s) => s === 403) && nReq(after.status) === 'SUBMITTED', `${st.join(', ')}; status ${after.status}`);
      return '403 ×4; still SUBMITTED';
    },
  },

  // =============================================================== US-08.3
  {
    ...S, id: 'TC-RF08-019', trace: 'US-08.3 AC1, BR-14, FR-TRF-06', area: 'Issue order',
    title: 'HO issues a transfer order to one source store for the full quantity',
    type: 'Functional', priority: 'High', pre: PRE,
    steps: ['manager1 submits P002 x10', 'ho1 issues it to STORE_002', 'Read request, orders and stock'], data: 'P002 10 from STORE_002',
    expected: 'One order ISSUED (source STORE_002 → dest STORE_001, qty 10); request IN_PROGRESS; no stock moves yet; audited.',
    auto: async (ctx) => {
      const req = (await submit(ctx, [['P002', 10]])).body;
      const r = await issue(ctx, req);
      check(r.status === 200, show(r));
      const orders = await ordersFor(ctx, req.id); const after = await getRequest(ctx, req.id);
      const o = orders[0];
      check(orders.length === 1 && nOrd(o.status) === 'ISSUED' && o.sourceStoreId === 'STORE_002' && o.destinationStoreId === 'STORE_001' && o.quantity === 10, orders);
      check(nReq(after.status) === 'IN_PROGRESS', `request status ${after.status}`);
      const s2 = await ctx.stock('STORE_002', 'P002');
      const a = (await ctx.audit()).find((x) => x.resource === req.id && /APPROVE|ISSUE/.test(x.action));
      check(s2 === 25 && a, `STORE_002 P002=${s2}; audit ${!!a}`);
      return 'order ISSUED, request IN_PROGRESS, stock unchanged, audited';
    },
  },
  {
    ...S, id: 'TC-RF08-020', trace: 'US-08.3 AC2, BR-14', area: 'Issue order',
    title: 'Allocating more than the source on-hand is blocked and leaves the request untouched',
    type: 'Negative', priority: 'High', pre: PRE,
    steps: ['manager1 submits P002 x30', 'ho1 issues it to STORE_002 (on-hand 25)', 'Read request and orders'], data: 'P002 30 > 25',
    expected: 'HTTP 409; no order created; request still SUBMITTED (can be allocated again).',
    auto: async (ctx) => {
      const req = (await submit(ctx, [['P002', 30]])).body;
      const r = await issue(ctx, req);
      const after = await getRequest(ctx, req.id); const orders = await ordersFor(ctx, req.id);
      check(r.status === 409 && orders.length === 0 && nReq(after.status) === 'SUBMITTED', `${show(r)}; orders ${orders.length}; request status ${after.status}`);
      return '409; no order; still SUBMITTED';
    },
  },
  {
    ...S, id: 'TC-RF08-021', trace: 'BR-14', area: 'Issue order',
    title: 'Source store equal to the destination, or unknown, is refused without changing the request',
    type: 'Negative', priority: 'High', pre: PRE,
    steps: ['manager1 submits P002 x5', 'ho1 issues with source STORE_001 (= destination)', 'ho1 issues with source STORE_999'], data: 'STORE_001, STORE_999',
    expected: 'HTTP 400 / 404; no order; request still SUBMITTED after both attempts.',
    auto: async (ctx) => {
      const req = (await submit(ctx, [['P002', 5]])).body;
      const a = await issue(ctx, req, 'STORE_001'); const b = await issue(ctx, req, 'STORE_999');
      const after = await getRequest(ctx, req.id); const orders = await ordersFor(ctx, req.id);
      check([400, 404].includes(a.status) && [400, 404].includes(b.status) && orders.length === 0 && nReq(after.status) === 'SUBMITTED',
        `same-store ${a.status}, unknown ${b.status}; orders ${orders.length}; request status ${after.status}`);
      return '4xx, 4xx; still SUBMITTED';
    },
  },
  {
    ...S, id: 'TC-RF08-022', trace: 'US-08.3 AC2, BR-14, OI-11', area: 'Issue order',
    title: 'Allocation that takes the source below its minimum level succeeds with a warning',
    type: 'Functional', priority: 'Medium', pre: PRE,
    steps: ['manager1 submits P002 x20', 'ho1 issues it to STORE_002 (25 on-hand, min 10 → 5 left)'], data: 'P002 20',
    expected: 'Order issued (200/201) and the response carries a below-minimum warning.',
    auto: async (ctx) => {
      const req = (await submit(ctx, [['P002', 20]])).body;
      const r = await issue(ctx, req);
      check(r.status === 200 || r.status === 201, show(r));
      check(/warn/i.test(JSON.stringify(r.body)), 'issued but no warning in response: ' + show(r));
      return 'issued with warning';
    },
  },
  {
    ...S, id: 'TC-RF08-023', trace: 'US-08.3 AC1, BR-14, OI-04', area: 'Issue order',
    title: 'One line can be split across two source stores → one order per source',
    type: 'Functional', priority: 'High', pre: PRE + ' QC Store 3 exists with P002=20.',
    steps: ['manager1 submits P002 x30', 'ho1 allocates 20 from STORE_002 and 10 from STORE_003 in one call'], data: 'allocations [STORE_002: 20, STORE_003: 10]',
    expected: 'Two ISSUED orders (20 and 10) created in one transaction; request IN_PROGRESS.',
    auto: async (ctx) => {
      const s3 = await thirdStore(ctx, 20);
      const req = (await submit(ctx, [['P002', 30]])).body;
      const r = await ctx.as('ho1').post(PATHS.issue(req.id), {
        fulfillmentType: 'TRANSFER',
        allocations: [
          { sourceStoreId: 'STORE_002', lines: [{ productId: 'P002', quantity: 20 }] },
          { sourceStoreId: s3, lines: [{ productId: 'P002', quantity: 10 }] },
        ],
      });
      const orders = await ordersFor(ctx, req.id);
      check(r.status === 200 && orders.length === 2, `${show(r)}; orders ${orders.length}`);
      return '2 orders issued';
    },
  },
  {
    ...S, id: 'TC-RF08-024', trace: 'US-08.3 AC3, BR-14', area: 'Issue order',
    title: 'Partial allocation leaves the remainder open on the request',
    type: 'Functional', priority: 'Medium', pre: PRE,
    steps: ['manager1 submits P002 x10', 'ho1 allocates only 6 from STORE_002'], data: 'allocate 6 of 10',
    expected: 'Order qty 6; request IN_PROGRESS with allocated 6 / requested 10 (4 still open).',
    auto: async (ctx) => {
      const req = (await submit(ctx, [['P002', 10]])).body;
      const r = await issue(ctx, req, 'STORE_002', 6);
      const [o] = await ordersFor(ctx, req.id);
      if (r.status === 200 && o && o.quantity === 10) blocked('API ignores allocation quantities — always ships the full request (see TC-RF08-023)');
      check(r.status === 200 && o && o.quantity === 6, `${show(r)}; order ${o && o.quantity}`);
      return 'order 6, 4 open';
    },
  },
  {
    ...S, id: 'TC-RF08-025', trace: 'US-08.3 AC3, BR-14', area: 'Issue order',
    title: 'Total allocated cannot exceed requested minus already allocated',
    type: 'Negative', priority: 'Medium', pre: PRE,
    steps: ['manager1 submits P002 x10', 'ho1 allocates 12 from STORE_002'], data: 'allocate 12 of 10',
    expected: 'HTTP 400; no order; request unchanged.',
    auto: async (ctx) => {
      const req = (await submit(ctx, [['P002', 10]])).body;
      const r = await issue(ctx, req, 'STORE_002', 12);
      const [o] = await ordersFor(ctx, req.id);
      if (r.status === 200 && o && o.quantity === 10) blocked('API ignores allocation quantities — always ships the full request (see TC-RF08-023)');
      check(r.status === 400 && !o, `${show(r)}; order ${o && o.quantity}`);
      return '400; no order';
    },
  },
  {
    ...S, id: 'TC-RF08-026', trace: 'US-08.3 AC4, BR-02, FR-TRF-13', area: 'Order visibility',
    title: 'Order is visible to the source (to dispatch) and destination (incoming, with source name) only',
    type: 'Security', priority: 'High', pre: PRE + ' QC Store 3 exists (unrelated store).',
    steps: ['Issue P002 x10 STORE_002 → STORE_001', 'inventory2, inventory1, inventory3 list orders'], data: '-',
    expected: 'inventory2 and inventory1 see the order (destination view shows source store name); inventory3 does not.',
    auto: async (ctx) => {
      await thirdStore(ctx, 0);
      const { order } = await issuedOrder(ctx);
      const see = async (u) => (await ctx.as(u).get(PATHS.orders)).body.find((o) => o.id === order.id);
      const src = await see('inventory2'); const dst = await see('inventory1'); const other = await see('inventory3');
      check(src && dst && dst.sourceStoreName && !other, `source ${!!src}, dest ${!!dst} (source name ${dst && dst.sourceStoreName}), other ${!!other}`);
      return 'source + destination only';
    },
  },
  {
    ...S, id: 'TC-RF08-027', trace: 'US-08.3 AC5, BR-21, FR-TRF-07', area: 'Cancel order',
    title: 'HO cancels an Issued order with a reason; its quantity returns to the request',
    type: 'Functional', priority: 'Medium', pre: PRE,
    steps: ['Issue P002 x10', 'ho1 cancels the order with reason "Wrong source"'], data: 'reason',
    expected: 'Order CANCELLED; request back to allocatable (allocated 0); no stock change.',
    auto: async (ctx) => {
      const { order } = await issuedOrder(ctx);
      const r = await ctx.as('ho1').post(PATHS.cancelOrder(order.id), { reason: 'Wrong source' });
      check(r.status === 200 && nOrd(r.body.status) === 'CANCELLED', show(r));
      return 'CANCELLED';
    },
  },
  {
    ...S, id: 'TC-RF08-028', trace: 'BR-21, ST-02', area: 'Cancel order',
    title: 'An In Transit order cannot be cancelled',
    type: 'Negative', priority: 'Medium', pre: PRE,
    steps: ['Issue and dispatch P002 x10', 'ho1 cancels the order'], data: '-',
    expected: 'HTTP 409; order stays IN_TRANSIT; stock unchanged.',
    auto: async (ctx) => {
      const { order } = await inTransitOrder(ctx);
      const r = await ctx.as('ho1').post(PATHS.cancelOrder(order.id), { reason: 'x' });
      if (missing(r)) blocked('Cancel-order endpoint does not exist (see TC-RF08-027)');
      check(r.status === 409, show(r));
      return '409';
    },
  },

  // =============================================================== US-08.4
  {
    ...S, id: 'TC-RF08-029', trace: 'US-08.4 AC1, BR-20, FR-TRF-08', area: 'Dispatch',
    title: 'Source Inventory Staff dispatches: source stock drops, TRANSFER_OUT recorded, order In Transit',
    type: 'Functional', priority: 'High', pre: PRE,
    steps: ['Issue P002 x10', 'inventory2 dispatches', 'Read stock, movements, order'], data: 'P002 10',
    expected: 'STORE_002 P002 25→15; STORE_001 unchanged (8); one TRANSFER_OUT qty 10; order IN_TRANSIT; audited.',
    auto: async (ctx) => {
      const { order } = await issuedOrder(ctx);
      const r = await ctx.as('inventory2').post(PATHS.dispatch(order.id));
      check(r.status === 200 && r.body.status === 'IN_TRANSIT', show(r));
      const s1 = await ctx.stock('STORE_001', 'P002'); const s2 = await ctx.stock('STORE_002', 'P002');
      const out = (await ctx.movements('STORE_002')).filter((m) => m.type === 'TRANSFER_OUT');
      check(s2 === 15 && s1 === 8 && out.length === 1 && out[0].quantity === 10, `P002 S1=${s1} S2=${s2}; TRANSFER_OUT ${JSON.stringify(out)}`);
      return 'S2 25→15, S1 8, 1 TRANSFER_OUT, IN_TRANSIT';
    },
  },
  {
    ...S, id: 'TC-RF08-030', trace: '§2.2 TRANSFER_DISPATCH, US-08.4', area: 'Dispatch',
    title: 'Source Store Manager can also dispatch',
    type: 'Functional', priority: 'Medium', pre: PRE,
    steps: ['Issue P002 x10', 'manager2 dispatches'], data: '-',
    expected: 'HTTP 200; order IN_TRANSIT.',
    auto: async (ctx) => {
      const { order } = await issuedOrder(ctx);
      const r = await ctx.as('manager2').post(PATHS.dispatch(order.id));
      check(r.status === 200, show(r));
      return '200';
    },
  },
  {
    ...S, id: 'TC-RF08-031', trace: 'US-08.4 AC2, BR-12', area: 'Dispatch',
    title: 'Dispatch is blocked when source stock dropped below the order quantity; order stays Issued',
    type: 'Negative', priority: 'High', pre: PRE + ' A cashier (cashier2) exists at STORE_002.',
    steps: ['Issue P002 x10', 'cashier2 sells P002 x20 at STORE_002 (25→5)', 'inventory2 dispatches'], data: 'stock 5 < 10',
    expected: 'HTTP 409; order ISSUED; STORE_002 P002 stays 5; no TRANSFER_OUT.',
    auto: async (ctx) => {
      const { order } = await issuedOrder(ctx);
      await ctx.createUser('cashier2', 'CASHIER', 'STORE_002');
      await ctx.checkout([['P002', 20]], {}, 'cashier2');
      const r = await ctx.as('inventory2').post(PATHS.dispatch(order.id));
      const [o] = await ordersFor(ctx, order.stockRequestId);
      const s2 = await ctx.stock('STORE_002', 'P002');
      const out = (await ctx.movements('STORE_002')).filter((m) => m.type === 'TRANSFER_OUT');
      check(r.status === 409 && nOrd(o.status) === 'ISSUED' && s2 === 5 && out.length === 0, `${show(r)}; order ${o.status}; P002=${s2}; TRANSFER_OUT ${out.length}`);
      return '409; ISSUED; P002=5';
    },
  },
  {
    ...S, id: 'TC-RF08-032', trace: 'US-08.4, BR-02', area: 'Dispatch',
    title: 'Only the source store can dispatch (destination staff and HO get 403)',
    type: 'Security', priority: 'High', pre: PRE,
    steps: ['Issue P002 x10 (STORE_002 → STORE_001)', 'inventory1 dispatches', 'ho1 dispatches'], data: '-',
    expected: 'HTTP 403 for both; order stays ISSUED; no stock change.',
    auto: async (ctx) => {
      const { order } = await issuedOrder(ctx);
      const a = await ctx.as('inventory1').post(PATHS.dispatch(order.id)); const b = await ctx.as('ho1').post(PATHS.dispatch(order.id));
      const s2 = await ctx.stock('STORE_002', 'P002');
      check(a.status === 403 && b.status === 403 && s2 === 25, `inventory1 ${a.status}, ho1 ${b.status}; P002=${s2}`);
      return '403, 403';
    },
  },
  {
    ...S, id: 'TC-RF08-033', trace: 'US-08.4 AC4, NFR-07', area: 'Dispatch',
    title: 'Dispatching the same order twice (sequential and parallel) deducts stock once',
    type: 'Integrity', priority: 'High', pre: PRE,
    steps: ['Issue two orders of P002 x5', 'Order A: dispatch twice sequentially', 'Order B: dispatch 3× in parallel'], data: '-',
    expected: 'Each order deducted once (25 → 15); duplicates get 409; exactly 2 TRANSFER_OUT.',
    auto: async (ctx) => {
      const A = await issuedOrder(ctx, 5); const B = await issuedOrder(ctx, 5);
      const a1 = await ctx.as('inventory2').post(PATHS.dispatch(A.order.id)); const a2 = await ctx.as('inventory2').post(PATHS.dispatch(A.order.id));
      await ctx.token('inventory2');
      const bs = await Promise.all([1, 2, 3].map(() => ctx.as('inventory2').post(PATHS.dispatch(B.order.id))));
      const s2 = await ctx.stock('STORE_002', 'P002');
      const out = (await ctx.movements('STORE_002')).filter((m) => m.type === 'TRANSFER_OUT');
      check(a1.status === 200 && a2.status === 409 && bs.filter((r) => r.status === 200).length === 1 && s2 === 15 && out.length === 2,
        `A: ${a1.status},${a2.status}; B: ${bs.map((r) => r.status)}; P002=${s2}; TRANSFER_OUT ${out.length}`);
      return 'deducted once per order';
    },
  },
  {
    ...S, id: 'TC-RF08-034', trace: 'US-08.4 AC3, BR-15, OI-08', area: 'Dispatch',
    title: 'Source store has no approve / reject action on a transfer order',
    type: 'Security', priority: 'Medium', pre: PRE,
    steps: ['Issue P002 x10', 'manager2 POST .../approve and .../reject on the order'], data: '-',
    expected: 'Both 404/405/403; order stays ISSUED.',
    auto: async (ctx) => {
      const { order } = await issuedOrder(ctx);
      const a = await ctx.as('manager2').post(`/api/transfers/${order.id}/approve`); const b = await ctx.as('manager2').post(`/api/transfers/${order.id}/reject`, { reason: 'x' });
      check([403, 404, 405].includes(a.status) && [403, 404, 405].includes(b.status), `${a.status}, ${b.status}`);
      return `${a.status}, ${b.status}`;
    },
  },

  // =============================================================== US-08.5
  {
    ...S, id: 'TC-RF08-035', trace: 'US-08.5 AC1, BR-15, FR-TRF-09', area: 'Unfulfillable',
    title: 'Source Store Manager reports an Issued order unfulfillable with a reason',
    type: 'Functional', priority: 'Medium', pre: PRE,
    steps: ['Issue P002 x10', 'manager2 reports it unfulfillable, reason "Damaged stock"'], data: 'reason',
    expected: 'Order UNFULFILLABLE; quantity released back to the request; no stock change; HO notified.',
    auto: async (ctx) => {
      const { order } = await issuedOrder(ctx);
      const r = await ctx.as('manager2').post(PATHS.unfulfillable(order.id), { reason: 'Damaged stock' });
      check(r.status === 200 && r.body.status === 'UNFULFILLABLE', show(r));
      return 'UNFULFILLABLE';
    },
  },
  {
    ...S, id: 'TC-RF08-036', trace: 'US-08.5 AC1-AC2, BR-15', area: 'Unfulfillable',
    title: 'Unfulfillable needs a reason and is refused for In Transit orders and for other stores',
    type: 'Negative', priority: 'Medium', pre: PRE,
    steps: ['Issue order A, report without reason', 'Issue + dispatch order B, report it', 'manager1 (destination) reports order A'], data: '-',
    expected: 'No reason → 400; In Transit → 409; destination manager → 403.',
    auto: async (ctx) => {
      const A = await issuedOrder(ctx, 5);
      const a = await ctx.as('manager2').post(PATHS.unfulfillable(A.order.id), {});
      if (missing(a)) blocked('Unfulfillable endpoint does not exist (see TC-RF08-035)');
      const B = await inTransitOrder(ctx, 5);
      const b = await ctx.as('manager2').post(PATHS.unfulfillable(B.order.id), { reason: 'x' });
      const c = await ctx.as('manager1').post(PATHS.unfulfillable(A.order.id), { reason: 'x' });
      check(a.status === 400 && b.status === 409 && c.status === 403, `${a.status}, ${b.status}, ${c.status}`);
      return '400, 409, 403';
    },
  },

  // =============================================================== US-08.6
  {
    ...S, id: 'TC-RF08-037', trace: 'US-08.6 AC1, BR-20, FR-TRF-10', area: 'Receive',
    title: 'Destination Inventory Staff receives: stock increases by exactly the dispatched quantity',
    type: 'Functional', priority: 'High', pre: PRE,
    steps: ['Issue + dispatch P002 x10', 'inventory1 receives', 'Read stock, movements, order'], data: 'P002 10',
    expected: 'STORE_001 P002 8→18; one TRANSFER_IN qty 10; order RECEIVED; audited.',
    auto: async (ctx) => {
      const { order } = await inTransitOrder(ctx);
      const r = await ctx.as('inventory1').post(PATHS.receive(order.id));
      check(r.status === 200 && nOrd(r.body.status) === 'RECEIVED', show(r));
      const s1 = await ctx.stock('STORE_001', 'P002');
      const inn = (await ctx.movements('STORE_001')).filter((m) => m.type === 'TRANSFER_IN');
      const a = (await ctx.audit()).find((x) => x.resource === order.id && /RECEIVE/.test(x.action));
      check(s1 === 18 && inn.length === 1 && inn[0].quantity === 10 && a, `P002=${s1}; TRANSFER_IN ${JSON.stringify(inn)}; audit ${!!a}`);
      return '8→18, 1 TRANSFER_IN, RECEIVED, audited';
    },
  },
  {
    ...S, id: 'TC-RF08-038', trace: '§2.2 TRANSFER_RECEIVE, US-08.6', area: 'Receive',
    title: 'Destination Store Manager can also receive',
    type: 'Functional', priority: 'Medium', pre: PRE,
    steps: ['Issue + dispatch P002 x10', 'manager1 receives'], data: '-',
    expected: 'HTTP 200; order RECEIVED.',
    auto: async (ctx) => {
      const { order } = await inTransitOrder(ctx);
      const r = await ctx.as('manager1').post(PATHS.receive(order.id));
      check(r.status === 200, show(r));
      return '200';
    },
  },
  {
    ...S, id: 'TC-RF08-039', trace: 'US-08.6 AC2, BR-20, NFR-07', area: 'Receive',
    title: 'Receiving the same order twice (sequential and parallel) adds stock once',
    type: 'Integrity', priority: 'High', pre: PRE,
    steps: ['Two in-transit orders of P002 x5', 'Order A: receive twice', 'Order B: receive 3× in parallel'], data: '-',
    expected: 'STORE_001 P002 8→18 exactly; duplicates 409; 2 TRANSFER_IN.',
    auto: async (ctx) => {
      const A = await inTransitOrder(ctx, 5); const B = await inTransitOrder(ctx, 5);
      const a1 = await ctx.as('inventory1').post(PATHS.receive(A.order.id)); const a2 = await ctx.as('inventory1').post(PATHS.receive(A.order.id));
      await ctx.token('inventory1');
      const bs = await Promise.all([1, 2, 3].map(() => ctx.as('inventory1').post(PATHS.receive(B.order.id))));
      const s1 = await ctx.stock('STORE_001', 'P002');
      const inn = (await ctx.movements('STORE_001')).filter((m) => m.type === 'TRANSFER_IN');
      check(a1.status === 200 && a2.status === 409 && bs.filter((r) => r.status === 200).length === 1 && s1 === 18 && inn.length === 2,
        `A: ${a1.status},${a2.status}; B: ${bs.map((r) => r.status)}; P002=${s1}; TRANSFER_IN ${inn.length}`);
      return 'added once per order';
    },
  },
  {
    ...S, id: 'TC-RF08-040', trace: 'US-08.6 AC5, BR-02', area: 'Receive',
    title: 'Only the destination store can receive (source staff and HO get 403)',
    type: 'Security', priority: 'High', pre: PRE,
    steps: ['Issue + dispatch P002 x10', 'inventory2 receives', 'ho1 receives'], data: '-',
    expected: 'HTTP 403 for both; order stays IN_TRANSIT; STORE_001 stock unchanged.',
    auto: async (ctx) => {
      const { order } = await inTransitOrder(ctx);
      const a = await ctx.as('inventory2').post(PATHS.receive(order.id)); const b = await ctx.as('ho1').post(PATHS.receive(order.id));
      const s1 = await ctx.stock('STORE_001', 'P002');
      check(a.status === 403 && b.status === 403 && s1 === 8, `inventory2 ${a.status}, ho1 ${b.status}; P002=${s1}`);
      return '403, 403';
    },
  },
  {
    ...S, id: 'TC-RF08-041', trace: 'ST-02, FR-TRF-12', area: 'Receive',
    title: 'An order that was not dispatched cannot be received',
    type: 'Negative', priority: 'High', pre: PRE,
    steps: ['Issue P002 x10 (not dispatched)', 'inventory1 receives'], data: '-',
    expected: 'HTTP 409; STORE_001 stock unchanged; no TRANSFER_IN.',
    auto: async (ctx) => {
      const { order } = await issuedOrder(ctx);
      const r = await ctx.as('inventory1').post(PATHS.receive(order.id));
      const s1 = await ctx.stock('STORE_001', 'P002');
      check(r.status === 409 && s1 === 8, `${show(r)}; P002=${s1}`);
      return '409; P002=8';
    },
  },
  {
    ...S, id: 'TC-RF08-042', trace: 'US-08.6 AC4, BR-22, FR-TRF-11', area: 'Receive',
    title: 'Request is Completed automatically once every line is fully received',
    type: 'Functional', priority: 'High', pre: PRE,
    steps: ['Issue + dispatch + receive P002 x10', 'Read the request'], data: '-',
    expected: 'Request status COMPLETED.',
    auto: async (ctx) => {
      const { req, order } = await inTransitOrder(ctx);
      await ctx.as('inventory1').post(PATHS.receive(order.id));
      const after = await getRequest(ctx, req.id);
      check(after.status === 'COMPLETED', `status ${after.status}`);
      return 'COMPLETED';
    },
  },
  {
    ...S, id: 'TC-RF08-043', trace: 'US-08.6 AC4, BR-22', area: 'Receive',
    title: 'Request stays In Progress while part of the quantity is still unallocated or in transit',
    type: 'Functional', priority: 'High', pre: PRE,
    steps: ['manager1 submits P002 x10', 'ho1 allocates 6 from STORE_002', 'Dispatch + receive that order', 'Read the request'], data: 'allocate 6 of 10',
    expected: 'Request IN_PROGRESS (received 6 of 10), not COMPLETED.',
    auto: async (ctx) => {
      const req = (await submit(ctx, [['P002', 10]])).body;
      await issue(ctx, req, 'STORE_002', 6);
      const [o] = await ordersFor(ctx, req.id);
      if (o && o.quantity === 10) blocked('API ignores allocation quantities — partial allocation not possible (see TC-RF08-023)');
      await ctx.as('inventory2').post(PATHS.dispatch(o.id)); await ctx.as('inventory1').post(PATHS.receive(o.id));
      const after = await getRequest(ctx, req.id);
      check(nReq(after.status) === 'IN_PROGRESS', `status ${after.status}`);
      return 'IN_PROGRESS';
    },
  },
  {
    ...S, id: 'TC-RF08-044', trace: 'US-08.6 AC3, BR-11, BR-20, OI-05', area: 'Receive',
    title: 'Short / damaged arrival: full receive, then a TRANSFER_DIFF adjustment referencing the order',
    type: 'Functional', priority: 'Medium', pre: PRE,
    steps: ['Issue + dispatch + receive P002 x10', 'inventory1 adjusts P002 by -2 with reason TRANSFER_DIFF and the order number'], data: 'adjust -2, TRANSFER_DIFF',
    expected: 'Adjustment accepted; STORE_001 P002 18→16; ADJUST movement referencing the order.',
    auto: async (ctx) => {
      const { order } = await inTransitOrder(ctx);
      await ctx.as('inventory1').post(PATHS.receive(order.id));
      const r = await ctx.as('inventory1').post(PATHS.adjust, { productId: 'P002', quantityChange: -2, reasonCode: 'TRANSFER_DIFF', reference: order.id, note: 'QC short arrival' });
      check(r.status === 200 || r.status === 201, show(r));
      const s1 = await ctx.stock('STORE_001', 'P002');
      check(s1 === 16, `P002=${s1}`);
      return 'adjusted 18→16';
    },
  },

  // =============================================================== US-08.7
  {
    ...S, id: 'TC-RF08-045', trace: 'US-08.7 AC1, BR-22, FR-TRF-11', area: 'Close request',
    title: 'HO closes an In Progress request with a shortfall reason when no order is open',
    type: 'Functional', priority: 'Medium', pre: PRE,
    steps: ['Submit P002 x10, allocate and receive part of it (or have the order reported unfulfillable)', 'ho1 closes the request with reason "Supplier out of stock"'], data: 'reason',
    expected: 'Request COMPLETED with the per-line shortfall recorded; destination manager notified.',
    auto: async (ctx) => {
      const req = (await submit(ctx, [['P002', 10]])).body;
      const r = await ctx.as('ho1').post(PATHS.closeRequest(req.id), { reason: 'Supplier out of stock' });
      check(r.status === 200 && r.body.status === 'COMPLETED', show(r));
      return 'COMPLETED with shortfall';
    },
  },
  {
    ...S, id: 'TC-RF08-046', trace: 'US-08.7 AC1, BR-22', area: 'Close request',
    title: 'A request cannot be closed while an order is Issued or In Transit',
    type: 'Negative', priority: 'Medium', pre: PRE,
    steps: ['Issue P002 x10 (order ISSUED)', 'ho1 closes the request'], data: '-',
    expected: 'HTTP 409; request stays IN_PROGRESS.',
    auto: async (ctx) => {
      const { req } = await issuedOrder(ctx);
      const r = await ctx.as('ho1').post(PATHS.closeRequest(req.id), { reason: 'x' });
      if (missing(r)) blocked('Close-request endpoint does not exist (see TC-RF08-045)');
      check(r.status === 409, show(r));
      return '409';
    },
  },

  // =============================================================== US-08.8
  {
    ...S, id: 'TC-RF08-047', trace: 'US-08.8 AC1', area: 'Tracking',
    title: 'My requests show status and per-line requested / allocated / received quantities',
    type: 'Functional', priority: 'Medium', pre: PRE,
    steps: ['Issue + dispatch + receive P002 x10', 'manager1 lists own requests'], data: '-',
    expected: 'The request line shows requested 10, allocated 10, received 10.',
    auto: async (ctx) => {
      const { req, order } = await inTransitOrder(ctx);
      await ctx.as('inventory1').post(PATHS.receive(order.id));
      const mine = await getRequest(ctx, req.id, 'manager1');
      const line = (mine.lines || [])[0] || mine;
      const has = ['requestedQty', 'allocatedQty', 'receivedQty'].map((k) => line[k] ?? line[k.replace('Qty', '_qty')]);
      check(has[0] === 10 && has[1] === 10 && has[2] === 10, `line fields requested/allocated/received = ${has.join('/')}`);
      return '10 / 10 / 10';
    },
  },
  {
    ...S, id: 'TC-RF08-048', trace: 'US-08.8 AC2', area: 'Tracking',
    title: 'HO can filter requests by status, store and date range',
    type: 'Functional', priority: 'Medium', pre: PRE,
    steps: ['manager1 submits A and B; manager2 submits C; issue A', 'ho1 GET requests?status=IN_PROGRESS', 'ho1 GET requests?storeId=STORE_002'], data: '-',
    expected: 'status filter → only A; store filter → only C.',
    auto: async (ctx) => {
      const { req: A } = await issuedOrder(ctx, 2);
      await submit(ctx, [['P003', 1]]); const C = (await submit(ctx, [['P003', 1]], 'manager2')).body;
      const byStatus = (await ctx.as('ho1').get(`${PATHS.requests}?status=IN_PROGRESS`)).body.map((x) => x.id);
      const byStore = (await ctx.as('ho1').get(`${PATHS.requests}?storeId=STORE_002`)).body.map((x) => x.id);
      check(JSON.stringify(byStore) === JSON.stringify([C.id]), `store filter → ${byStore}`);
      check(JSON.stringify(byStatus) === JSON.stringify([A.id]), `status filter → ${byStatus}`);
      return 'filters OK';
    },
  },
  {
    ...S, id: 'TC-RF08-049', trace: 'US-08.8 AC3', area: 'Tracking',
    title: 'Request detail timeline shows submitted → issued → dispatched → received with who and when',
    type: 'Functional', priority: 'Medium', pre: PRE,
    steps: ['Issue + dispatch + receive P002 x10', 'ho1 reads the request (and its order)'], data: '-',
    expected: 'Timeline has 4 steps incl. dispatch, each with user and timestamp.',
    auto: async (ctx) => {
      const { req, order } = await inTransitOrder(ctx);
      await ctx.as('inventory1').post(PATHS.receive(order.id));
      const r = await getRequest(ctx, req.id); const [o] = await ordersFor(ctx, req.id);
      const steps = (r.history || []).map((h) => h.status);
      const dispatchLogged = steps.some((s) => /DISPATCH|TRANSIT/.test(s)) || !!(o.dispatchedAt && o.dispatchedBy);
      check(dispatchLogged && (r.history || []).every((h) => h.at && h.by), `timeline ${JSON.stringify(steps)}; order dispatchedAt ${o.dispatchedAt}`);
      return 'full timeline';
    },
  },
  {
    ...S, id: 'TC-RF08-050', trace: '§7.4 enums, ST-01, ST-02, FR-TRF-12', area: 'Data contract',
    title: 'Request and order statuses use the BA enums',
    type: 'Functional', priority: 'Low', pre: PRE,
    steps: ['Submit, issue, dispatch, receive P002 x10, recording raw statuses'], data: '-',
    expected: 'Request: SUBMITTED → IN_PROGRESS → COMPLETED. Order: ISSUED → IN_TRANSIT → RECEIVED.',
    auto: async (ctx) => {
      const req = (await submit(ctx, [['P002', 10]])).body; const seen = [req.status];
      await issue(ctx, req); seen.push((await getRequest(ctx, req.id)).status);
      const [o] = await ordersFor(ctx, req.id); const os = [o.status];
      os.push((await ctx.as('inventory2').post(PATHS.dispatch(o.id))).body.status);
      os.push((await ctx.as('inventory1').post(PATHS.receive(o.id))).body.status);
      seen.push((await getRequest(ctx, req.id)).status);
      const want = { req: ['SUBMITTED', 'IN_PROGRESS', 'COMPLETED'], ord: ['ISSUED', 'IN_TRANSIT', 'RECEIVED'] };
      check(JSON.stringify(seen) === JSON.stringify(want.req) && JSON.stringify(os) === JSON.stringify(want.ord), `request ${seen.join('→')}; order ${os.join('→')}`);
      return 'BA enums';
    },
  },

  // ===================================================== Stock integrity (RF-08)
  {
    ...S, id: 'TC-RF08-INT-01', trace: 'BR-12, BR-20, NFR-06, FR-INV-08', area: 'Stock integrity',
    title: 'After complete transfer flows, every store/product reconciles with seed + movements',
    type: 'Integrity', priority: 'High', pre: PRE,
    steps: ['Run 3 transfers (P002 10, P001 5, P005 7) end-to-end plus 1 rejected and 1 in transit', 'Reconcile every (store, product)'], data: '-',
    expected: 'No mismatch; every on-hand is an integer ≥ 0.',
    auto: async (ctx) => {
      for (const [p, q] of [['P002', 10], ['P001', 5], ['P005', 7]]) {
        const req = (await submit(ctx, [[p, q]])).body; await issue(ctx, req);
        const [o] = await ordersFor(ctx, req.id);
        await ctx.as('inventory2').post(PATHS.dispatch(o.id)); await ctx.as('inventory1').post(PATHS.receive(o.id));
      }
      const rej = (await submit(ctx, [['P003', 2]])).body; await ctx.as('ho1').post(PATHS.reject(rej.id), { reason: 'QC' });
      await inTransitOrder(ctx, 3);
      const problems = await ctx.reconcile();
      check(problems.length === 0, problems.join('; '));
      return 'all reconcile';
    },
  },
  {
    ...S, id: 'TC-RF08-INT-02', trace: 'BR-20, BR-12', area: 'Stock integrity',
    title: 'Chain-wide quantity is conserved: drops by the in-transit quantity on dispatch and is restored on receive',
    type: 'Integrity', priority: 'High', pre: PRE,
    steps: ['Total P002 across stores (33)', 'Issue + dispatch P002 x10 → total', 'Receive → total'], data: '-',
    expected: '33 → 23 while in transit → 33 after receive.',
    auto: async (ctx) => {
      const total = async () => (await ctx.stock('STORE_001', 'P002')) + (await ctx.stock('STORE_002', 'P002'));
      const t0 = await total();
      const { order } = await inTransitOrder(ctx); const t1 = await total();
      await ctx.as('inventory1').post(PATHS.receive(order.id)); const t2 = await total();
      check(t0 === 33 && t1 === 23 && t2 === 33, `${t0} → ${t1} → ${t2}`);
      return '33 → 23 → 33';
    },
  },
  {
    ...S, id: 'TC-RF08-INT-03', trace: 'BR-14, BR-12, NFR-05, §9.2 (no reservation)', area: 'Stock integrity',
    title: 'Two orders competing for the same source stock: only what exists can leave, stock never negative',
    type: 'Integrity', priority: 'High', pre: PRE,
    steps: ['Issue order A P002 x20 and order B P002 x20 from STORE_002 (on-hand 25, no reservation)', 'inventory2 dispatches A and B in parallel'], data: '20 + 20 > 25',
    expected: 'Exactly one dispatch succeeds, the other gets 409; STORE_002 P002 = 5; never negative.',
    auto: async (ctx) => {
      const A = await issuedOrder(ctx, 20); const B = await issuedOrder(ctx, 20);
      await ctx.token('inventory2');
      const rs = await Promise.all([A, B].map((x) => ctx.as('inventory2').post(PATHS.dispatch(x.order.id))));
      const s2 = await ctx.stock('STORE_002', 'P002');
      check(rs.filter((r) => r.status === 200).length === 1 && rs.filter((r) => r.status === 409).length === 1 && s2 === 5, `${rs.map((r) => r.status)}; P002=${s2}`);
      return '200 + 409; P002=5';
    },
  },
  {
    ...S, id: 'TC-RF08-INT-04', trace: 'BR-12, FR-INV-06', area: 'Stock integrity',
    title: 'Rejected transfer operations leave stock and movements untouched',
    type: 'Integrity', priority: 'High', pre: PRE,
    steps: ['Attempt: issue over on-hand, dispatch by wrong store, receive before dispatch, dispatch twice', 'Compare stock + movement count before/after the failed calls'], data: '-',
    expected: 'Only the one legitimate dispatch changes stock; failed calls add no movements.',
    auto: async (ctx) => {
      const big = (await submit(ctx, [['P002', 30]])).body; await issue(ctx, big);
      const { order } = await issuedOrder(ctx, 10);
      await ctx.as('inventory1').post(PATHS.dispatch(order.id));
      await ctx.as('inventory1').post(PATHS.receive(order.id));
      await ctx.as('inventory2').post(PATHS.dispatch(order.id));
      await ctx.as('inventory2').post(PATHS.dispatch(order.id));
      const out = (await ctx.movements('STORE_002')).length; const inn = (await ctx.movements('STORE_001')).length;
      const s2 = await ctx.stock('STORE_002', 'P002'); const s1 = await ctx.stock('STORE_001', 'P002');
      const problems = await ctx.reconcile();
      check(out === 1 && inn === 0 && s2 === 15 && s1 === 8 && problems.length === 0, `S2 movements ${out}, S1 movements ${inn}, P002 S1=${s1} S2=${s2}; ${problems.join('; ')}`);
      return 'only the valid dispatch moved stock';
    },
  },
  {
    ...S, id: 'TC-RF08-INT-05', trace: 'BR-12, §7.3 STOCK_MOVEMENT', area: 'Stock integrity',
    title: 'Strict ledger: current stock equals the sum of movements (opening balances recorded as movements)',
    type: 'Integrity', priority: 'Medium', pre: 'Fresh seed DB (no activity).',
    steps: ['For every (store, product) compare on-hand with Σ movements (no seed baseline)'], data: '-',
    expected: 'Equal for every row — seeded / initial stock is backed by an opening RECEIVE/ADJUST movement.',
    auto: async (ctx) => {
      const bad = [];
      for (const s of ['STORE_001', 'STORE_002']) {
        const cur = await ctx.stockMap(s); const movs = await ctx.movements(s);
        for (const [p, q] of Object.entries(cur)) {
          const sum = movs.filter((m) => m.productId === p).reduce((a, m) => a + (m.type === 'RECEIVE' || m.type === 'TRANSFER_IN' || m.type === 'ADJUST' ? 1 : -1) * m.quantity, 0);
          if (sum !== q) bad.push(`${s}/${p}: on-hand ${q}, Σ movements ${sum}`);
        }
      }
      check(bad.length === 0, `${bad.length} rows unbacked, e.g. ${bad.slice(0, 3).join('; ')}`);
      return 'ledger matches';
    },
  },
  {
    ...S, id: 'TC-RF08-INT-06', trace: 'BR-20, D-06, BR-12', area: 'Stock integrity',
    title: 'Stock cannot leave a store towards another store outside a transfer order',
    type: 'Integrity', priority: 'High', pre: PRE,
    steps: ['inventory1 POST /inventory/dispatch-stock P001 x5 destinationStoreId STORE_002', 'Compare chain-wide P001 and transfer orders'], data: 'P001 5',
    expected: 'Rejected (endpoint absent or 4xx); chain-wide P001 unchanged (70).',
    auto: async (ctx) => {
      const r = await ctx.as('inventory1').post('/api/inventory/dispatch-stock', { productId: 'P001', quantity: 5, destinationStoreId: 'STORE_002' });
      const total = (await ctx.stock('STORE_001', 'P001')) + (await ctx.stock('STORE_002', 'P001'));
      const orders = (await ctx.as('ho1').get(PATHS.orders)).body.length;
      check(r.status >= 400 && total === 70, `${show(r)}; chain P001 ${total}; transfer orders ${orders}`);
      return 'rejected; chain P001 70';
    },
  },
  {
    ...S, id: 'TC-RF08-INT-07', trace: 'BR-12, BR-10', area: 'Stock integrity',
    title: 'Malformed quantities cannot corrupt on-hand stock (1e309, 1.5, "0x10")',
    type: 'Integrity', priority: 'High', pre: PRE,
    steps: ['inventory1 add-stock P001 with 1e309, 1.5, "0x10"', 'Read P001 and reconcile'], data: '"1e309", 1.5, "0x10"',
    expected: 'All three rejected 400; P001 stays 40 (finite integer); reconcile clean.',
    auto: async (ctx) => {
      const st = [];
      for (const q of ['1e309', 1.5, '0x10']) st.push((await ctx.as('inventory1').post('/api/inventory/add-stock', { productId: 'P001', quantity: q })).status);
      const q = await ctx.stock('STORE_001', 'P001'); const problems = await ctx.reconcile();
      check(st.every((s) => s === 400) && q === 40 && problems.length === 0, `statuses ${st.join(', ')}; P001=${JSON.stringify(q)}; ${problems.join('; ')}`);
      return '400 ×3; P001=40';
    },
  },
  {
    ...S, id: 'TC-RF08-INT-08', trace: 'BR-20, NFR-14', area: 'Stock integrity',
    title: 'Server restart with an order in transit: state survives and the flow completes consistently',
    type: 'Integrity', priority: 'High', pre: PRE,
    steps: ['Issue + dispatch P002 x10', 'Restart server (same DB)', 'inventory1 receives', 'Reconcile'], data: '-',
    expected: 'Order still IN_TRANSIT after restart; receive succeeds; STORE_001 P002 18; reconcile clean.',
    auto: async (ctx) => {
      const { order } = await inTransitOrder(ctx);
      await ctx.restart(); ctx.tokens = {};
      const r = await ctx.as('inventory1').post(PATHS.receive(order.id));
      const s1 = await ctx.stock('STORE_001', 'P002'); const problems = await ctx.reconcile();
      check(r.status === 200 && s1 === 18 && problems.length === 0, `${show(r)}; P002=${s1}; ${problems.join('; ')}`);
      return 'received after restart; reconciles';
    },
  },
  {
    ...S, id: 'TC-RF08-INT-09', trace: 'BR-04, BR-18, BR-12', area: 'Stock integrity',
    title: 'A product with stock movements cannot be hard-deleted',
    type: 'Integrity', priority: 'High', pre: PRE,
    steps: ['Transfer P002 x10 end-to-end', 'ho1 DELETE /products/P002', 'Read STORE_001 stock rows'], data: '-',
    expected: 'Delete refused (409); P002 stock rows and movements intact.',
    auto: async (ctx) => {
      const { order } = await inTransitOrder(ctx);
      await ctx.as('inventory1').post(PATHS.receive(order.id));
      const r = await ctx.as('ho1').del('/api/products/P002');
      const s1 = await ctx.stock('STORE_001', 'P002');
      check(r.status === 409 && s1 === 18, `${show(r)}; STORE_001 P002 row → ${JSON.stringify(s1)}`);
      return '409; rows intact';
    },
  },

  // ============================================================== manual UI
  {
    ...S, id: 'TC-RF08-M01', trace: 'US-08.1 AC1-AC2', area: 'Request UI',
    title: 'Request form has no source-store field, shows only own stock/minimum and can pre-fill from low-stock',
    type: 'UI', priority: 'Medium', pre: 'Signed in as manager1.',
    steps: ['Inventory → Request stock'], data: '-',
    expected: 'Multi-line form; own on-hand + minimum per product; "Pre-fill from low stock" sets qty = min − on-hand; no source field.',
  },
  {
    ...S, id: 'TC-RF08-M02', trace: 'US-08.2 AC2, US-08.3 AC1-AC2', area: 'HO allocation UI',
    title: 'HO allocation screen shows chain-wide availability and warns below minimum',
    type: 'UI', priority: 'High', pre: 'Signed in as ho1; one Submitted request.',
    steps: ['Open the request', 'Enter quantities per source store'], data: '-',
    expected: 'Table of other stores sorted by transferable qty; below-minimum shows a warning; over on-hand blocked inline.',
    notes: 'Static review: approve-dialog.tsx offers TRANSFER/FACTORY + a single source store.',
  },
  {
    ...S, id: 'TC-RF08-M03', trace: 'US-08.3 AC4, US-08.8 AC1', area: 'Store transfer UI',
    title: 'Store screens show "Orders to dispatch" (source) and "Incoming" (destination) with source store name',
    type: 'UI', priority: 'Medium', pre: 'One Issued order STORE_002 → STORE_001.',
    steps: ['Sign in as inventory2, then inventory1'], data: '-',
    expected: 'inventory2: order under Orders to dispatch with Dispatch / (SM) Report unfulfillable; inventory1: under Incoming with source name.',
  },
  {
    ...S, id: 'TC-RF08-M04', trace: 'US-08.8 AC3', area: 'Tracking UI',
    title: 'Request detail shows a timeline with actor and time for each step',
    type: 'UI', priority: 'Low', pre: 'A completed transfer exists.',
    steps: ['Open the request as manager1 and ho1'], data: '-',
    expected: 'submitted → orders issued → dispatched → received, each with user and timestamp.',
  },
];
