'use strict';
// US-06.4 — Payment and sale completion (Sprint 3)
// Source: BA §4.6 US-06.4 AC1–AC5, BR-05/06/07/17, FR-POS-05..09, SD-01, NFR-05/07.
// Endpoint under test today: POST /api/checkout (BA/SD-01 calls it POST /sales).
const { check, show } = require('../lib/harness');

const S = { sprint: 'S3', backlog: 'US-06.4' };
const PRE_CASHIER = 'Fresh seed DB. cashier1 signed in (Cashier, STORE_001). STORE_001 stock: P001=40, P002=8, P004=3.';

const findAudit = async (ctx, action, resource) =>
  (await ctx.audit()).find((a) => a.action === action && (!resource || a.resource === resource));

module.exports = [
  // ---------------------------------------------------------------- happy path
  {
    ...S, id: 'TC-0604-001', trace: 'US-06.4 AC3, BR-07, FR-POS-06', area: 'Sale commit',
    title: 'Complete a sale with enough stock creates one receipt and deducts stock once',
    type: 'Functional', priority: 'High', pre: PRE_CASHIER,
    steps: ['POST checkout with P001 x2 and P005 x1, payment CASH', 'Read STORE_001 stock for P001, P005'],
    data: 'P001 x2 (15), P005 x1 (12)',
    expected: 'HTTP 201 with a receipt; P001 40→38, P005 50→49; exactly one receipt stored.',
    auto: async (ctx) => {
      const r = await ctx.checkout([['P001', 2], ['P005', 1]]);
      check(r.status === 201 && r.body.receipt, show(r));
      const p1 = await ctx.stock('STORE_001', 'P001'); const p5 = await ctx.stock('STORE_001', 'P005');
      check(p1 === 38 && p5 === 49, `stock P001=${p1}, P005=${p5}`);
      const h = await ctx.as('ho1').get('/api/sales/history?storeId=STORE_001');
      check(h.body.totalCount === 1, `receipts stored: ${h.body.totalCount}`);
      return `201, receipt ${r.body.receipt.id}; P001=38, P005=49; 1 receipt`;
    },
  },
  {
    ...S, id: 'TC-0604-002', trace: 'US-06.4 AC3, BR-07, FR-INV-04', area: 'Sale commit',
    title: 'Each sold line records one SALE stock movement with the sold quantity',
    type: 'Functional', priority: 'High', pre: PRE_CASHIER,
    steps: ['POST checkout P001 x2, P005 x1', 'Read STORE_001 stock movements'],
    data: 'P001 x2, P005 x1',
    expected: 'Two new SALE movements: P001 qty 2, P005 qty 1, actor = cashier1.',
    auto: async (ctx) => {
      await ctx.checkout([['P001', 2], ['P005', 1]]);
      const movs = (await ctx.movements('STORE_001')).filter((m) => m.type === 'SALE');
      const p1 = movs.find((m) => m.productId === 'P001'); const p5 = movs.find((m) => m.productId === 'P005');
      check(movs.length === 2 && p1 && p1.quantity === 2 && p5 && p5.quantity === 1, movs);
      check(p1.actorId === 'U001', `actor ${p1.actorId}`);
      return '2 SALE movements (P001 2, P005 1), actor U001';
    },
  },
  {
    ...S, id: 'TC-0604-003', trace: 'US-06.4 AC3, FR-POS-04', area: 'Totals',
    title: 'Server computes subtotal and total from catalog prices (client prices ignored)',
    type: 'Functional', priority: 'High', pre: PRE_CASHIER + ' No promotion code sent.',
    steps: ['POST checkout P002 x2 with a tampered unitPrice=1 in the line'],
    data: 'P002 price 45, qty 2, client unitPrice 1',
    expected: 'subtotal = 90, discount = 0, total = 90; line unit price 45.',
    auto: async (ctx) => {
      const r = await ctx.as('cashier1').post('/api/checkout', {
        items: [{ productId: 'P002', quantity: 2, unitPrice: 1, price: 1 }], paymentMethod: 'CASH',
      });
      check(r.status === 201, show(r));
      const s = r.body.receipt;
      check(s.subtotal === 90 && s.total === 90 && s.items[0].unitPrice === 45, s);
      return `subtotal ${s.subtotal}, total ${s.total}, unit ${s.items[0].unitPrice}`;
    },
  },
  {
    ...S, id: 'TC-0604-004', trace: 'BR-05, FR-POS-06', area: 'Price snapshot',
    title: 'Receipt keeps the unit price at sale time after the product price changes',
    type: 'Functional', priority: 'Medium', pre: PRE_CASHIER + ' ho1 can edit products.',
    steps: ['Sell P001 x1 at 15', 'HO changes P001 price to 99', 'Read the receipt from sales history'],
    data: 'P001 15 → 99',
    expected: 'Stored receipt line still shows unit price 15 and total 15.',
    auto: async (ctx) => {
      const r = await ctx.checkout([['P001', 1]]);
      await ctx.as('ho1').put('/api/products/P001', { price: 99 });
      const h = await ctx.as('ho1').get('/api/sales/history?storeId=STORE_001');
      const sale = h.body.transactions.find((s) => s.id === r.body.receipt.id);
      check(sale && sale.items[0].unitPrice === 15 && sale.total === 15, sale);
      return 'unit price 15 kept after price change to 99';
    },
  },
  {
    ...S, id: 'TC-0604-005', trace: 'US-06.4 AC3, FR-AUD-01', area: 'Audit',
    title: 'Completed sale is written to the audit log',
    type: 'Functional', priority: 'Medium', pre: PRE_CASHIER,
    steps: ['Complete a sale', 'HO reads audit log'],
    data: 'P005 x1',
    expected: 'One audit entry for the sale (actor cashier1, store STORE_001, sale id).',
    auto: async (ctx) => {
      const r = await ctx.checkout([['P005', 1]]);
      const a = await findAudit(ctx, 'CHECKOUT_SALE', r.body.receipt.id);
      check(a && a.userId === 'U001' && a.storeId === 'STORE_001', a || 'no audit entry');
      return `audit ${a.action} by ${a.userName} on ${a.resource}`;
    },
  },
  {
    ...S, id: 'TC-0604-006', trace: 'FR-POS-08, US-06.5 AC1', area: 'Receipt number',
    title: 'Receipt number follows <StoreCode>-<yyyyMMdd>-<6-digit sequence>',
    type: 'Functional', priority: 'Medium', pre: PRE_CASHIER,
    steps: ['Complete two sales', 'Inspect receipt numbers'],
    data: 'P005 x1 twice',
    expected: 'Receipt numbers match ^<store code>-\\d{8}-\\d{6}$, are unique and sequential.',
    auto: async (ctx) => {
      const a = (await ctx.checkout([['P005', 1]])).body.receipt;
      const b = (await ctx.checkout([['P005', 1]])).body.receipt;
      const no = (s) => s.receiptNo || s.invoiceNo || s.receiptNumber || s.id;
      const re = /^[A-Z0-9_]+-\d{8}-\d{6}$/;
      check(re.test(no(a)) && re.test(no(b)) && no(a) !== no(b), `receipt numbers: ${no(a)}, ${no(b)}`);
      return `${no(a)}, ${no(b)}`;
    },
  },

  // ------------------------------------------------------------ payment rules
  {
    ...S, id: 'TC-0604-007', trace: 'US-06.4 AC1, FR-POS-05, D-01', area: 'Payment method',
    title: 'Each BA payment method (CASH, BANK_TRANSFER_QR, CARD) is accepted and stored',
    type: 'Functional', priority: 'High', pre: PRE_CASHIER,
    steps: ['Complete one sale per method', 'Inspect stored paymentMethod'],
    data: 'CASH (amountTendered = total), BANK_TRANSFER_QR, CARD',
    expected: 'All three return 201 and store the exact method value.',
    auto: async (ctx) => {
      const out = [];
      for (const m of ['CASH', 'BANK_TRANSFER_QR', 'CARD']) {
        const r = await ctx.checkout([['P005', 1]], { paymentMethod: m, amountTendered: 12 });
        check(r.status === 201 && r.body.receipt.paymentMethod === m, `${m}: ${show(r)}`);
        out.push(m);
      }
      return `accepted ${out.join(', ')}`;
    },
  },
  {
    ...S, id: 'TC-0604-008', trace: 'US-06.4 AC1, FR-POS-05, D-01', area: 'Payment method',
    title: 'Unknown payment method is rejected',
    type: 'Negative', priority: 'Medium', pre: PRE_CASHIER,
    steps: ['POST checkout with paymentMethod = "BITCOIN"'],
    data: 'paymentMethod BITCOIN',
    expected: 'HTTP 400; no receipt; stock unchanged.',
    auto: async (ctx) => {
      const r = await ctx.checkout([['P005', 1]], { paymentMethod: 'BITCOIN' });
      const q = await ctx.stock('STORE_001', 'P005');
      check(r.status === 400 && q === 50, `${show(r)}; P005=${q}`);
      return `${r.status}; P005 unchanged`;
    },
  },
  {
    ...S, id: 'TC-0604-009', trace: 'US-06.4 AC2, FR-POS-05', area: 'Cash payment',
    title: 'Cash payment with amount tendered below total is blocked',
    type: 'Negative', priority: 'High', pre: PRE_CASHIER,
    steps: ['POST checkout P002 x1 (total 45), CASH, amountTendered 20'],
    data: 'total 45, tendered 20',
    expected: 'HTTP 400; no receipt; stock unchanged.',
    auto: async (ctx) => {
      const r = await ctx.checkout([['P002', 1]], { paymentMethod: 'CASH', amountTendered: 20 });
      const q = await ctx.stock('STORE_001', 'P002');
      check(r.status === 400 && q === 8, `${show(r)}; P002=${q}`);
      return `${r.status}; P002 unchanged`;
    },
  },
  {
    ...S, id: 'TC-0604-010', trace: 'US-06.4 AC2, FR-POS-05, US-06.5 AC1', area: 'Cash payment',
    title: 'Cash payment with amount tendered ≥ total records tendered amount and change',
    type: 'Functional', priority: 'High', pre: PRE_CASHIER,
    steps: ['POST checkout P002 x1 (total 45), CASH, amountTendered 50'],
    data: 'total 45, tendered 50',
    expected: 'HTTP 201; receipt stores amount tendered 50 and change 5.',
    auto: async (ctx) => {
      const r = await ctx.checkout([['P002', 1]], { paymentMethod: 'CASH', amountTendered: 50 });
      check(r.status === 201, show(r));
      const s = r.body.receipt;
      const tendered = s.amountTendered ?? s.cashReceived; const change = s.change ?? s.changeAmount;
      check(tendered === 50 && change === 5, `receipt tendered=${tendered}, change=${change}`);
      return 'tendered 50, change 5';
    },
  },

  // -------------------------------------------------------------- stock rules
  {
    ...S, id: 'TC-0604-011', trace: 'US-06.4 AC4, BR-06, FR-POS-06', area: 'Stock check',
    title: 'Sale is rejected when a line exceeds stock; nothing is deducted (full rollback)',
    type: 'Negative', priority: 'High', pre: PRE_CASHIER,
    steps: ['POST checkout P001 x2 (enough) + P004 x5 (stock 3)', 'Read stock and movements'],
    data: 'P001 x2, P004 x5',
    expected: 'HTTP 409; P001 stays 40, P004 stays 3; no SALE movement; no receipt.',
    auto: async (ctx) => {
      const r = await ctx.checkout([['P001', 2], ['P004', 5]]);
      const p1 = await ctx.stock('STORE_001', 'P001'); const p4 = await ctx.stock('STORE_001', 'P004');
      const sales = (await ctx.movements('STORE_001')).filter((m) => m.type === 'SALE');
      check(r.status === 409 && p1 === 40 && p4 === 3 && sales.length === 0, `${show(r)}; P001=${p1}, P004=${p4}, SALE movements=${sales.length}`);
      return `409; P001=40, P004=3; no movement`;
    },
  },
  {
    ...S, id: 'TC-0604-012', trace: 'US-06.4 AC4, BR-06', area: 'Stock check',
    title: 'Stock rejection response lists every short line with its remaining stock',
    type: 'Functional', priority: 'Medium', pre: PRE_CASHIER,
    steps: ['POST checkout P002 x9 (stock 8) + P004 x4 (stock 3)'],
    data: 'P002 x9, P004 x4',
    expected: 'HTTP 409 whose body lists both short lines (P002 remaining 8, P004 remaining 3).',
    auto: async (ctx) => {
      const r = await ctx.checkout([['P002', 9], ['P004', 4]]);
      const body = JSON.stringify(r.body || '');
      check(r.status === 409 && /P002|Denim/.test(body) && /P004|Rain/.test(body) && /\b8\b/.test(body) && /\b3\b/.test(body), show(r));
      return show(r);
    },
  },
  {
    ...S, id: 'TC-0604-013', trace: 'BR-06', area: 'Stock check',
    title: 'Duplicate lines of the same product are summed for the stock check',
    type: 'Negative', priority: 'High', pre: PRE_CASHIER,
    steps: ['POST checkout with two separate lines P004 x2 and P004 x2 (stock 3)'],
    data: 'P004 x2 + P004 x2 = 4 > 3',
    expected: 'HTTP 409; P004 stays 3 (stock never negative).',
    auto: async (ctx) => {
      const r = await ctx.checkout([['P004', 2], ['P004', 2]]);
      const q = await ctx.stock('STORE_001', 'P004');
      check(r.status === 409 && q === 3, `${show(r)}; P004=${q}`);
      return `409; P004=3`;
    },
  },
  {
    ...S, id: 'TC-0604-014', trace: 'US-06.4 AC4, NFR-05', area: 'Concurrency',
    title: 'Parallel tills cannot oversell the last units',
    type: 'Integrity', priority: 'High', pre: PRE_CASHIER + ' A second cashier (cashier1b) exists at STORE_001.',
    steps: ['Fire 6 checkouts of P004 x1 in parallel from 2 cashiers (stock 3)', 'Read stock and SALE movements'],
    data: 'P004 stock 3, 6 parallel requests',
    expected: 'Exactly 3 succeed (201), 3 rejected (409); P004 = 0; 3 SALE movements.',
    auto: async (ctx) => {
      await ctx.createUser('cashier1b', 'CASHIER', 'STORE_001');
      const users = ['cashier1', 'cashier1b'];
      await Promise.all(users.map((u) => ctx.token(u)));
      const rs = await Promise.all([...Array(6)].map((_, i) => ctx.checkout([['P004', 1]], {}, users[i % 2])));
      const ok = rs.filter((r) => r.status === 201).length; const rej = rs.filter((r) => r.status === 409).length;
      const q = await ctx.stock('STORE_001', 'P004');
      const sales = (await ctx.movements('STORE_001')).filter((m) => m.type === 'SALE' && m.productId === 'P004');
      check(ok === 3 && rej === 3 && q === 0 && sales.length === 3, `201×${ok}, 409×${rej}, P004=${q}, SALE=${sales.length}`);
      return '201×3, 409×3, P004=0, 3 SALE movements';
    },
  },

  // ---------------------------------------------------------------- idempotency
  {
    ...S, id: 'TC-0604-015', trace: 'US-06.4 AC5, BR-07, FR-POS-07, NFR-07', area: 'Idempotency',
    title: 'Same sale sent 3 times with the same idempotency key creates one receipt',
    type: 'Integrity', priority: 'High', pre: PRE_CASHIER,
    steps: ['POST checkout P005 x1 with idempotencyKey K three times (sequential)', 'Read stock and receipts'],
    data: 'idempotencyKey = qc-key-1',
    expected: 'Same receipt returned each time; 1 receipt stored; P005 50→49.',
    auto: async (ctx) => {
      const rs = [];
      for (let i = 0; i < 3; i++) rs.push(await ctx.checkout([['P005', 1]], { idempotencyKey: 'qc-key-1' }));
      const ids = new Set(rs.map((r) => r.body && r.body.receipt && r.body.receipt.id));
      const q = await ctx.stock('STORE_001', 'P005');
      const h = await ctx.as('ho1').get('/api/sales/history?storeId=STORE_001');
      check(ids.size === 1 && q === 49 && h.body.totalCount === 1, `distinct receipts ${ids.size}, P005=${q}, stored ${h.body.totalCount}`);
      return '1 receipt, P005=49';
    },
  },
  {
    ...S, id: 'TC-0604-016', trace: 'US-06.4 AC5, NFR-07', area: 'Idempotency',
    title: 'Duplicate requests sent in parallel (flaky network) deduct stock once',
    type: 'Integrity', priority: 'High', pre: PRE_CASHIER,
    steps: ['Fire 3 identical checkouts P005 x1 with the same idempotencyKey in parallel'],
    data: 'idempotencyKey = qc-key-2',
    expected: '1 receipt stored; P005 50→49.',
    auto: async (ctx) => {
      await ctx.token('cashier1');
      await Promise.all([1, 2, 3].map(() => ctx.checkout([['P005', 1]], { idempotencyKey: 'qc-key-2' })));
      const q = await ctx.stock('STORE_001', 'P005');
      const h = await ctx.as('ho1').get('/api/sales/history?storeId=STORE_001');
      check(q === 49 && h.body.totalCount === 1, `P005=${q}, receipts stored ${h.body.totalCount}`);
      return '1 receipt, P005=49';
    },
  },

  // ----------------------------------------------------------- input validation
  {
    ...S, id: 'TC-0604-017', trace: 'US-06.2 AC1, BR-12', area: 'Validation',
    title: 'Fractional quantity is rejected',
    type: 'Negative', priority: 'High', pre: PRE_CASHIER,
    steps: ['POST checkout P001 x1.5'],
    data: 'quantity 1.5',
    expected: 'HTTP 400; P001 stays 40.',
    auto: async (ctx) => {
      const r = await ctx.checkout([['P001', 1.5]]);
      const q = await ctx.stock('STORE_001', 'P001');
      check(r.status === 400 && q === 40, `${show(r)}; P001=${q}`);
      return '400; P001=40';
    },
  },
  {
    ...S, id: 'TC-0604-018', trace: 'US-06.2 AC1, BR-12', area: 'Validation',
    title: 'Non-decimal numeric strings ("0x2", "1e0") are rejected as quantity',
    type: 'Negative', priority: 'Medium', pre: PRE_CASHIER,
    steps: ['POST checkout P001 quantity "0x2"', 'POST checkout P001 quantity "1e0"'],
    data: '"0x2", "1e0"',
    expected: 'HTTP 400 for both; P001 stays 40.',
    auto: async (ctx) => {
      const a = await ctx.checkout([['P001', '0x2']]); const b = await ctx.checkout([['P001', '1e0']]);
      const q = await ctx.stock('STORE_001', 'P001');
      check(a.status === 400 && b.status === 400 && q === 40, `"0x2" → ${a.status}, "1e0" → ${b.status}; P001=${q}`);
      return 'both 400; P001=40';
    },
  },
  {
    ...S, id: 'TC-0604-019', trace: 'US-06.2 AC1', area: 'Validation',
    title: 'Zero / negative quantity and empty cart are rejected',
    type: 'Negative', priority: 'Medium', pre: PRE_CASHIER,
    steps: ['POST checkout P001 x0', 'POST checkout P001 x-1', 'POST checkout with items = []'],
    data: '0, -1, []',
    expected: 'HTTP 400 for all three; no receipt.',
    auto: async (ctx) => {
      const rs = [await ctx.checkout([['P001', 0]]), await ctx.checkout([['P001', -1]]), await ctx.checkout([])];
      check(rs.every((r) => r.status === 400), rs.map((r) => r.status).join(', '));
      return '400, 400, 400';
    },
  },
  {
    ...S, id: 'TC-0604-020', trace: 'US-06.1 AC2', area: 'Validation',
    title: 'Unknown product in the cart rejects the whole sale',
    type: 'Negative', priority: 'Medium', pre: PRE_CASHIER,
    steps: ['POST checkout P001 x1 + PXXX x1'],
    data: 'productId PXXX',
    expected: 'HTTP 4xx (invalid product); P001 stays 40.',
    auto: async (ctx) => {
      const r = await ctx.checkout([['P001', 1], ['PXXX', 1]]);
      const q = await ctx.stock('STORE_001', 'P001');
      check(r.status >= 400 && r.status < 500 && q === 40, `${show(r)}; P001=${q}`);
      return `${r.status}; P001=40`;
    },
  },
  {
    ...S, id: 'TC-0604-021', trace: 'BR-04, US-04.3 AC1', area: 'Validation',
    title: 'Inactive product cannot be sold',
    type: 'Negative', priority: 'Medium', pre: PRE_CASHIER + ' ho1 sets P001 status INACTIVE.',
    steps: ['HO PUT /products/P001 {status: "INACTIVE"}', 'POST checkout P001 x1'],
    data: 'P001 INACTIVE',
    expected: 'Checkout rejected (4xx); P001 stays 40.',
    auto: async (ctx) => {
      await ctx.as('ho1').put('/api/products/P001', { status: 'INACTIVE' });
      const r = await ctx.checkout([['P001', 1]]);
      const q = await ctx.stock('STORE_001', 'P001');
      check(r.status >= 400 && q === 40, `${show(r)}; P001=${q}`);
      return `${r.status}; P001=40`;
    },
  },

  // --------------------------------------------------------------- authorization
  {
    ...S, id: 'TC-0604-022', trace: '§2.2 SALE_CREATE, FR-ACC-04', area: 'Authorization',
    title: 'Only Cashier can complete a sale (Inventory Staff, Store Manager, HO, Admin get 403)',
    type: 'Security', priority: 'High', pre: 'Fresh seed DB.',
    steps: ['POST checkout P005 x1 as inventory1, manager1, ho1, admin1'],
    data: '4 non-cashier roles',
    expected: 'HTTP 403 for every role; P005 at STORE_001 stays 50.',
    auto: async (ctx) => {
      const users = ['inventory1', 'manager1', 'ho1', 'admin1'];
      const st = [];
      for (const u of users) st.push((await ctx.checkout([['P005', 1]], {}, u)).status);
      const q = await ctx.stock('STORE_001', 'P005');
      check(st.every((s) => s === 403) && q === 50, `${users.map((u, i) => `${u}=${st[i]}`).join(', ')}; P005=${q}`);
      return '403 ×4; P005=50';
    },
  },
  {
    ...S, id: 'TC-0604-023', trace: 'FR-ACC-04, §2.3', area: 'Authorization',
    title: 'Checkout without a valid token is rejected',
    type: 'Security', priority: 'High', pre: 'Fresh seed DB.',
    steps: ['POST checkout with no Authorization header', 'POST checkout with a forged token'],
    data: 'no token; "Bearer forged.token.value"',
    expected: 'HTTP 401 for both; stock unchanged.',
    auto: async (ctx) => {
      const body = { items: [{ productId: 'P005', quantity: 1 }], paymentMethod: 'CASH' };
      const a = await ctx.as(null).raw('POST', '/api/checkout', null, body);
      const b = await ctx.as(null).raw('POST', '/api/checkout', 'forged.token.value', body);
      check(a.status === 401 && b.status === 401, `no token ${a.status}, forged ${b.status}`);
      return '401, 401';
    },
  },
  {
    ...S, id: 'TC-0604-024', trace: 'BR-02, §2.3, US-01.2 AC4', area: 'Store scope',
    title: 'Sale always binds to the cashier’s active store; a storeId in the body cannot redirect it',
    type: 'Security', priority: 'High', pre: PRE_CASHIER,
    steps: ['POST checkout P005 x1 with body storeId = STORE_002', 'Read P005 stock at both stores'],
    data: 'storeId STORE_002 (out of scope)',
    expected: 'Sale is not recorded against STORE_002: either rejected 403, or recorded at STORE_001 only (STORE_002 P005 stays 40).',
    auto: async (ctx) => {
      const r = await ctx.checkout([['P005', 1]], { storeId: 'STORE_002' });
      const s1 = await ctx.stock('STORE_001', 'P005'); const s2 = await ctx.stock('STORE_002', 'P005');
      const okReject = r.status === 403 && s1 === 50 && s2 === 40;
      const okOwn = r.status === 201 && r.body.receipt.storeId === 'STORE_001' && s1 === 49 && s2 === 40;
      check(okReject || okOwn, `${show(r)}; S1 P005=${s1}, S2 P005=${s2}`);
      return `${r.status}; recorded at ${r.body.receipt ? r.body.receipt.storeId : '-'}; STORE_002 untouched`;
    },
  },

  // ------------------------------------------------------------- promotion / persistence
  {
    ...S, id: 'TC-0604-025', trace: 'BR-17, SD-01, US-09.3 AC1/AC4', area: 'Promotion',
    title: 'Active promotion is applied automatically at commit without a code (floor per line)',
    type: 'Functional', priority: 'Medium', pre: PRE_CASHIER + ' Seed promotion "Autumn 10% Off" is active 2026-01-01..2026-12-31.',
    steps: ['POST checkout P003 x1 (65) with no promotionCode'],
    data: 'P003 x1 = 65, 10% → line discount floor(6.5) = 6',
    expected: 'discount 6, total 59, promotion snapshotted on the receipt.',
    notes: 'Promotion is RF-09 (S5) but SD-01 applies it inside sale completion. Date-dependent: seed promo ends 2026-12-31.',
    auto: async (ctx) => {
      const r = await ctx.checkout([['P003', 1]]);
      check(r.status === 201, show(r));
      const s = r.body.receipt;
      check(s.discount === 6 && s.total === 59, `discount ${s.discount}, total ${s.total}, promotion ${s.promotionCode}`);
      return 'discount 6, total 59';
    },
  },
  {
    ...S, id: 'TC-0604-026', trace: 'BR-07, NFR-14', area: 'Persistence',
    title: 'Completed sale and stock deduction survive a server restart',
    type: 'Integrity', priority: 'High', pre: PRE_CASHIER,
    steps: ['Complete sale P002 x3', 'Restart the server on the same DB file', 'Read history and stock'],
    data: 'P002 x3 (8 → 5)',
    expected: 'After restart the receipt is still listed and P002 = 5.',
    auto: async (ctx) => {
      const r = await ctx.checkout([['P002', 3]]);
      await ctx.restart();
      ctx.tokens = {};
      const h = await ctx.as('ho1').get('/api/sales/history?storeId=STORE_001');
      const q = await ctx.stock('STORE_001', 'P002');
      check(h.body.transactions.some((s) => s.id === r.body.receipt.id) && q === 5, `listed=${h.body.transactions.length}, P002=${q}`);
      return 'receipt listed, P002=5 after restart';
    },
  },
  {
    ...S, id: 'TC-0604-027', trace: 'BR-12, NFR-06, FR-INV-08', area: 'Stock integrity',
    title: 'After a mixed sales session, stock reconciles with seed + SALE movements',
    type: 'Integrity', priority: 'High', pre: PRE_CASHIER,
    steps: ['Run 5 successful and 2 rejected checkouts', 'Reconcile every (store, product)'],
    data: 'mixed carts',
    expected: 'No mismatch: on-hand = seed + Σ movements for every store/product; on-hand is an integer ≥ 0.',
    auto: async (ctx) => {
      for (const c of [[['P001', 2]], [['P002', 1], ['P005', 3]], [['P004', 9]], [['P003', 4]], [['P001', 1], ['P003', 1]], [['P002', 99]], [['P005', 10]]]) await ctx.checkout(c);
      const problems = await ctx.reconcile();
      check(problems.length === 0, problems.join('; '));
      return 'all stores/products reconcile';
    },
  },

  // ----------------------------------------------------------------- manual UI
  {
    ...S, id: 'TC-0604-M01', trace: 'US-06.4 AC1, D-01', area: 'POS UI',
    title: 'POS offers exactly Cash, Bank transfer/QR and Card as payment methods',
    type: 'UI', priority: 'Medium', pre: 'Client running; signed in as cashier1.',
    steps: ['Open Checkout', 'Add any product', 'Look at the payment method buttons'],
    data: '-', expected: 'Three options: Cash, Bank transfer/QR, Card; nothing else.',
    notes: 'Static review of checkout-page.tsx: UI offers Card / Cash / Mobile Wallet — expected to fail.',
  },
  {
    ...S, id: 'TC-0604-M02', trace: 'US-06.4 AC2', area: 'POS UI',
    title: 'Cash payment: Complete is disabled while tendered < total and change due is shown when ≥ total',
    type: 'UI', priority: 'High', pre: 'Client running; signed in as cashier1.',
    steps: ['Add P002 x1 (45)', 'Select Cash', 'Enter tendered 20, then 50'],
    data: 'tendered 20 / 50', expected: '20 → Complete disabled; 50 → change due 5 shown.',
    notes: 'Static review: no tendered-amount input exists in checkout-page.tsx.',
  },
  {
    ...S, id: 'TC-0604-M03', trace: 'US-06.4 AC4', area: 'POS UI',
    title: 'When the server rejects a sale for stock, the short lines and remaining stock are highlighted',
    type: 'UI', priority: 'Medium', pre: 'Two browsers: cashier1 and a second cashier at STORE_001.',
    steps: ['Both add P004 x3 to the cart', 'First completes', 'Second completes'],
    data: 'P004 stock 3', expected: 'Second sale is rejected; P004 line is flagged with remaining stock 0; cart kept.',
    notes: 'Static review: UI shows a toast with the server error only.',
  },
  {
    ...S, id: 'TC-0604-M04', trace: 'US-06.4 AC3, US-06.5 AC1', area: 'POS UI',
    title: 'After completion the receipt shows all mandatory fields and the cart is cleared',
    type: 'UI', priority: 'Medium', pre: 'Signed in as cashier1.',
    steps: ['Complete a sale with 2 products, Cash'],
    data: '-', expected: 'Receipt shows receipt no., store name/address, cashier, time, lines (name, qty, unit price, amount), promotion + discount, total, method, tendered, change. Cart empty after closing.',
  },
  {
    ...S, id: 'TC-0604-M05', trace: 'US-06.4 AC5', area: 'POS UI',
    title: 'Double-clicking Complete checkout creates only one receipt',
    type: 'UI', priority: 'Medium', pre: 'Signed in as cashier1; DevTools network throttling "Slow 3G".',
    steps: ['Add a product, select method', 'Double-click Complete checkout quickly'],
    data: '-', expected: 'One receipt in Recent Sales; stock deducted once.',
  },
];
