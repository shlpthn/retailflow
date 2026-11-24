'use strict';
// PBI RF-10 — Reporting and audit · Sprint 5 (Tasks 75 / 53)
const { check, show } = require('../lib/harness');
const {
  need, FRESH_DATA, accounts, stock, API_CLIENT, PROMO_ON, READY, history, RF08, submitRequest, isoDay, REPORT, salesReport, historyTotals, seedSales, num,
} = require('./common');

const S = { pbi: 'RF-10', sprint: 'S5', backlog: 'RF-10' };
const NOTE = 'No report API exists yet; while the report screen/API is missing the automated run reads the Sales screen figures (GET /api/sales).';
const stockRows = async (ctx, user, q = '') => (await ctx.as(user).get(`/api/inventory${q ? '?' + q : ''}`)).body.rows;
const issueAndShip = async (ctx, req) => {
  await ctx.as('ho1').post(`/api/stock-requests/${req.id}/approve`, { fulfillmentType: 'TRANSFER', sourceStoreId: 'STORE_002' });
  return ((await ctx.as('ho1').get('/api/transfers')).body || []).find((x) => x.stockRequestId === req.id);
};

module.exports = [
  // ============================================================== US-10.1
  {
    ...S, id: 'US-10.1', name: 'Sales report',
    story: 'As an HO Manager, I want to compare store revenue over a period to evaluate performance.',
    acs: [
      { id: 'AC1', text: 'Parameters: date range (default last 7 days), store (HO: all or selected; Store Manager: fixed to own store), group by day / week / month.', rules: 'FR-RPT-01, §2.2 REPORT_VIEW' },
      { id: 'AC2', text: 'Metrics: receipt count, gross revenue, total discount, net revenue, average receipt value; all figures come from completed sales.', rules: 'FR-RPT-01, BR-17' },
      { id: 'AC3', text: 'Figures match the sum of receipts in sales history with the same filters.', rules: 'FR-RPT-01, BR-09' },
    ],
    cases: [
      {
        id: 'TC-10.1-01', ac: 'AC1', type: 'Functional', name: 'Date range defaults to the last 7 days and can be changed',
        description: 'Range parameter and its default.', pre: need(FRESH_DATA, accounts('manager1'), "Two completed sales at Downtown Store made today, and one Downtown sale dated 8 days ago (back-dated in the test database)."), preExpect: READY, notes: NOTE,
        steps: [
          ['As manager1 open the sales report without changing the range.', 'Range = last 7 days; receipt count 1.'],
          ['Set the range to the last 10 days.', 'Receipt count 2.'],
          ['Set the range to tomorrow only.', 'Receipt count 0.'],
        ],
        auto: async (ctx) => {
          await ctx.checkout([['P001', 1]]); const old = (await ctx.checkout([['P005', 1]])).body.receipt;
          await ctx.ageStored('sales', old.id, 8 * 24); ctx.tokens = {};
          ctx.at(1); const a = (await salesReport(ctx, 'manager1')).data.receiptCount; check(a === 1, `count ${a} (receipt from 8 days ago included)`);
          ctx.at(2, '1'); const b = (await salesReport(ctx, 'manager1', `from=${isoDay(-10)}&to=${isoDay(0)}`)).data.receiptCount; check(b === 2, `count ${b}`);
          ctx.at(3, '2'); const c = (await salesReport(ctx, 'manager1', `from=${isoDay(1)}&to=${isoDay(1)}`)).data.receiptCount; check(c === 0, `count ${c}`);
        },
      },
      {
        id: 'TC-10.1-02', ac: 'AC1', type: 'Functional', name: 'Group by day, week or month',
        description: 'Bucketing of the report.', pre: need(FRESH_DATA, accounts('manager1'), "Two completed sales at Downtown Store made today, and one Downtown sale dated 40 days ago (back-dated in the test database)."), preExpect: READY, notes: NOTE,
        steps: [['As manager1 set range = last 60 days and group by Month.', 'Two monthly buckets labelled yyyy-MM.'], ['Group by Day.', 'Two daily buckets labelled yyyy-MM-dd.']],
        auto: async (ctx) => {
          await ctx.checkout([['P001', 1]]); await ctx.checkout([['P005', 1]]); const old = (await ctx.checkout([['P003', 1]])).body.receipt;
          await ctx.ageStored('sales', old.id, 40 * 24); ctx.tokens = {};
          ctx.at(1);
          const m = (await salesReport(ctx, 'manager1', `from=${isoDay(-60)}&to=${isoDay(0)}&groupBy=month`)).data.buckets || [];
          const keys = m.map((b) => b.period || b.month || b.day || b.key);
          check(m.length === 2 && keys.every((k) => /^\d{4}-\d{2}$/.test(k)), `group by month → ${JSON.stringify(keys)}`);
          ctx.at(2, JSON.stringify(keys));
        },
      },
      {
        id: 'TC-10.1-03', ac: 'AC1', type: 'Functional', name: 'HO sees all stores or one selected store',
        description: 'Store parameter for HO.', pre: need(FRESH_DATA, accounts('ho1'), "Completed sales at Downtown Store by cashier1: 2 Classic T-Shirts; 1 Running Sneakers with 2 Baseball Caps; 1 Rain Jacket — 199 in total.", "Completed sales at Uptown Store by cashier2 (an Uptown cashier created by admin1): 3 Denim Jeans; 2 Rain Jackets with 1 Classic T-Shirt — 310 in total. No promotion code used."), preExpect: READY, notes: NOTE,
        steps: [['As ho1 open the sales report with store = All stores.', 'Receipt count 5, net revenue 509.'], ['Select store Uptown.', 'Receipt count 2, net revenue 310.']],
        auto: async (ctx) => {
          await seedSales(ctx);
          ctx.at(1); const a = (await salesReport(ctx, 'ho1')).data; check(a.receiptCount === 5 && num(a.netRevenue) === 509, `count ${a.receiptCount}, revenue ${a.netRevenue} (store ${a.storeId} only)`);
          ctx.at(2, '5 / 509'); const b = (await salesReport(ctx, 'ho1', 'storeId=STORE_002')).data; check(b.receiptCount === 2 && num(b.netRevenue) === 310, `${b.receiptCount} / ${b.netRevenue}`);
        },
      },
      {
        id: 'TC-10.1-04', ac: 'AC1', type: 'Security', name: 'Store Manager is fixed to the own store',
        description: 'SM cannot open another store\'s report.', pre: need(FRESH_DATA, accounts('manager1'), "Completed sales at Downtown Store by cashier1: 2 Classic T-Shirts; 1 Running Sneakers with 2 Baseball Caps; 1 Rain Jacket — 199 in total.", "Completed sales at Uptown Store by cashier2 (an Uptown cashier created by admin1): 3 Denim Jeans; 2 Rain Jackets with 1 Classic T-Shirt — 310 in total. No promotion code used.", API_CLIENT), preExpect: READY, notes: NOTE,
        steps: [['As manager1 open the sales report and try to choose Uptown (or send the report request with storeId=STORE_002).', 'Store selector is fixed to Downtown; the request returns 403 with no Uptown figures.']],
        auto: async (ctx) => {
          await seedSales(ctx);
          ctx.at(1); const r = await salesReport(ctx, 'manager1', 'storeId=STORE_002');
          check(r.status === 403, `HTTP ${r.status}: Downtown figures (${r.data && r.data.receiptCount} receipts) returned instead of 403`);
        },
      },
      {
        id: 'TC-10.1-05', ac: 'AC1', type: 'Security', name: 'Cashier, Inventory Staff and Admin cannot open sales reports',
        description: '§2.2 REPORT_VIEW is ✗ for these roles.', pre: need(FRESH_DATA, accounts('cashier1', 'inventory1', 'admin1'), "At least one completed sale at Downtown Store.", API_CLIENT), preExpect: READY, notes: NOTE,
        steps: [['As cashier1 open the sales report.', 'HTTP 403 / no report menu.'], ['As inventory1 and admin1 open the sales report.', 'HTTP 403 for both.']],
        auto: async (ctx) => {
          await ctx.checkout([['P001', 1]]);
          ctx.at(1); const a = await salesReport(ctx, 'cashier1'); check(a.status === 403, `HTTP ${a.status} — cashier sees revenue ${a.data && a.data.netRevenue}`);
          ctx.at(2, '403'); const st = [(await salesReport(ctx, 'inventory1')).status, (await salesReport(ctx, 'admin1')).status]; check(st.every((s) => s === 403), st.join(', '));
        },
      },
      {
        id: 'TC-10.1-06', ac: 'AC2', type: 'Functional', name: 'Report shows the five metrics and they are consistent',
        description: 'gross − discount = net; average = net / count.', pre: need(FRESH_DATA, accounts('manager1'), PROMO_ON, "Sales by cashier1 at Downtown Store: 1 Running Sneakers with code SAVE10, 2 Classic T-Shirts with code SAVE10, and 1 Rain Jacket without a code."), preExpect: READY, notes: NOTE,
        steps: [['As manager1 open the sales report.', 'Receipt count 3; gross revenue 175 (sum of subtotals); total discount = sum of the three receipts\' discounts; net revenue = gross − discount = sum of totals; average receipt value = net / 3.']],
        auto: async (ctx) => {
          const rs = [(await ctx.checkout([['P003', 1]], { promotionCode: 'SAVE10' })).body.receipt, (await ctx.checkout([['P001', 2]], { promotionCode: 'SAVE10' })).body.receipt, (await ctx.checkout([['P004', 1]])).body.receipt];
          const g = rs.reduce((a, s) => a + s.subtotal, 0); const d = rs.reduce((a, s) => a + s.discount, 0); const n = rs.reduce((a, s) => a + s.total, 0);
          ctx.at(1);
          const x = (await salesReport(ctx, 'manager1')).data; const bad = [];
          if (num(x.grossRevenue) !== num(g)) bad.push(`gross ${x.grossRevenue ?? 'missing'}`);
          if (num(x.totalDiscount) !== num(d)) bad.push(`discount ${x.totalDiscount ?? 'missing'}`);
          if (num(x.netRevenue) !== num(n)) bad.push(`net ${x.netRevenue}`);
          if (num(x.averageReceiptValue) !== num(n / 3)) bad.push(`average ${x.averageReceiptValue ?? 'missing'}`);
          check(bad.length === 0, bad.join('; '));
        },
      },
      {
        id: 'TC-10.1-07', ac: 'AC2', type: 'Functional', name: 'Only completed sales are counted',
        description: 'Rejected checkouts never reach the report.', pre: need(FRESH_DATA, accounts('manager1'), "At Downtown Store cashier1 completed two sales (1 Classic T-Shirt; 2 Baseball Caps) and had two attempts rejected (9 Rain Jackets — not enough stock; an empty cart)."), preExpect: READY, notes: NOTE,
        steps: [['As manager1 open the sales report.', 'Receipt count 2, net revenue 39.']],
        auto: async (ctx) => {
          await ctx.checkout([['P001', 1]]); await ctx.checkout([['P005', 2]]); await ctx.checkout([['P004', 9]]); await ctx.checkout([]);
          ctx.at(1); const d = (await salesReport(ctx, 'manager1')).data; check(d.receiptCount === 2 && num(d.netRevenue) === 39, `${d.receiptCount} / ${d.netRevenue}`);
        },
      },
      {
        id: 'TC-10.1-08', ac: 'AC3', type: 'Functional', name: 'Store report totals equal the sum of that store\'s sales history',
        description: 'Reconciliation of report vs history for a Store Manager.', pre: need(FRESH_DATA, accounts('manager1'), "Completed sales at Downtown Store by cashier1: 2 Classic T-Shirts; 1 Running Sneakers with 2 Baseball Caps; 1 Rain Jacket — 199 in total.", "Completed sales at Uptown Store by cashier2 (an Uptown cashier created by admin1): 3 Denim Jeans; 2 Rain Jackets with 1 Classic T-Shirt — 310 in total. No promotion code used."), preExpect: READY, notes: NOTE,
        steps: [['As manager1 open Sales history and add up the receipts (count, totals).', '3 receipts, 199.'], ['Open the sales report with the same range.', 'Receipt count 3 and net revenue 199 — identical.']],
        auto: async (ctx) => {
          await seedSales(ctx);
          ctx.at(1); const h = await historyTotals(ctx, 'STORE_001'); check(h.count === 3 && h.revenue === 199, JSON.stringify(h));
          ctx.at(2, '3 / 199'); const d = (await salesReport(ctx, 'manager1')).data; check(d.receiptCount === h.count && num(d.netRevenue) === num(h.revenue), `${d.receiptCount} / ${d.netRevenue}`);
          ctx.saw('3 / 199');
        },
      },
      {
        id: 'TC-10.1-09', ac: 'AC3', type: 'Functional', name: 'Chain report totals equal the sum of every store\'s sales history',
        description: 'Reconciliation for HO across the chain.', pre: need(FRESH_DATA, accounts('ho1'), "Completed sales at Downtown Store by cashier1: 2 Classic T-Shirts; 1 Running Sneakers with 2 Baseball Caps; 1 Rain Jacket — 199 in total.", "Completed sales at Uptown Store by cashier2 (an Uptown cashier created by admin1): 3 Denim Jeans; 2 Rain Jackets with 1 Classic T-Shirt — 310 in total. No promotion code used."), preExpect: READY, notes: NOTE,
        steps: [['As ho1 add up Sales history of Downtown and Uptown.', '5 receipts, 509.'], ['Open the sales report for All stores.', 'Receipt count 5 and net revenue 509 — identical.']],
        auto: async (ctx) => {
          await seedSales(ctx);
          ctx.at(1); const a = await historyTotals(ctx, 'STORE_001'); const b = await historyTotals(ctx, 'STORE_002'); check(a.count + b.count === 5 && a.revenue + b.revenue === 509, 'history');
          ctx.at(2, '5 / 509'); const d = (await salesReport(ctx, 'ho1')).data;
          check(d.receiptCount === 5 && num(d.netRevenue) === 509, `report ${d.receiptCount} / ${d.netRevenue} (covers ${d.storeId} only)`);
        },
      },
    ],
  },

  // ============================================================== US-10.2
  {
    ...S, id: 'US-10.2', name: 'Best-selling products',
    story: 'As a Store Manager / HO Manager, I want to see the top-selling products to prioritise replenishment.',
    acs: [{ id: 'AC1', text: 'Top 10 by quantity or net revenue, by date range and store.', rules: 'FR-RPT-02' }],
    cases: [
      {
        id: 'TC-10.2-01', ac: 'AC1', type: 'Functional', name: 'Top 10 products by quantity',
        description: 'Ranking and the limit of 10.', pre: need(FRESH_DATA, accounts('manager1'), "Seven extra products created by ho1 (12 products in total), all stocked at Downtown Store.", "Sales by cashier1 at Downtown Store: product number k sold in quantity k, for k = 1 … 12."), preExpect: READY, notes: NOTE,
        steps: [['As manager1 open Best sellers ranked by quantity.', 'Exactly 10 rows, quantities 12, 11, … , 3.']],
        auto: async (ctx) => {
          const ids = ['P001', 'P002', 'P003', 'P004', 'P005'];
          for (let i = 1; i <= 7; i++) { const p = (await ctx.as('ho1').post('/api/products', { name: `QC X${i}`, price: 10 })).body; await ctx.as('inventory1').post('/api/inventory/add-stock', { productId: p.id, quantity: 20 }); ids.push(p.id); }
          for (const p of ['P002', 'P004']) await ctx.as('inventory1').post('/api/inventory/add-stock', { productId: p, quantity: 20 });
          for (let k = 1; k <= 12; k++) await ctx.checkout([[ids[k - 1], k]]);
          ctx.at(1);
          const r = await ctx.as('manager1').get(REPORT.bestSellers); const rows = r.status === 404 ? (await salesReport(ctx, 'manager1')).data.bestSellers : r.body;
          const q = (rows || []).map((x) => x.qty ?? x.quantity);
          check(JSON.stringify(q) === JSON.stringify([12, 11, 10, 9, 8, 7, 6, 5, 4, 3]), `${q.length} rows: ${q.join(', ')}`);
        },
      },
      {
        id: 'TC-10.2-02', ac: 'AC1', type: 'Functional', name: 'Top products ranked by net revenue',
        description: 'The revenue ranking differs from the quantity ranking.', pre: need(FRESH_DATA, accounts('manager1'), "Sales by cashier1 at Downtown Store: 1 Rain Jacket (80) and 5 Baseball Caps (60)."), preExpect: READY, notes: NOTE,
        steps: [['As manager1 open Best sellers ranked by net revenue.', 'Rain Jacket first (80), Baseball Cap second (60).']],
        auto: async (ctx) => {
          await ctx.checkout([['P004', 1]]); await ctx.checkout([['P005', 5]]);
          ctx.at(1);
          const r = await ctx.as('manager1').get(`${REPORT.bestSellers}?by=revenue`); const rows = r.status === 404 ? (await salesReport(ctx, 'manager1', 'by=revenue')).data.bestSellers : r.body;
          check(/Rain Jacket|P004/.test((rows[0] && (rows[0].name || rows[0].productId)) || ''), `first row ${JSON.stringify(rows[0])}`);
        },
      },
      {
        id: 'TC-10.2-03', ac: 'AC1', type: 'Functional', name: 'Best sellers respect the store filter',
        description: 'Only the chosen store\'s sales are ranked.', pre: need(FRESH_DATA, accounts('ho1'), "Completed sales at Downtown Store by cashier1: 2 Classic T-Shirts; 1 Running Sneakers with 2 Baseball Caps; 1 Rain Jacket — 199 in total.", "Completed sales at Uptown Store by cashier2 (an Uptown cashier created by admin1): 3 Denim Jeans; 2 Rain Jackets with 1 Classic T-Shirt — 310 in total. No promotion code used."), preExpect: READY, notes: NOTE,
        steps: [['As ho1 open Best sellers for store Uptown.', 'Denim Jeans 3, Rain Jacket 2, Classic T-Shirt 1 — no Downtown-only products.']],
        auto: async (ctx) => {
          await seedSales(ctx);
          ctx.at(1);
          const r = await ctx.as('ho1').get(`${REPORT.bestSellers}?storeId=STORE_002`); const rows = r.status === 404 ? (await salesReport(ctx, 'ho1', 'storeId=STORE_002')).data.bestSellers : r.body;
          const names = rows.map((x) => `${x.name} ${x.qty ?? x.quantity}`);
          check(JSON.stringify(names) === JSON.stringify(['Denim Jeans 3', 'Rain Jacket 2', 'Classic T-Shirt 1']), names.join(', '));
          ctx.saw(names.join(', '));
        },
      },
    ],
  },

  // ============================================================== US-10.3
  {
    ...S, id: 'US-10.3', name: 'Stock and low-stock report',
    story: 'As an HO Manager, I want to see stock and low-stock items for every store to coordinate transfers.',
    acs: [
      { id: 'AC1', text: 'Stock table by product × store (HO) or by product (Store Manager); filter by category, low-stock only, zero stock.', rules: 'FR-RPT-03, BR-19, §2.2 REPORT_VIEW' },
      { id: 'AC2', text: 'The dashboard shows the number of low-stock products per store.', rules: 'BR-19, US-05.5' },
    ],
    cases: [
      {
        id: 'TC-10.3-01', ac: 'AC1', type: 'Boundary', name: 'Low-stock flag at the minimum level boundary',
        description: 'BR-19: low when stock ≤ minimum.', pre: need(FRESH_DATA, accounts('manager1'), "Sales by cashier1 at Downtown Store: 25 Classic T-Shirts (40 → 15, minimum level 15), 39 Baseball Caps (50 → 11, minimum level 10) and 3 Rain Jackets (3 → 0)."), preExpect: READY,
        steps: [['As manager1 open the stock report (Inventory) for Downtown.', 'T-Shirt flagged Low stock (15 ≤ 15); Cap not flagged (11 > 10); Rain Jacket flagged Out of stock.']],
        auto: async (ctx) => {
          await ctx.checkout([['P001', 25]]); await ctx.checkout([['P005', 39]]); await ctx.checkout([['P004', 3]]);
          ctx.at(1); const rows = await stockRows(ctx, 'manager1'); const st = (p) => rows.find((r) => r.productId === p).status;
          check(st('P001') === 'LOW_STOCK' && st('P005') === 'OK' && ['OUT_OF_STOCK', 'LOW_STOCK'].includes(st('P004')), `T-Shirt ${st('P001')}, Cap ${st('P005')}, Rain Jacket ${st('P004')}`);
          ctx.saw(`T-Shirt ${st('P001')}, Cap ${st('P005')}, Rain Jacket ${st('P004')}`);
        },
      },
      {
        id: 'TC-10.3-02', ac: 'AC1', type: 'Boundary', name: 'Default minimum level is 0, so a new product is not flagged',
        description: 'BR-19: default level = 0 (no alert).', pre: need(FRESH_DATA, accounts('manager1'), "A new product \"QC Gloves\" created by ho1, with 5 units received at Downtown Store by inventory1 and no minimum level set."), preExpect: READY,
        steps: [['As manager1 open the stock report and find QC Gloves.', 'Minimum level 0; not flagged low.']],
        auto: async (ctx) => {
          const p = (await ctx.as('ho1').post('/api/products', { name: 'QC Gloves', price: 9 })).body; await ctx.as('inventory1').post('/api/inventory/add-stock', { productId: p.id, quantity: 5 });
          ctx.at(1); const row = (await stockRows(ctx, 'manager1')).find((r) => r.productId === p.id);
          check(row.threshold === 0 && row.status === 'OK', `minimum ${row.threshold}, flag ${row.status}`);
        },
      },
      {
        id: 'TC-10.3-03', ac: 'AC1', type: 'Functional', name: 'Filters: low-stock only and zero stock',
        description: 'Narrowing the stock report.', pre: need(FRESH_DATA, accounts('manager1'), "Downtown Store stock: Denim Jeans 8 (minimum level 10); Rain Jacket sold out (0 left)."), preExpect: READY,
        steps: [['As manager1 tick "Low stock only".', 'Only Denim Jeans (8) and Rain Jacket (0).'], ['Tick "Zero stock" instead.', 'Only Rain Jacket.']],
        auto: async (ctx) => {
          await ctx.checkout([['P004', 3]]);
          const get = async (q) => { const r = await ctx.as('manager1').get(`${REPORT.stock}?${q}`); return (r.status === 404 ? await stockRows(ctx, 'manager1', q) : (r.body.rows || r.body)).map((x) => x.productId).sort(); };
          ctx.at(1); const a = await get('lowStockOnly=true'); check(JSON.stringify(a) === '["P002","P004"]', `${a.length} rows: ${a.join(', ')}`);
          ctx.at(2, a.join(', ')); const b = await get('zeroStock=true'); check(JSON.stringify(b) === '["P004"]', `${b.length} rows`);
        },
      },
      {
        id: 'TC-10.3-04', ac: 'AC1', type: 'Functional', name: 'HO stock report is a product × store table',
        description: 'Chain-wide matrix for HO.', pre: need(FRESH_DATA, accounts('ho1'), "Denim Jeans (barcode 0002): 8 units at Downtown Store and 25 at Uptown Store, minimum level 10 at both."), preExpect: READY,
        steps: [['As ho1 open the stock report without choosing a store.', 'One row per product with a column per store, e.g. Denim Jeans: Downtown 8 (low), Uptown 25.']],
        auto: async (ctx) => {
          ctx.at(1); const r = await ctx.as('ho1').get(REPORT.stock);
          check(r.status === 200 && JSON.stringify(r.body).includes('STORE_001') && JSON.stringify(r.body).includes('STORE_002'), `${show(r)} — HO can only open one store at a time`);
        },
      },
      {
        id: 'TC-10.3-05', ac: 'AC1', type: 'Security', name: 'Store Manager cannot open another store\'s stock report',
        description: 'Store scope for the stock report.', pre: need(FRESH_DATA, accounts('manager1'), API_CLIENT), preExpect: READY,
        steps: [['As manager1 request the Uptown stock report (GET /api/inventory?storeId=STORE_002).', 'HTTP 403; no Uptown rows.']],
        auto: async (ctx) => {
          ctx.at(1); const r = await ctx.as('manager1').get('/api/inventory?storeId=STORE_002'); check(r.status === 403, show(r));
        },
      },
      {
        id: 'TC-10.3-06', ac: 'AC2', type: 'Functional', name: 'Dashboard low-stock count per store matches the stock report',
        description: 'Counts shown to HO on the dashboard.', pre: need(FRESH_DATA, accounts('ho1'), "Downtown Store below minimum in the demo data: Denim Jeans 8 (minimum 10) and Rain Jacket 3 (minimum 5).", "Uptown Store: cashier2 (an Uptown cashier created by admin1) sold all 5 Running Sneakers."), preExpect: READY,
        steps: [['As ho1 open Home / Dashboard and read the low-stock count per store.', 'Downtown 2 (Denim Jeans, Rain Jacket); Uptown 1 (Sneakers) — same as the flagged rows of each store.']],
        auto: async (ctx) => {
          await ctx.createUser('cashier2', 'CASHIER', 'STORE_002'); await ctx.checkout([['P003', 5]], {}, 'cashier2');
          ctx.at(1); const out = [];
          for (const s of ['STORE_001', 'STORE_002']) { const b = (await ctx.as('ho1').get(`/api/inventory?storeId=${s}`)).body; out.push([b.activityPanel.lowStockAlerts.length, b.rows.filter((r) => r.status !== 'OK').length]); }
          check(out[0][0] === 2 && out[0][1] === 2 && out[1][0] === 1 && out[1][1] === 1, JSON.stringify(out));
          ctx.saw('Downtown 2, Uptown 1');
        },
      },
    ],
  },

  // ============================================================== US-10.4
  {
    ...S, id: 'US-10.4', name: 'Transfer report',
    story: 'As an HO Manager, I want to see transfers by status and stuck transfers to resolve bottlenecks.',
    acs: [{ id: 'AC1', text: 'Count requests and transfer orders by status and store pair; list requests Submitted for more than 24 hours, and orders Issued for more than 24 hours or In Transit for more than 48 hours [Assumption].', rules: 'FR-RPT-04, OI-11' }],
    cases: [
      {
        id: 'TC-10.4-01', ac: 'AC1', type: 'Functional', name: 'Counts of requests and orders by status and store pair',
        description: 'Transfer report summary.', pre: need(FRESH_DATA, accounts('ho1'), "Three Denim Jeans requests from manager1: one rejected by ho1, one issued from Uptown, and one issued, dispatched and received."), preExpect: READY,
        steps: [['As ho1 open the transfer report.', 'Requests: Rejected 1, In Progress 1, Completed 1. Orders Uptown → Downtown: Issued 1, Received 1.']],
        auto: async (ctx) => {
          const mk = async (q) => (await submitRequest(ctx, [['P002', q]])).body;
          const a = await mk(1); const b = await mk(2); const c = await mk(3);
          await ctx.as('ho1').post(RF08.reject(a.id), { reason: 'QC' }); await issueAndShip(ctx, b); const t = await issueAndShip(ctx, c);
          await ctx.as('inventory2').post(RF08.dispatch(t.id)); await ctx.as('inventory1').post(RF08.receive(t.id));
          ctx.at(1); const r = await ctx.as('ho1').get(REPORT.transfers); check(r.status === 200, `${show(r)} — no transfer report`);
        },
      },
      {
        id: 'TC-10.4-02', ac: 'AC1', type: 'Boundary', name: 'Stuck lists use the 24 h / 48 h thresholds',
        description: 'Records just under and just over each threshold.', pre: need(FRESH_DATA, accounts('ho1'), "Transfer records back-dated in the test database: requests Submitted 25 h and 23 h ago; orders Issued 25 h and 23 h ago; orders In Transit for 49 h and 47 h."), preExpect: READY,
        steps: [['As ho1 open the transfer report, stuck section.', 'Listed: request 25 h, order Issued 25 h, order In Transit 49 h. Not listed: the 23 h, 23 h and 47 h records.']],
        auto: async (ctx) => {
          const mk = async () => (await submitRequest(ctx, [['P002', 1]])).body;
          const r25 = await mk(); const r23 = await mk(); const o25 = await issueAndShip(ctx, await mk()); const o23 = await issueAndShip(ctx, await mk());
          const t49 = await issueAndShip(ctx, await mk()); const t47 = await issueAndShip(ctx, await mk());
          for (const t of [t49, t47]) await ctx.as('inventory2').post(RF08.dispatch(t.id));
          for (const [tb, id, h] of [['stockRequests', r25.id, 25], ['stockRequests', r23.id, 23], ['transfers', o25.id, 25], ['transfers', o23.id, 23], ['transfers', t49.id, 49], ['transfers', t47.id, 47]]) await ctx.ageStored(tb, id, h, ['createdAt', 'issuedAt', 'dispatchedAt', 'submittedAt']);
          ctx.tokens = {};
          ctx.at(1); const r = await ctx.as('ho1').get(REPORT.transfers); check(r.status === 200, `${show(r)} — no transfer report`);
          const body = JSON.stringify(r.body); const has = (id) => body.includes(id);
          check([r25.id, o25.id, t49.id].every(has) && ![r23.id, o23.id, t47.id].some(has), 'threshold mismatch');
        },
      },
      {
        id: 'TC-10.4-03', ac: 'AC1', type: 'Security', name: 'Store-level operators and Admin cannot open the transfer report',
        description: 'Role scope of the transfer report.', pre: need(FRESH_DATA, accounts('cashier1', 'inventory1', 'admin1'), API_CLIENT), preExpect: READY,
        steps: [['Open the transfer report (GET /api/reports/transfers) as cashier1, inventory1 and admin1.', 'HTTP 403 for all three.']],
        auto: async (ctx) => {
          ctx.at(1); const st = []; for (const u of ['cashier1', 'inventory1', 'admin1']) st.push((await ctx.as(u).get(REPORT.transfers)).status);
          check(st.every((s) => s === 403), `${st.join(', ')}${st.includes(404) ? ' — the report does not exist' : ''}`);
        },
      },
    ],
  },

  // ============================================================== US-10.5
  {
    ...S, id: 'US-10.5', name: 'View audit log',
    story: 'As a Store Manager / HO Manager / Admin, I want to look up who did what and when to investigate discrepancies.',
    acs: [
      { id: 'AC1', text: 'Each entry has time, user, role, store, action, object (type + ID), before / after values (if any), result, IP.', rules: 'FR-AUD-01, §7.3 AUDIT_LOG' },
      { id: 'AC2', text: 'Filter by date range, user, action type, object.', rules: 'FR-AUD-02' },
      { id: 'AC3', text: 'Scope: Store Manager — own store; HO — whole chain; Admin — administration actions only (sign-in, users, roles, stores).', rules: 'FR-AUD-02, §2.2 AUDIT_VIEW' },
      { id: 'AC4', text: 'No edit / delete of audit entries via UI or API.', rules: 'BR-18, FR-AUD-03, NFR-12' },
    ],
    cases: [
      {
        id: 'TC-10.5-01', ac: 'AC1', type: 'Functional', name: 'Audit entry contains every required field',
        description: 'Content of one entry.', pre: need(FRESH_DATA, accounts('ho1'), "inventory1 has received 5 Classic T-Shirts at Downtown Store."), preExpect: READY,
        steps: [['As ho1 open the Audit Log and open the stock-receipt entry.', 'Time, user, role, store, action, object type and ID, before / after quantity, result (Success) and IP are all shown.']],
        auto: async (ctx) => {
          await ctx.as('inventory1').post('/api/inventory/add-stock', { productId: 'P001', quantity: 5 });
          ctx.at(1); const e = (await ctx.audit()).find((a) => /STOCK|RECEIVE/.test(a.action));
          const f = { time: e.occurredAt || e.createdAt, user: e.userId, role: e.role, store: e.storeId, action: e.action, objectType: e.entityType, objectId: e.entityId || e.resource, before: e.before, after: e.after, result: e.result, ip: e.ip };
          const miss = Object.entries(f).filter(([, v]) => v == null || v === '').map(([k]) => k);
          check(miss.length === 0, 'missing: ' + miss.join(', '));
        },
      },
      {
        id: 'TC-10.5-02', ac: 'AC1', type: 'Functional', name: 'Successful and failed sign-ins are recorded',
        description: 'Sign-in is an audited action (US-01.1 AC5).', pre: need(FRESH_DATA, accounts('cashier1', 'admin1')), preExpect: READY,
        steps: [['Sign in as cashier1; sign out; try to sign in as cashier1 with a wrong password.', 'Second attempt fails with "Invalid credentials".'], ['As admin1 open the Audit Log.', 'One successful and one failed sign-in entry for cashier1.']],
        auto: async (ctx) => {
          ctx.at(1); await ctx.token('cashier1'); const r = await ctx.as(null).raw('POST', '/api/auth/login', null, { username: 'cashier1', password: 'wrong' }); check(r.status === 401, show(r));
          ctx.at(2, '401'); const n = (await ctx.as('admin1').get(REPORT.audit)).body.filter((a) => /LOGIN|SIGN/i.test(a.action)).length; check(n >= 2, `${n} sign-in entries`);
        },
      },
      {
        id: 'TC-10.5-03', ac: 'AC1', type: 'Security', name: 'Denied requests are recorded with result DENIED',
        description: 'Wrong-role and wrong-store attempts leave a trace.', pre: need(FRESH_DATA, accounts('cashier1', 'manager1', 'ho1'), API_CLIENT), preExpect: READY,
        steps: [['As cashier1 send POST /api/products; as manager1 send GET /api/inventory?storeId=STORE_002.', 'Both return 403.'], ['As ho1 open the Audit Log.', 'Two entries with result DENIED naming the user and the target.']],
        auto: async (ctx) => {
          ctx.at(1); const a = await ctx.as('cashier1').post('/api/products', { name: 'x', price: 1 }); const b = await ctx.as('manager1').get('/api/inventory?storeId=STORE_002'); check(a.status === 403 && b.status === 403, `${a.status}, ${b.status}`);
          ctx.at(2, '403, 403'); const n = (await ctx.audit()).filter((e) => /DENIED/i.test(JSON.stringify(e))).length; check(n >= 2, `${n} DENIED entries`);
        },
      },
      {
        id: 'TC-10.5-04', ac: 'AC2', type: 'Functional', name: 'Filter the audit log by user, action type and date range',
        description: 'Narrowing the audit log.', pre: need(FRESH_DATA, accounts('ho1'), "Recent activity: inventory1 received stock, cashier1 made a sale and ho1 renamed a product."), preExpect: READY,
        steps: [['As ho1 filter by user inventory1.', 'Only inventory1\'s entries.'], ['Filter by action "sale".', 'Only sale entries.'], ['Filter by date range tomorrow.', 'No entries.']],
        auto: async (ctx) => {
          await ctx.as('inventory1').post('/api/inventory/add-stock', { productId: 'P001', quantity: 5 }); await ctx.checkout([['P005', 1]]); await ctx.as('ho1').put('/api/products/P005', { name: 'Cap v2' });
          const get = async (q) => (await ctx.as('ho1').get(`${REPORT.audit}?${q}`)).body;
          ctx.at(1); const a = await get('userId=U002'); check(a.every((x) => x.userId === 'U002'), `${a.length} entries from ${new Set(a.map((x) => x.userId)).size} users`);
          ctx.at(2, 'only inventory1'); const b = await get('action=CHECKOUT_SALE'); check(b.every((x) => x.action === 'CHECKOUT_SALE'), `${b.length} entries`);
          ctx.at(3, 'only sales'); const c = await get(`from=${isoDay(1)}`); check(c.length === 0, `${c.length} entries`);
        },
      },
      {
        id: 'TC-10.5-05', ac: 'AC3', type: 'Security', name: 'Store Manager sees only own-store entries',
        description: 'Audit scope for SM.', pre: need(FRESH_DATA, accounts('manager1'), "Completed sales at Downtown Store by cashier1: 2 Classic T-Shirts; 1 Running Sneakers with 2 Baseball Caps; 1 Rain Jacket — 199 in total.", "Completed sales at Uptown Store by cashier2 (an Uptown cashier created by admin1): 3 Denim Jeans; 2 Rain Jackets with 1 Classic T-Shirt — 310 in total. No promotion code used."), preExpect: READY,
        steps: [['As manager1 open the Audit Log.', 'Entries are shown, all for Downtown; no Uptown or administration entries.']],
        auto: async (ctx) => {
          await seedSales(ctx);
          ctx.at(1); const r = await ctx.as('manager1').get(REPORT.audit);
          check(r.status === 200 && r.body.length > 0 && r.body.every((a) => a.storeId === 'STORE_001'), show(r));
        },
      },
      {
        id: 'TC-10.5-06', ac: 'AC3', type: 'Functional', name: 'HO Manager sees entries of the whole chain',
        description: 'Audit scope for HO.', pre: need(FRESH_DATA, accounts('ho1'), "Completed sales at Downtown Store by cashier1: 2 Classic T-Shirts; 1 Running Sneakers with 2 Baseball Caps; 1 Rain Jacket — 199 in total.", "Completed sales at Uptown Store by cashier2 (an Uptown cashier created by admin1): 3 Denim Jeans; 2 Rain Jackets with 1 Classic T-Shirt — 310 in total. No promotion code used."), preExpect: READY,
        steps: [['As ho1 open the Audit Log.', 'Entries for both Downtown and Uptown are listed.']],
        auto: async (ctx) => {
          await seedSales(ctx);
          ctx.at(1); const st = new Set((await ctx.audit()).map((a) => a.storeId)); check(st.has('STORE_001') && st.has('STORE_002'), [...st].join(', '));
          ctx.saw('both stores');
        },
      },
      {
        id: 'TC-10.5-07', ac: 'AC3', type: 'Security', name: 'System Admin sees administration actions only',
        description: 'Separation of duties: no sales or stock entries for Admin.', pre: need(FRESH_DATA, accounts('admin1'), "Recent activity: cashier1 made a sale, inventory1 received stock and admin1 created a user."), preExpect: READY,
        steps: [['As admin1 open the Audit Log.', 'Only administration entries (user creation, sign-ins); no sale or stock entries.']],
        auto: async (ctx) => {
          await ctx.checkout([['P005', 1]]); await ctx.as('inventory1').post('/api/inventory/add-stock', { productId: 'P001', quantity: 1 }); await ctx.createUser('qcuser', 'CASHIER', 'STORE_001');
          ctx.at(1); const log = (await ctx.as('admin1').get(REPORT.audit)).body;
          const biz = [...new Set(log.filter((a) => /CHECKOUT|STOCK|TRANSFER|PRODUCT|PROMOTION/.test(a.action)).map((a) => a.action))];
          check(biz.length === 0 && log.some((a) => a.action === 'CREATE_USER'), `admin sees ${biz.join(', ')}`);
        },
      },
      {
        id: 'TC-10.5-08', ac: 'AC3', type: 'Security', name: 'Cashier and Inventory Staff cannot open the audit log',
        description: '§2.2 AUDIT_VIEW is ✗ for these roles.', pre: need(FRESH_DATA, accounts('cashier1', 'inventory1'), API_CLIENT), preExpect: READY,
        steps: [['As cashier1 and inventory1 send GET /api/audit-logs.', 'HTTP 403 for both; no Audit Log menu.']],
        auto: async (ctx) => {
          ctx.at(1); const st = [(await ctx.as('cashier1').get(REPORT.audit)).status, (await ctx.as('inventory1').get(REPORT.audit)).status]; check(st.every((s) => s === 403), st.join(', '));
        },
      },
      {
        id: 'TC-10.5-09', ac: 'AC4', type: 'Security', name: 'Audit entries cannot be edited or deleted',
        description: 'Append-only log.', pre: need(FRESH_DATA, accounts('ho1', 'admin1'), "At least one completed sale by cashier1, so the log has entries.", API_CLIENT), preExpect: READY,
        steps: [
          ['Look at an entry in the Audit Log as ho1 and admin1.', 'No edit or delete control.'],
          ['As ho1 and admin1 send PUT, PATCH, DELETE /api/audit-logs/<entry id> and DELETE /api/audit-logs.', 'Every call refused (403 / 404 / 405).'],
          ['Re-open the log.', 'The entry is unchanged and no entry is missing.'],
        ],
        auto: async (ctx) => {
          await ctx.checkout([['P005', 1]]); const before = await ctx.audit(); const t = before[0];
          ctx.at(1); ctx.saw('UI check');
          ctx.at(2); const st = [];
          for (const u of ['ho1', 'admin1']) { const c = ctx.as(u); st.push((await c.put(`${REPORT.audit}/${t.id}`, { action: 'X' })).status, (await c.patch(`${REPORT.audit}/${t.id}`, { action: 'X' })).status, (await c.del(`${REPORT.audit}/${t.id}`)).status, (await c.del(REPORT.audit)).status); }
          check(st.every((s) => [403, 404, 405].includes(s)), st.join(', '));
          ctx.at(3, 'all refused'); const after = await ctx.audit();
          check(JSON.stringify(after.find((a) => a.id === t.id)) === JSON.stringify(t) && after.length >= before.length, 'entry changed or removed');
        },
      },
      {
        id: 'TC-10.5-10', ac: 'AC4', type: 'Integrity', name: 'Audit history is kept in full and stays reachable',
        description: 'Entries survive object deletion and restarts, and older entries can still be paged to.', pre: need(FRESH_DATA, accounts('ho1'), "Recent activity: ho1 created and edited a product, cashier1 made a sale, and inventory1 then made 210 stock receipts."), preExpect: READY,
        steps: [
          ['Note the earliest entries; as ho1 delete the product; restart the application; re-open the log.', 'The noted entries are still there, unchanged.'],
          ['Page through the whole log.', 'All 213+ entries are reachable, including the oldest.'],
        ],
        auto: async (ctx) => {
          const p = (await ctx.as('ho1').post('/api/products', { name: 'QC Temp', price: 5 })).body; await ctx.as('ho1').put(`/api/products/${p.id}`, { price: 6 }); await ctx.checkout([['P005', 1]]);
          ctx.at(1); const snap = await ctx.audit();
          await ctx.as('ho1').del(`/api/products/${p.id}`); await ctx.restart(); ctx.tokens = {};
          const after = await ctx.audit(); const lost = snap.filter((e) => JSON.stringify(after.find((a) => a.id === e.id)) !== JSON.stringify(e)).length;
          check(lost === 0, `${lost} entries changed or missing`);
          ctx.at(2, `${snap.length} entries preserved`);
          for (let i = 0; i < 210; i++) await ctx.as('inventory1').post('/api/inventory/add-stock', { productId: 'P001', quantity: 1 });
          const p1 = (await ctx.as('ho1').get(REPORT.audit)).body; const p2 = (await ctx.as('ho1').get(`${REPORT.audit}?page=2`)).body;
          const ids = new Set([...p1, ...p2].map((a) => a.id));
          check(ids.size >= 213, `page 1 has ${p1.length} entries, page 2 adds ${ids.size - p1.length}; the oldest entries are unreachable`);
        },
      },
    ],
  },
];
