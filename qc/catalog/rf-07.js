'use strict';
// PBI RF-07 — Completed sales history · Sprint 3 backlog item US-06.6 = BA US-07.1
const { check, show, blocked } = require('../lib/harness');
const {
  need, FRESH_DATA, signedIn, accounts, API_CLIENT, READY, history, historyIds, isoDay,
} = require('./common');


async function seedStore1(ctx) {
  await ctx.createUser('cashier1b', 'CASHIER', 'STORE_001');
  const a = (await ctx.checkout([['P001', 1]], { paymentMethod: 'CASH' })).body.receipt;
  const b = (await ctx.checkout([['P005', 2]], { paymentMethod: 'CARD' })).body.receipt;
  const c = (await ctx.checkout([['P003', 1]], { paymentMethod: 'CASH' }, 'cashier1b')).body.receipt;
  return { a, b, c };
}
async function seedStore2(ctx) {
  await ctx.createUser('cashier2', 'CASHIER', 'STORE_002');
  return (await ctx.checkout([['P002', 1]], { paymentMethod: 'CASH' }, 'cashier2')).body.receipt;
}
const denied = async (ctx) => (await ctx.audit()).filter((a) => /DENIED/i.test(JSON.stringify(a))).length;

module.exports = [{
  pbi: 'RF-07', sprint: 'S3', backlog: 'US-06.6', id: 'US-07.1', name: 'Search completed sales history',
  story: 'As a Cashier, I want to search the completed sales of my store so that I can verify previous transactions when a customer asks. (Sprint backlog item US-06.6 "filters + store-scope permission tests".)',
  acs: [
    { id: 'AC1', text: 'Filter by date range (default today), receipt number, cashier and payment method; results are paginated 20 rows per page, newest first, showing receipt number, time, cashier, item count, total and payment method.', rules: 'FR-POS-10, NFR-03' },
    { id: 'AC2', text: 'Cashier / Store Manager see only receipts of their assigned stores (active store by default, switchable among assigned stores); HO Manager sees the whole chain and can filter by store.', rules: 'BR-09, BR-02, §2.2 SALE_VIEW' },
    { id: 'AC3', text: 'Given a request for a store outside the user\'s scope, the server returns 403 and writes a DENIED audit entry.', rules: 'BR-02, FR-ACC-04, NFR-10' },
    { id: 'AC4', text: 'The list offers no cancel, return, refund or edit action.', rules: 'BR-08, D-03, FR-POS-13' },
  ],
  cases: [
    {
      id: 'TC-07.1-01', ac: 'AC1', type: 'Functional', name: 'Date range filter, defaulting to today',
      description: 'Only receipts inside the chosen range are listed; without a range the list shows today.',
      pre: need(FRESH_DATA, signedIn('manager1', 'Sales history'), "Two completed sales at Downtown Store made today, and one Downtown sale dated three days ago (back-dated in the test database)."), preExpect: READY,
      steps: [
        ['As manager1 open Sales history without changing the date range.', 'Default range is today; the 2 receipts of today are listed.'],
        ['Set the range from 5 days ago to today.', '3 receipts are listed.'],
        ['Set the range to tomorrow only.', 'No receipts are listed.'],
      ],
      auto: async (ctx) => {
        await ctx.checkout([['P001', 1]]); await ctx.checkout([['P005', 1]]);
        const old = (await ctx.checkout([['P003', 1]])).body.receipt;
        await ctx.ageStored('sales', old.id, 72); ctx.tokens = {};
        ctx.at(1);
        const a = historyIds(await history(ctx, 'manager1'));
        check(a.length === 2, `default list shows ${a.length} receipts (incl. the one from 3 days ago)`);
        ctx.at(2, '2 receipts');
        const b = historyIds(await history(ctx, 'manager1', `from=${isoDay(-5)}&to=${isoDay(0)}`));
        check(b.length === 3, `${b.length} receipts`);
        ctx.at(3, '3 receipts');
        const c = historyIds(await history(ctx, 'manager1', `from=${isoDay(1)}&to=${isoDay(1)}`));
        check(c.length === 0, `${c.length} receipts for tomorrow`);
      },
    },
    {
      id: 'TC-07.1-02', ac: 'AC1', type: 'Functional', name: 'Filter by receipt number',
      description: 'Searching a receipt number returns exactly that receipt.',
      pre: need(FRESH_DATA, signedIn('manager1', 'Sales history'), "Completed sales at Downtown Store: cashier1 sold 1 Classic T-Shirt (Cash) and 2 Baseball Caps (Card); cashier1b, a second Downtown cashier created by admin1, sold 1 pair of Running Sneakers (Cash)."), preExpect: READY,
      steps: [['As manager1 open Sales history and note the receipt number of the Baseball Cap x2 sale.', 'The receipt is in the list.'],
        ['Enter that receipt number in the receipt-number filter.', 'Exactly one row: that receipt.']],
      auto: async (ctx) => {
        const { b } = await seedStore1(ctx);
        ctx.at(1); ctx.saw(`receipt ${b.id}`);
        ctx.at(2);
        const got = historyIds(await history(ctx, 'manager1', `receiptNo=${encodeURIComponent(b.receiptNo || b.id)}`));
        check(got.length === 1 && got[0] === b.id, `filter receiptNo=${b.receiptNo || b.id} returned ${got.length} rows`);
      },
    },
    {
      id: 'TC-07.1-03', ac: 'AC1', type: 'Functional', name: 'Filter by cashier (cannot reach another store)',
      description: 'The cashier filter narrows the list to one cashier and never widens the store scope.',
      pre: need(FRESH_DATA, signedIn('manager1', 'Sales history'), "Completed sales at Downtown Store: cashier1 sold 1 Classic T-Shirt (Cash) and 2 Baseball Caps (Card); cashier1b, a second Downtown cashier created by admin1, sold 1 pair of Running Sneakers (Cash).", "A completed sale at Uptown Store: cashier2, an Uptown cashier created by admin1, sold 1 pair of Denim Jeans (Cash)."), preExpect: READY,
      steps: [['As manager1 filter Sales history by cashier "cashier1b".', 'Exactly one row: the Sneakers sale.'],
        ['Filter by cashier "cashier2" (an Uptown cashier).', 'No rows — Uptown receipts never appear for a Downtown manager.']],
      auto: async (ctx) => {
        const { c } = await seedStore1(ctx); const d = await seedStore2(ctx);
        ctx.at(1);
        const got = historyIds(await history(ctx, 'manager1', `cashier=${c.cashierId}`));
        check(got.length === 1 && got[0] === c.id, `cashier filter returned ${got.length} rows`);
        ctx.at(2, '1 row');
        const other = historyIds(await history(ctx, 'manager1', `cashier=${d.cashierId}`));
        check(!other.includes(d.id), 'Uptown receipt returned');
        ctx.saw(`${other.length} rows, no Uptown receipt`);
      },
    },
    {
      id: 'TC-07.1-04', ac: 'AC1', type: 'Functional', name: 'Filter by payment method',
      description: 'Only receipts paid with the chosen method are listed.',
      pre: need(FRESH_DATA, signedIn('manager1', 'Sales history'), "Completed sales at Downtown Store: cashier1 sold 1 Classic T-Shirt (Cash) and 2 Baseball Caps (Card); cashier1b, a second Downtown cashier created by admin1, sold 1 pair of Running Sneakers (Cash)."), preExpect: READY,
      steps: [['As manager1 filter Sales history by payment method Card.', 'Exactly one row: the Baseball Cap x2 sale.']],
      auto: async (ctx) => {
        const { b } = await seedStore1(ctx);
        ctx.at(1);
        const got = historyIds(await history(ctx, 'manager1', 'paymentMethod=CARD'));
        check(got.length === 1 && got[0] === b.id, `${got.length} rows`);
      },
    },
    {
      id: 'TC-07.1-05', ac: 'AC1', type: 'Functional', name: 'Pagination of 20 rows, newest first, with all columns',
      description: 'Page size, ordering and the columns shown for each receipt.',
      pre: need(FRESH_DATA, signedIn('manager1', 'Sales history'), "25 completed sales of 1 Baseball Cap each, made by cashier1 at Downtown Store."), preExpect: READY,
      steps: [
        ['As manager1 open Sales history.', 'Page 1 shows 20 rows, newest first; total count 25.'],
        ['Go to page 2.', 'The remaining 5 older receipts; none repeated from page 1.'],
        ['Check the columns of a row.', 'Receipt number, time, cashier, item count, total and payment method are shown.'],
      ],
      auto: async (ctx) => {
        for (let i = 0; i < 25; i++) await ctx.checkout([['P005', 1]]);
        ctx.at(1);
        const p1 = (await history(ctx, 'manager1')).body;
        const sorted = p1.transactions.every((s, i, a) => i === 0 || a[i - 1].createdAt >= s.createdAt);
        check(p1.transactions.length === 20 && sorted && p1.totalCount === 25, `${p1.transactions.length} rows, newest first ${sorted}, total ${p1.totalCount}`);
        ctx.at(2, '20 rows, newest first, total 25');
        const p2 = (await history(ctx, 'manager1', 'page=2')).body.transactions;
        const overlap = p2.filter((s) => p1.transactions.some((x) => x.id === s.id)).length;
        check(p2.length === 5 && overlap === 0, `page 2: ${p2.length} rows, ${overlap} repeated from page 1`);
        ctx.at(3, '5 rows');
        const row = p1.transactions[0];
        const missing = Object.entries({ 'receipt number': row.receiptNo || row.invoiceNo, time: row.createdAt, cashier: row.cashierName, items: row.items, total: row.total, 'payment method': row.paymentMethod }).filter(([, v]) => v == null).map(([k]) => k);
        check(missing.length === 0, 'missing column(s): ' + missing.join(', '));
      },
    },
    {
      id: 'TC-07.1-06', ac: 'AC2', type: 'Functional', name: 'Cashier sees every receipt of the assigned store',
      description: 'Store scope for Cashier is the store, not only the cashier\'s own receipts.',
      pre: need(FRESH_DATA, accounts('cashier1'), "Completed sales at Downtown Store: cashier1 sold 1 Classic T-Shirt (Cash) and 2 Baseball Caps (Card); cashier1b, a second Downtown cashier created by admin1, sold 1 pair of Running Sneakers (Cash).", "A completed sale at Uptown Store: cashier2, an Uptown cashier created by admin1, sold 1 pair of Denim Jeans (Cash)."), preExpect: READY,
      steps: [['Sign in as cashier1 and open sales history (Recent Sales).', 'The 3 Downtown receipts are listed, including cashier1b\'s Sneakers sale; no Uptown receipt.']],
      auto: async (ctx) => {
        const { a, b, c } = await seedStore1(ctx); const d = await seedStore2(ctx);
        ctx.at(1);
        const got = historyIds(await history(ctx, 'cashier1'));
        check([a.id, b.id, c.id].every((x) => got.includes(x)) && !got.includes(d.id), `cashier1 sees ${got.length} receipts; cashier1b's receipt listed: ${got.includes(c.id)}`);
      },
    },
    {
      id: 'TC-07.1-07', ac: 'AC2', type: 'Functional', name: 'Store Manager sees only receipts of the assigned store',
      description: 'Store scope for Store Manager.',
      pre: need(FRESH_DATA, accounts('manager1'), "Completed sales at Downtown Store: cashier1 sold 1 Classic T-Shirt (Cash) and 2 Baseball Caps (Card); cashier1b, a second Downtown cashier created by admin1, sold 1 pair of Running Sneakers (Cash).", "A completed sale at Uptown Store: cashier2, an Uptown cashier created by admin1, sold 1 pair of Denim Jeans (Cash)."), preExpect: READY,
      steps: [['Sign in as manager1 and open Sales history.', 'The 3 Downtown receipts; the Uptown receipt is not listed.']],
      auto: async (ctx) => {
        const { a, b, c } = await seedStore1(ctx); const d = await seedStore2(ctx);
        ctx.at(1);
        const got = historyIds(await history(ctx, 'manager1'));
        check([a.id, b.id, c.id].every((x) => got.includes(x)) && !got.includes(d.id), `${got.length} receipts`);
        ctx.saw('3 Downtown receipts');
      },
    },
    {
      id: 'TC-07.1-08', ac: 'AC2', type: 'Functional', name: 'HO Manager sees the whole chain by default',
      description: 'Without a store filter, HO sees receipts of every store.',
      pre: need(FRESH_DATA, accounts('ho1'), "Completed sales at Downtown Store: cashier1 sold 1 Classic T-Shirt (Cash) and 2 Baseball Caps (Card); cashier1b, a second Downtown cashier created by admin1, sold 1 pair of Running Sneakers (Cash).", "A completed sale at Uptown Store: cashier2, an Uptown cashier created by admin1, sold 1 pair of Denim Jeans (Cash)."), preExpect: READY,
      steps: [['Sign in as ho1 and open Sales history with "All stores".', 'All 4 receipts (3 Downtown + 1 Uptown).']],
      auto: async (ctx) => {
        await seedStore1(ctx); await seedStore2(ctx);
        ctx.at(1);
        const got = historyIds(await history(ctx, 'ho1'));
        check(got.length === 4, `HO sees ${got.length} receipts`);
      },
    },
    {
      id: 'TC-07.1-09', ac: 'AC2', type: 'Functional', name: 'HO Manager filters history by store',
      description: 'HO narrows the chain-wide list to one store.',
      pre: need(FRESH_DATA, accounts('ho1'), "Completed sales at Downtown Store: cashier1 sold 1 Classic T-Shirt (Cash) and 2 Baseball Caps (Card); cashier1b, a second Downtown cashier created by admin1, sold 1 pair of Running Sneakers (Cash).", "A completed sale at Uptown Store: cashier2, an Uptown cashier created by admin1, sold 1 pair of Denim Jeans (Cash)."), preExpect: READY,
      steps: [['As ho1 choose store Uptown in Sales history.', 'Only the Uptown receipt (Denim Jeans x1).']],
      auto: async (ctx) => {
        await seedStore1(ctx); const d = await seedStore2(ctx);
        ctx.at(1);
        const got = historyIds(await history(ctx, 'ho1', 'storeId=STORE_002'));
        check(got.length === 1 && got[0] === d.id, `${got.length} receipts`);
        ctx.saw('only the Uptown receipt');
      },
    },
    {
      id: 'TC-07.1-10', retired: 'Needs multi-store user assignment (D-04): users carry a single storeId; adding store lists and an active-store switch is a data-model change (BUG-063).', ac: 'AC2', type: 'Functional', name: 'User assigned to two stores starts on the active store and can switch',
      description: 'Multi-store assignment (D-04): default to the active store, switch among assigned stores only.',
      pre: need(FRESH_DATA, accounts('manager1', 'admin1'), "manager1 assigned to both Downtown Store and Uptown Store by admin1 on the Users screen.", "Completed sales at Downtown Store: cashier1 sold 1 Classic T-Shirt (Cash) and 2 Baseball Caps (Card); cashier1b, a second Downtown cashier created by admin1, sold 1 pair of Running Sneakers (Cash).", "A completed sale at Uptown Store: cashier2, an Uptown cashier created by admin1, sold 1 pair of Denim Jeans (Cash)."), preExpect: READY,
      steps: [
        ['Sign in as manager1 and choose Downtown as active store; open Sales history.', 'Downtown receipts are listed.'],
        ['Switch the store to Uptown.', 'Only the Uptown receipt is listed.'],
      ],
      auto: async (ctx) => {
        await seedStore1(ctx); const d = await seedStore2(ctx);
        await ctx.as('admin1').put('/api/users/U004', { storeIds: ['STORE_001', 'STORE_002'] });
        const me = (await ctx.as('manager1').get('/api/auth/me')).body;
        if (!Array.isArray(me.storeIds) || me.storeIds.length < 2) blocked('A user can be assigned to only one store (storeId); multi-store assignment does not exist');
        ctx.at(1);
        const a = historyIds(await history(ctx, 'manager1', 'storeId=STORE_001'));
        check(a.length === 3, `${a.length} receipts`);
        ctx.at(2, '3 Downtown receipts');
        const b = historyIds(await history(ctx, 'manager1', 'storeId=STORE_002'));
        check(b.length === 1 && b[0] === d.id, `${b.length} receipts`);
      },
    },
    {
      id: 'TC-07.1-11', ac: 'AC3', type: 'Security', name: 'Cashier asking for another store\'s history gets 403 and an audit entry',
      description: 'Out-of-scope request by a Cashier is refused and audited.',
      pre: need(FRESH_DATA, accounts('cashier1', 'ho1'), "Completed sales at Downtown Store: cashier1 sold 1 Classic T-Shirt (Cash) and 2 Baseball Caps (Card); cashier1b, a second Downtown cashier created by admin1, sold 1 pair of Running Sneakers (Cash).", "A completed sale at Uptown Store: cashier2, an Uptown cashier created by admin1, sold 1 pair of Denim Jeans (Cash).", API_CLIENT), preExpect: READY,
      steps: [
        ['As cashier1 send GET /api/sales/history?storeId=STORE_002.', 'HTTP 403; no Uptown data in the response.'],
        ['As ho1 open the Audit Log.', 'An entry with result DENIED for cashier1 and store Uptown.'],
      ],
      auto: async (ctx) => {
        await seedStore1(ctx); const d = await seedStore2(ctx);
        ctx.at(1);
        const r = await history(ctx, 'cashier1', 'storeId=STORE_002');
        check(!historyIds(r).includes(d.id), 'Uptown receipt leaked');
        check(r.status === 403, `HTTP ${r.status}: own-store (${r.body && r.body.storeId}) data returned instead of 403`);
        ctx.at(2, '403');
        const n = await denied(ctx);
        check(n > 0, 'no DENIED audit entry');
      },
    },
    {
      id: 'TC-07.1-12', ac: 'AC3', type: 'Security', name: 'Store Manager asking for another store\'s history gets 403 and an audit entry',
      description: 'Out-of-scope request by a Store Manager is refused and audited.',
      pre: need(FRESH_DATA, accounts('manager1', 'ho1'), "Completed sales at Downtown Store: cashier1 sold 1 Classic T-Shirt (Cash) and 2 Baseball Caps (Card); cashier1b, a second Downtown cashier created by admin1, sold 1 pair of Running Sneakers (Cash).", "A completed sale at Uptown Store: cashier2, an Uptown cashier created by admin1, sold 1 pair of Denim Jeans (Cash).", API_CLIENT), preExpect: READY,
      steps: [
        ['As manager1 send GET /api/sales/history?storeId=STORE_002.', 'HTTP 403; no Uptown data.'],
        ['As ho1 open the Audit Log.', 'An entry with result DENIED for manager1.'],
      ],
      auto: async (ctx) => {
        await seedStore1(ctx); const d = await seedStore2(ctx);
        ctx.at(1);
        const r = await history(ctx, 'manager1', 'storeId=STORE_002');
        check(!historyIds(r).includes(d.id), 'Uptown receipt leaked');
        check(r.status === 403, `HTTP ${r.status}: own-store (${r.body && r.body.storeId}) data returned instead of 403`);
        ctx.at(2, '403');
        check((await denied(ctx)) > 0, 'no DENIED audit entry');
      },
    },
    {
      id: 'TC-07.1-13', ac: 'AC3', type: 'Security', name: 'Roles without sales-history access are refused',
      description: 'Inventory Staff and System Admin hold no SALE_VIEW permission (§2.2); requests without a valid token are refused.',
      pre: need(FRESH_DATA, accounts('inventory1', 'admin1'), API_CLIENT), preExpect: READY,
      steps: [
        ['As inventory1 send GET /api/sales/history.', 'HTTP 403.'],
        ['As admin1 send GET /api/sales/history?storeId=STORE_001.', 'HTTP 403.'],
        ['Send GET /api/sales/history without a token.', 'HTTP 401.'],
      ],
      auto: async (ctx) => {
        ctx.at(1);
        const a = await history(ctx, 'inventory1'); check(a.status === 403, show(a));
        ctx.at(2, '403');
        const b = await history(ctx, 'admin1', 'storeId=STORE_001'); check(b.status === 403, show(b));
        ctx.at(3, '403');
        const c = await ctx.as(null).raw('GET', '/api/sales/history', null); check(c.status === 401, show(c));
        ctx.saw('401');
      },
    },
    {
      id: 'TC-07.1-14', ac: 'AC4', type: 'Security', name: 'A completed sale cannot be edited, deleted, cancelled or refunded through the API',
      description: 'The server exposes no write action on a completed sale (FR-POS-13).',
      pre: need(FRESH_DATA, accounts('manager1', 'ho1'), "Completed sales at Downtown Store: cashier1 sold 1 Classic T-Shirt (Cash) and 2 Baseball Caps (Card); cashier1b, a second Downtown cashier created by admin1, sold 1 pair of Running Sneakers (Cash).", API_CLIENT), preExpect: READY,
      steps: [
        ['As manager1 and as ho1 send PUT, PATCH and DELETE /api/sales/<receipt id>, and POST /api/sales/<id>/cancel, /refund, /return.', 'Every call is refused (403, 404 or 405).'],
        ['Re-open the receipt in Sales history.', 'Receipt unchanged (same lines and total).'],
      ],
      auto: async (ctx) => {
        const { a } = await seedStore1(ctx);
        ctx.at(1);
        const st = [];
        for (const u of ['manager1', 'ho1']) {
          const c = ctx.as(u);
          st.push((await c.put(`/api/sales/${a.id}`, { total: 0 })).status, (await c.patch(`/api/sales/${a.id}`, { total: 0 })).status, (await c.del(`/api/sales/${a.id}`)).status,
            (await c.post(`/api/sales/${a.id}/cancel`)).status, (await c.post(`/api/sales/${a.id}/refund`)).status, (await c.post(`/api/sales/${a.id}/return`)).status);
        }
        check(st.every((s) => [403, 404, 405].includes(s)), st.join(', '));
        ctx.at(2, `all refused (${[...new Set(st)].join('/')})`);
        const still = (await history(ctx, 'ho1', 'storeId=STORE_001')).body.transactions.find((s) => s.id === a.id);
        check(still && still.total === a.total, 'receipt changed');
        ctx.saw('unchanged');
      },
    },
    {
      id: 'TC-07.1-15', ac: 'AC4', type: 'UI', name: 'History and receipt views offer no cancel, return, refund or edit action',
      description: 'Manual UI check for every role that can open the history.',
      pre: need(FRESH_DATA, accounts('cashier1', 'manager1', 'ho1'), "Completed sales at Downtown Store: cashier1 sold 1 Classic T-Shirt (Cash) and 2 Baseball Caps (Card); cashier1b, a second Downtown cashier created by admin1, sold 1 pair of Running Sneakers (Cash)."), preExpect: READY,
      steps: [['Sign in as cashier1, manager1 and ho1 in turn; open sales history and open a receipt.', 'Only view (and reprint) actions are available; no cancel, return, refund or edit button.']],
    },
  ],
}];
