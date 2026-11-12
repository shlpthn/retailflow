'use strict';
// US-06.6 (sprint backlog) — Sales history filters + store-scope permission tests (Sprint 3)
// BA mapping: US-07.1 AC1–AC4, BR-02, BR-08, BR-09, FR-POS-10, FR-ACC-04, SD-02, activity 8.4, §2.2 SALE_VIEW.
// Endpoint under test today: GET /api/sales/history (alias /transactions). SD-02 names it GET /sales
// with query params from, to, receiptNo, cashier, storeId; pagination param assumed `page` (20 rows/page).
const { check, show } = require('../lib/harness');

const S = { sprint: 'S3', backlog: 'US-06.6' };
const H = '/api/sales/history';
const PRE = 'Fresh seed DB. Sales created through POST /api/checkout as listed in Test data.';

/** Seed a few sales: STORE_001 by cashier1 (x2) and cashier1b (x1). */
async function seedStore1(ctx) {
  await ctx.createUser('cashier1b', 'CASHIER', 'STORE_001');
  const a = (await ctx.checkout([['P001', 1]], { paymentMethod: 'CASH' }, 'cashier1')).body.receipt;
  const b = (await ctx.checkout([['P005', 2]], { paymentMethod: 'CARD' }, 'cashier1')).body.receipt;
  const c = (await ctx.checkout([['P003', 1]], { paymentMethod: 'CASH' }, 'cashier1b')).body.receipt;
  return { a, b, c };
}
/** One sale at STORE_002 (needs a cashier there). */
async function seedStore2(ctx) {
  await ctx.createUser('cashier2', 'CASHIER', 'STORE_002');
  return (await ctx.checkout([['P002', 1]], { paymentMethod: 'CASH' }, 'cashier2')).body.receipt;
}
const ids = (r) => ((r.body && (r.body.transactions || r.body.sales)) || []).map((s) => s.id);

module.exports = [
  // ------------------------------------------------------------ store scope
  {
    ...S, id: 'TC-0606-001', trace: 'US-07.1 AC2, BR-09', area: 'Store scope',
    title: 'Cashier sees all completed receipts of the assigned store (not only own receipts)',
    type: 'Functional', priority: 'High', pre: PRE,
    steps: ['cashier1 x2 and cashier1b x1 sell at STORE_001; cashier2 sells at STORE_002', 'cashier1 GET history'],
    data: '3 receipts at STORE_001, 1 at STORE_002',
    expected: 'cashier1 sees the 3 STORE_001 receipts (incl. cashier1b’s) and none from STORE_002.',
    auto: async (ctx) => {
      const { a, b, c } = await seedStore1(ctx); const d = await seedStore2(ctx);
      const got = ids(await ctx.as('cashier1').get(H));
      check([a.id, b.id, c.id].every((x) => got.includes(x)) && !got.includes(d.id), `cashier1 sees ${JSON.stringify(got)}; cashier1b receipt ${c.id}`);
      return `sees ${got.length} receipts of STORE_001`;
    },
  },
  {
    ...S, id: 'TC-0606-002', trace: 'US-07.1 AC2, BR-09', area: 'Store scope',
    title: 'Store Manager sees only receipts of the assigned store',
    type: 'Functional', priority: 'High', pre: PRE,
    steps: ['Seed receipts at both stores', 'manager1 GET history'],
    data: '3 at STORE_001, 1 at STORE_002',
    expected: '3 STORE_001 receipts, 0 from STORE_002.',
    auto: async (ctx) => {
      const { a, b, c } = await seedStore1(ctx); const d = await seedStore2(ctx);
      const got = ids(await ctx.as('manager1').get(H));
      check([a.id, b.id, c.id].every((x) => got.includes(x)) && !got.includes(d.id), got);
      return `sees ${got.length} receipts, all STORE_001`;
    },
  },
  {
    ...S, id: 'TC-0606-003', trace: 'US-07.1 AC3, BR-02, FR-ACC-04, SD-02', area: 'Store scope',
    title: 'Cashier requesting another store’s history gets 403 and a DENIED audit entry',
    type: 'Security', priority: 'High', pre: PRE,
    steps: ['Seed receipts at both stores', 'cashier1 GET history?storeId=STORE_002', 'HO reads audit log'],
    data: 'storeId STORE_002 (out of scope)',
    expected: 'HTTP 403; no STORE_002 data returned; audit entry with result DENIED for cashier1.',
    auto: async (ctx) => {
      await seedStore1(ctx); const d = await seedStore2(ctx);
      const r = await ctx.as('cashier1').get(`${H}?storeId=STORE_002`);
      check(!ids(r).includes(d.id), 'STORE_002 receipt leaked: ' + show(r));
      const denied = (await ctx.audit()).filter((a) => /DENIED/i.test(JSON.stringify(a)));
      check(r.status === 403 && denied.length > 0, `HTTP ${r.status}, silently returned ${r.body && r.body.storeId} data instead of 403; DENIED audit entries: ${denied.length}`);
      return '403 + DENIED audit';
    },
  },
  {
    ...S, id: 'TC-0606-004', trace: 'US-07.1 AC3, BR-02, FR-ACC-04', area: 'Store scope',
    title: 'Store Manager requesting another store’s history gets 403 and a DENIED audit entry',
    type: 'Security', priority: 'High', pre: PRE,
    steps: ['Seed receipts at both stores', 'manager1 GET history?storeId=STORE_002'],
    data: 'storeId STORE_002 (out of scope)',
    expected: 'HTTP 403 (no data leak) and a DENIED audit entry.',
    auto: async (ctx) => {
      await seedStore1(ctx); const d = await seedStore2(ctx);
      const r = await ctx.as('manager1').get(`${H}?storeId=STORE_002`);
      check(!ids(r).includes(d.id), 'STORE_002 receipt leaked: ' + show(r));
      const denied = (await ctx.audit()).filter((a) => /DENIED/i.test(JSON.stringify(a)));
      check(r.status === 403 && denied.length > 0, `HTTP ${r.status}, silently returned ${r.body && r.body.storeId} data instead of 403; DENIED audit entries: ${denied.length}`);
      return '403 + DENIED audit';
    },
  },
  {
    ...S, id: 'TC-0606-005', trace: 'US-07.1 AC2, BR-09, §2.2 SALE_VIEW', area: 'Store scope',
    title: 'HO Manager with no store filter sees receipts of the whole chain',
    type: 'Functional', priority: 'High', pre: PRE,
    steps: ['Seed receipts at both stores', 'ho1 GET history (no storeId)'],
    data: '3 at STORE_001, 1 at STORE_002',
    expected: 'All 4 receipts listed.',
    auto: async (ctx) => {
      await seedStore1(ctx); await seedStore2(ctx);
      const got = ids(await ctx.as('ho1').get(H));
      check(got.length === 4, `HO sees ${got.length} receipts: ${JSON.stringify(got)}`);
      return 'HO sees 4 receipts chain-wide';
    },
  },
  {
    ...S, id: 'TC-0606-006', trace: 'US-07.1 AC2, BR-09', area: 'Store scope',
    title: 'HO Manager can filter history by store',
    type: 'Functional', priority: 'High', pre: PRE,
    steps: ['Seed receipts at both stores', 'ho1 GET history?storeId=STORE_002'],
    data: 'storeId STORE_002',
    expected: 'Only the STORE_002 receipt.',
    auto: async (ctx) => {
      await seedStore1(ctx); const d = await seedStore2(ctx);
      const got = ids(await ctx.as('ho1').get(`${H}?storeId=STORE_002`));
      check(got.length === 1 && got[0] === d.id, got);
      return 'only STORE_002 receipt';
    },
  },
  {
    ...S, id: 'TC-0606-007', trace: 'BR-02', area: 'Store scope',
    title: 'HO Manager filtering by an unknown store gets a clean 4xx',
    type: 'Negative', priority: 'Low', pre: PRE,
    steps: ['ho1 GET history?storeId=STORE_999'],
    data: 'STORE_999', expected: 'HTTP 404 (or 400) with an error message; no data.',
    auto: async (ctx) => {
      const r = await ctx.as('ho1').get(`${H}?storeId=STORE_999`);
      check(r.status === 404 || r.status === 400, show(r));
      return show(r);
    },
  },
  {
    ...S, id: 'TC-0606-008', trace: '§2.2 SALE_VIEW, FR-ACC-04', area: 'Authorization',
    title: 'Inventory Staff and System Admin cannot read sales history',
    type: 'Security', priority: 'High', pre: PRE,
    steps: ['inventory1 GET history', 'admin1 GET history', 'admin1 GET history?storeId=STORE_001'],
    data: '-', expected: 'HTTP 403 for all.',
    auto: async (ctx) => {
      const st = [await ctx.as('inventory1').get(H), await ctx.as('admin1').get(H), await ctx.as('admin1').get(`${H}?storeId=STORE_001`)].map((r) => r.status);
      check(st.every((s) => s === 403), st.join(', '));
      return '403 ×3';
    },
  },
  {
    ...S, id: 'TC-0606-009', trace: 'FR-ACC-04, §2.3', area: 'Authorization',
    title: 'History without a valid token is rejected',
    type: 'Security', priority: 'High', pre: PRE,
    steps: ['GET history with no token', 'GET history with a token signed by another secret'],
    data: '-', expected: 'HTTP 401 for both.',
    auto: async (ctx) => {
      const a = await ctx.as(null).raw('GET', H, null);
      const forged = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJVMDA2Iiwicm9sZSI6IkhFQURfT0ZGSUNFX01BTkFHRVIifQ.x';
      const b = await ctx.as(null).raw('GET', H, forged);
      check(a.status === 401 && b.status === 401, `${a.status}, ${b.status}`);
      return '401, 401';
    },
  },
  {
    ...S, id: 'TC-0606-010', trace: '§2.3 (role/store change on next request), US-02.2 AC1', area: 'Store scope',
    title: 'Reassigning a Store Manager to another store changes history scope on the next request',
    type: 'Security', priority: 'Medium', pre: PRE,
    steps: ['Seed receipts at both stores', 'manager1 reads history (STORE_001)', 'admin1 moves manager1 to STORE_002', 'manager1 reads history again with the same token'],
    data: 'manager1 STORE_001 → STORE_002',
    expected: 'Second read returns only STORE_002 receipts.',
    auto: async (ctx) => {
      await seedStore1(ctx); const d = await seedStore2(ctx);
      await ctx.as('manager1').get(H);
      await ctx.as('admin1').put('/api/users/U004', { storeId: 'STORE_002' });
      const got = ids(await ctx.as('manager1').get(H));
      check(got.length === 1 && got[0] === d.id, got);
      return 'scope switched to STORE_002 immediately';
    },
  },
  {
    ...S, id: 'TC-0606-011', trace: '§2.3, US-02.3 AC1', area: 'Authorization',
    title: 'Deactivated user is locked out of history on the next request',
    type: 'Security', priority: 'Medium', pre: PRE,
    steps: ['manager1 reads history', 'admin1 disables manager1', 'manager1 reads history again'],
    data: '-', expected: 'Second read returns 401.',
    auto: async (ctx) => {
      await ctx.as('manager1').get(H);
      await ctx.as('admin1').put('/api/users/U004', { disabled: true });
      const r = await ctx.as('manager1').get(H);
      check(r.status === 401, show(r));
      return '401 after deactivation';
    },
  },

  // ---------------------------------------------------------------- filters
  {
    ...S, id: 'TC-0606-012', trace: 'US-07.1 AC1, FR-POS-10', area: 'Filters',
    title: 'Date range filter returns only receipts within [from, to]',
    type: 'Functional', priority: 'High', pre: PRE,
    steps: ['Seed STORE_001 receipts (all dated today)', 'manager1 GET history?from=<tomorrow>&to=<tomorrow>', 'manager1 GET history?from=<today>&to=<today>'],
    data: 'from/to = yyyy-MM-dd',
    expected: 'Tomorrow range → 0 rows; today range → 3 rows.',
    auto: async (ctx) => {
      await seedStore1(ctx);
      const today = new Date().toISOString().slice(0, 10);
      const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      const a = ids(await ctx.as('manager1').get(`${H}?from=${tomorrow}&to=${tomorrow}`));
      const b = ids(await ctx.as('manager1').get(`${H}?from=${today}&to=${today}`));
      check(a.length === 0 && b.length === 3, `tomorrow → ${a.length} rows, today → ${b.length} rows`);
      return 'tomorrow 0, today 3';
    },
  },
  {
    ...S, id: 'TC-0606-013', trace: 'US-07.1 AC1, FR-POS-10', area: 'Filters',
    title: 'Receipt number filter returns exactly that receipt',
    type: 'Functional', priority: 'High', pre: PRE,
    steps: ['Seed STORE_001 receipts', 'manager1 GET history?receiptNo=<2nd receipt>'],
    data: 'receiptNo of receipt b',
    expected: 'Exactly 1 row: receipt b.',
    auto: async (ctx) => {
      const { b } = await seedStore1(ctx);
      const no = b.receiptNo || b.id;
      const got = ids(await ctx.as('manager1').get(`${H}?receiptNo=${encodeURIComponent(no)}`));
      check(got.length === 1 && got[0] === b.id, `receiptNo=${no} → ${JSON.stringify(got)}`);
      return '1 row';
    },
  },
  {
    ...S, id: 'TC-0606-014', trace: 'US-07.1 AC1, FR-POS-10', area: 'Filters',
    title: 'Cashier filter returns only that cashier’s receipts',
    type: 'Functional', priority: 'Medium', pre: PRE,
    steps: ['Seed STORE_001 receipts (cashier1 x2, cashier1b x1)', 'manager1 GET history?cashier=<cashier1b id>'],
    data: 'cashier = id of cashier1b',
    expected: 'Exactly 1 row: receipt c.',
    auto: async (ctx) => {
      const { c } = await seedStore1(ctx);
      const got = ids(await ctx.as('manager1').get(`${H}?cashier=${c.cashierId}`));
      check(got.length === 1 && got[0] === c.id, `cashier=${c.cashierId} → ${JSON.stringify(got)}`);
      return '1 row';
    },
  },
  {
    ...S, id: 'TC-0606-015', trace: 'US-07.1 AC1, FR-POS-10', area: 'Filters',
    title: 'Payment method filter returns only receipts paid with that method',
    type: 'Functional', priority: 'Medium', pre: PRE,
    steps: ['Seed STORE_001 receipts (CASH x2, CARD x1)', 'manager1 GET history?paymentMethod=CARD'],
    data: 'paymentMethod CARD',
    expected: 'Exactly 1 row: receipt b.',
    auto: async (ctx) => {
      const { b } = await seedStore1(ctx);
      const got = ids(await ctx.as('manager1').get(`${H}?paymentMethod=CARD`));
      check(got.length === 1 && got[0] === b.id, got);
      return '1 row';
    },
  },
  {
    ...S, id: 'TC-0606-016', trace: 'US-07.1 AC1, AC2, BR-09', area: 'Filters',
    title: 'Filters cannot widen scope: Store Manager filtering by a cashier of another store gets nothing',
    type: 'Security', priority: 'High', pre: PRE,
    steps: ['Seed receipts at both stores', 'manager1 GET history?cashier=<cashier2 id>'],
    data: 'cashier2 belongs to STORE_002',
    expected: 'No STORE_002 receipt returned (0 rows or 403).',
    auto: async (ctx) => {
      await seedStore1(ctx); const d = await seedStore2(ctx);
      const r = await ctx.as('manager1').get(`${H}?cashier=${d.cashierId}`);
      check(!ids(r).includes(d.id), show(r));
      return `${r.status}; no STORE_002 rows`;
    },
  },
  {
    ...S, id: 'TC-0606-017', trace: 'US-07.1 AC1, FR-POS-10, NFR-03', area: 'Pagination',
    title: 'Results are paginated 20 rows per page, newest first',
    type: 'Functional', priority: 'Medium', pre: PRE,
    steps: ['cashier1 completes 25 sales of P005 x1', 'manager1 GET history (page 1)', 'manager1 GET history?page=2'],
    data: '25 receipts',
    expected: 'Page 1: 20 rows, newest first. Page 2: the remaining 5 rows, no overlap with page 1. Total count 25.',
    auto: async (ctx) => {
      for (let i = 0; i < 25; i++) await ctx.checkout([['P005', 1]]);
      const p1 = await ctx.as('manager1').get(H); const p2 = await ctx.as('manager1').get(`${H}?page=2`);
      const a = p1.body.transactions; const b = p2.body.transactions;
      const sorted = a.every((s, i) => i === 0 || a[i - 1].createdAt >= s.createdAt);
      const overlap = b.filter((s) => a.some((x) => x.id === s.id)).length;
      check(a.length === 20 && sorted, `page1 rows ${a.length}, newest-first ${sorted}`);
      check(b.length === 5 && overlap === 0 && p1.body.totalCount === 25, `page2 rows ${b.length}, overlap ${overlap}, total ${p1.body.totalCount}`);
      return '20 + 5 rows, newest first';
    },
  },
  {
    ...S, id: 'TC-0606-018', trace: 'US-07.1 AC1', area: 'Result columns',
    title: 'Each row exposes receipt number, time, cashier, item count, total and payment method',
    type: 'Functional', priority: 'Low', pre: PRE,
    steps: ['Seed STORE_001 receipts', 'manager1 GET history', 'Inspect first row'],
    data: '-',
    expected: 'Row has receipt number, timestamp, cashier name, item count (or lines), total, payment method.',
    auto: async (ctx) => {
      await seedStore1(ctx);
      const row = (await ctx.as('manager1').get(H)).body.transactions[0];
      const has = { receiptNo: !!(row.receiptNo || row.invoiceNo), time: !!row.createdAt, cashier: !!row.cashierName, items: Array.isArray(row.items) || row.itemCount != null, total: row.total != null, paymentMethod: !!row.paymentMethod };
      const missing = Object.entries(has).filter(([, v]) => !v).map(([k]) => k);
      check(missing.length === 0, 'missing: ' + missing.join(', '));
      return 'all columns present';
    },
  },
  {
    ...S, id: 'TC-0606-019', trace: 'US-07.1 AC4, BR-08, FR-POS-13', area: 'Read-only',
    title: 'No API can modify or delete a completed sale',
    type: 'Security', priority: 'High', pre: PRE,
    steps: ['Seed a receipt', 'As manager1 and ho1: PUT, PATCH, DELETE /api/sales/<id>; POST /api/sales/<id>/cancel, /refund, /return'],
    data: '-',
    expected: 'Every call is rejected (404/405/403); the receipt is unchanged.',
    auto: async (ctx) => {
      const { a } = await seedStore1(ctx);
      const st = [];
      for (const u of ['manager1', 'ho1']) {
        const c = ctx.as(u);
        st.push((await c.put(`/api/sales/${a.id}`, { total: 0 })).status, (await c.patch(`/api/sales/${a.id}`, { total: 0 })).status,
          (await c.del(`/api/sales/${a.id}`)).status, (await c.post(`/api/sales/${a.id}/cancel`)).status,
          (await c.post(`/api/sales/${a.id}/refund`)).status, (await c.post(`/api/sales/${a.id}/return`)).status);
      }
      const still = (await ctx.as('ho1').get(`${H}?storeId=STORE_001`)).body.transactions.find((s) => s.id === a.id);
      check(st.every((s) => [403, 404, 405].includes(s)) && still && still.total === a.total, `${st.join(', ')}; total ${still && still.total}`);
      return 'all rejected; receipt unchanged';
    },
  },

  // ----------------------------------------------------------------- manual UI
  {
    ...S, id: 'TC-0606-M01', trace: 'US-07.1 AC1', area: 'History UI',
    title: 'History screen offers date range (default today), receipt no., cashier and payment method filters',
    type: 'UI', priority: 'Medium', pre: 'Signed in as manager1.',
    steps: ['Open Sales'], data: '-',
    expected: 'All four filters present; date range defaults to today; results update on apply.',
    notes: 'Static review: sales-page.tsx and recent-sales-dialog.tsx have no filter controls.',
  },
  {
    ...S, id: 'TC-0606-M02', trace: 'US-07.1 AC4, BR-08', area: 'History UI',
    title: 'History list and receipt view offer no cancel / return / refund / edit action',
    type: 'UI', priority: 'High', pre: 'Signed in as cashier1, manager1, ho1 in turn.',
    steps: ['Open history', 'Open a receipt'], data: '-',
    expected: 'Only view / reprint actions are available.',
  },
  {
    ...S, id: 'TC-0606-M03', trace: 'US-07.1 AC2, activity 8.4', area: 'History UI',
    title: 'Store selector: Cashier/SM limited to assigned stores, HO can pick any store or all',
    type: 'UI', priority: 'Medium', pre: 'Signed in as manager1, then ho1.',
    steps: ['Open the store selector on the history screen'], data: '-',
    expected: 'SM sees only assigned store(s); HO sees all stores plus "All stores".',
  },
  {
    ...S, id: 'TC-0606-M04', trace: '§2.2, activity 8.4', area: 'History UI',
    title: 'Sales menu is hidden for Inventory Staff and System Admin',
    type: 'UI', priority: 'Low', pre: 'Signed in as inventory1, then admin1.',
    steps: ['Look at the sidebar', 'Navigate to #/sales directly'], data: '-',
    expected: 'No Sales menu; direct URL redirects with an access message.',
  },
];
