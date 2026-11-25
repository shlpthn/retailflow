'use strict';
// PBI RF-08 — HO-coordinated stock transfer · Sprint 4 (incl. stock integrity checks)
const { check, show, blocked } = require('../lib/harness');
const {
  need, FRESH_DATA, signedIn, accounts, stock, API_CLIENT, READY, RF08, nReq, nOrd, submitRequest, getRequest, issueOrder, ordersFor, issuedOrder, inTransitOrder, thirdStore, missingRoute, isoDay,
} = require('./common');

const S = { pbi: 'RF-08', sprint: 'S4', backlog: 'RF-08' };

const total = async (ctx, p) => (await ctx.stock('STORE_001', p)) + (await ctx.stock('STORE_002', p));

module.exports = [
  // ============================================================== US-08.1
  {
    ...S, id: 'US-08.1', name: 'Submit replenishment request',
    story: 'As a Store Manager of a store running short, I want to submit a request listing the products and quantities I need so that head office can find stock for me, even though I cannot see other stores\' stock.',
    acs: [
      { id: 'AC1', text: 'Destination = the Store Manager\'s active store; at least 1 line with an Active product and quantity > 0; optional needed-by date and note; there is no source store field.', rules: 'BR-13, FR-TRF-01' },
      { id: 'AC2', text: 'The form shows only the requesting store\'s own stock and minimum level; it can be pre-filled from the store\'s low-stock list (quantity = minimum level − on-hand).', rules: 'FR-TRF-02, D-06' },
      { id: 'AC3', text: 'When submitted, the request gets a unique number, status Submitted, and appears in the HO queue; no stock changes.', rules: 'FR-TRF-01, ST-01' },
      { id: 'AC4', text: 'Inventory Staff and Cashiers cannot create requests.', rules: '§2.2 TRANSFER_REQUEST_CREATE' },
      { id: 'AC5', text: 'While Submitted, the Store Manager can cancel the request with a reason → Cancelled.', rules: 'BR-21, FR-TRF-03' },
    ],
    cases: [
      {
        id: 'TC-08.1-01', ac: 'AC1', type: 'Functional', name: 'Submit a one-line request for the own store',
        description: 'A Store Manager requests one product for the active store.', pre: need(FRESH_DATA, signedIn('manager1', 'Inventory'), "Denim Jeans (barcode 0002): 8 units at Downtown Store and 25 at Uptown Store, minimum level 10 at both."), preExpect: READY,
        steps: [['As manager1 open Inventory → Request stock; choose Denim Jeans, quantity 10, needed-by date in 3 days, note "QC"; submit.', 'Request is created for destination Downtown with 1 line Denim Jeans 10.']],
        auto: async (ctx) => {
          ctx.at(1);
          const r = await submitRequest(ctx, [['P002', 10]], 'manager1', { neededBy: isoDay(3), note: 'QC' });
          check(r.status === 201 && r.body.storeId === 'STORE_001' && r.body.quantity === 10, show(r));
          ctx.saw(`${r.body.id}, Downtown, Denim Jeans 10`);
        },
      },
      {
        id: 'TC-08.1-02', retired: 'Needs multi-line replenishment requests: requests hold one product; lines would change the request, order and UI model (BUG-013).', ac: 'AC1', type: 'Functional', name: 'Submit a request with several product lines',
        description: 'One request can carry several products.', pre: need(FRESH_DATA, signedIn('manager1', 'Inventory'), "Denim Jeans (barcode 0002): 8 units at Downtown Store and 25 at Uptown Store, minimum level 10 at both.", stock('Downtown', ["Rain Jacket", 3, 5])), preExpect: READY,
        steps: [['As manager1 create a request with two lines: Denim Jeans 10 and Rain Jacket 5; submit.', 'One request with 2 lines (Denim Jeans 10, Rain Jacket 5).']],
        auto: async (ctx) => {
          ctx.at(1);
          const r = await submitRequest(ctx, [['P002', 10], ['P004', 5]]);
          const lines = (r.body && r.body.lines) || [];
          check(r.status === 201 && lines.length === 2, `request ${r.body && r.body.id} stored without lines; only ${r.body && r.body.productId} x${r.body && r.body.quantity} kept (Rain Jacket line dropped)`);
        },
      },
      {
        id: 'TC-08.1-03', ac: 'AC1', type: 'Negative', name: 'Quantity must be a positive whole number',
        description: 'Zero, negative, fractional and non-numeric quantities are refused.', pre: need(FRESH_DATA, signedIn('manager1', 'Inventory'), accounts('ho1'), API_CLIENT), preExpect: READY,
        steps: [
          ['In the request form enter quantity 0, then −1, and try to submit each.', 'Each is refused with a validation message.'],
          ['As manager1 send POST /api/stock-requests with quantity 1.5, then with quantity "1e309".', 'HTTP 400 for both.'],
          ['As ho1 open the request queue.', 'No request was created.'],
        ],
        auto: async (ctx) => {
          ctx.at(1);
          const a = [(await submitRequest(ctx, [['P002', 0]])).status, (await submitRequest(ctx, [['P002', -1]])).status];
          check(a.every((s) => s === 400), a.join(', '));
          ctx.at(2, '400, 400');
          const b = [(await submitRequest(ctx, [['P002', 1.5]])).status, (await submitRequest(ctx, [['P002', '1e309']])).status];
          check(b.every((s) => s === 400), `1.5 → ${b[0]}, "1e309" → ${b[1]} (request created)`);
          ctx.at(3, '400, 400');
          const n = (await ctx.as('ho1').get(RF08.requests)).body.length;
          check(n === 0, `${n} requests created`);
        },
      },
      {
        id: 'TC-08.1-04', ac: 'AC1', type: 'Negative', name: 'Unknown or inactive products cannot be requested',
        description: 'Only Active catalogue products are allowed.', pre: need(FRESH_DATA, accounts('manager1', 'ho1'), "Denim Jeans set to Inactive by ho1 on the Products screen.", API_CLIENT), preExpect: READY,
        steps: [
          ['As manager1 send POST /api/stock-requests {"productId":"PXXX","quantity":5}.', 'HTTP 404 (or 400) — unknown product.'],
          ['As manager1 request Denim Jeans (Inactive) x10.', 'Refused (4xx); no request created.'],
        ],
        auto: async (ctx) => {
          await ctx.as('ho1').put('/api/products/P002', { status: 'INACTIVE' });
          ctx.at(1);
          const a = await submitRequest(ctx, [['PXXX', 5]]); check([400, 404].includes(a.status), show(a));
          ctx.at(2, show(a));
          const b = await submitRequest(ctx, [['P002', 10]]); check(b.status >= 400 && b.status < 500, `${show(b)} — inactive product accepted`);
        },
      },
      {
        id: 'TC-08.1-05', ac: 'AC1', type: 'Security', name: 'Destination is fixed to the manager\'s store and no source store can be given',
        description: 'Body fields cannot redirect the request or name a source store.', pre: need(FRESH_DATA, accounts('manager1'), API_CLIENT), preExpect: READY,
        steps: [['As manager1 send POST /api/stock-requests {"productId":"P002","quantity":10,"storeId":"STORE_002","sourceStoreId":"STORE_002"}.', 'Either 400/403, or the request is stored with destination Downtown and without any source store.']],
        auto: async (ctx) => {
          ctx.at(1);
          const r = await submitRequest(ctx, [['P002', 10]], 'manager1', { storeId: 'STORE_002', sourceStoreId: 'STORE_002' });
          const ok = [400, 403].includes(r.status) || (r.status === 201 && r.body.storeId === 'STORE_001' && !JSON.stringify(r.body).includes('"sourceStoreId"'));
          check(ok, show(r));
          ctx.saw(`${r.status}, destination ${r.body && r.body.storeId}, no source store`);
        },
      },
      {
        id: 'TC-08.1-06', ac: 'AC2', type: 'UI', name: 'Request form shows only own stock and can be pre-filled from the low-stock list',
        description: 'Manual UI check of the request form.', pre: need(FRESH_DATA, signedIn('manager1', 'Inventory'), stock('Downtown', ["Denim Jeans", 8, 10], ["Rain Jacket", 3, 5])), preExpect: READY,
        steps: [
          ['As manager1 open Inventory → Request stock.', 'Each product shows Downtown on-hand and minimum level only; no other store\'s stock; no source-store field.'],
          ['Use "Pre-fill from low stock".', 'Denim Jeans 2 (10 − 8) and Rain Jacket 2 (5 − 3) are filled in.'],
        ],
      },
      {
        id: 'TC-08.1-07', ac: 'AC3', type: 'Functional', name: 'Submitted request gets a number, status Submitted and reaches the HO queue without moving stock',
        description: 'State and side effects right after submission.', pre: need(FRESH_DATA, accounts('manager1', 'ho1'), "Denim Jeans (barcode 0002): 8 units at Downtown Store and 25 at Uptown Store, minimum level 10 at both.", stock('Downtown', ["Rain Jacket", 3, 5])), preExpect: READY,
        steps: [
          ['As manager1 submit Denim Jeans x10, then Rain Jacket x5.', 'Two requests with different numbers, both Submitted.'],
          ['As ho1 open Stock Requests.', 'Both requests are listed in the queue.'],
          ['As ho1 open Inventory for Downtown and Uptown.', 'Denim Jeans still 8 (Downtown) and 25 (Uptown).'],
        ],
        auto: async (ctx) => {
          ctx.at(1);
          const a = (await submitRequest(ctx, [['P002', 10]])).body; const b = (await submitRequest(ctx, [['P004', 5]])).body;
          check(a.id !== b.id && nReq(a.status) === 'SUBMITTED' && nReq(b.status) === 'SUBMITTED', `${a.id} ${a.status}, ${b.id} ${b.status}`);
          ctx.at(2, `${a.id}, ${b.id} Submitted`);
          const q = (await ctx.as('ho1').get(RF08.requests)).body.map((x) => x.id);
          check(q.includes(a.id) && q.includes(b.id), JSON.stringify(q));
          ctx.at(3, 'both in queue');
          const s1 = await ctx.stock('STORE_001', 'P002'); const s2 = await ctx.stock('STORE_002', 'P002');
          check(s1 === 8 && s2 === 25, `${s1}/${s2}`);
        },
      },
      {
        id: 'TC-08.1-08', ac: 'AC4', type: 'Security', name: 'Only the Store Manager can create a request',
        description: 'Inventory Staff, Cashier, HO Manager and Admin are refused.', pre: need(FRESH_DATA, accounts('inventory1', 'cashier1', 'ho1', 'admin1'), API_CLIENT), preExpect: READY,
        steps: [['Send POST /api/stock-requests {"productId":"P002","quantity":10} as inventory1, cashier1, ho1 and admin1.', 'HTTP 403 for every user; no request created.']],
        auto: async (ctx) => {
          ctx.at(1);
          const users = ['inventory1', 'cashier1', 'ho1', 'admin1']; const st = [];
          for (const u of users) st.push((await submitRequest(ctx, [['P002', 10]], u)).status);
          check(st.every((s) => s === 403), users.map((u, i) => `${u} ${st[i]}`).join(', '));
        },
      },
      {
        id: 'TC-08.1-09', ac: 'AC5', type: 'Functional', name: 'Store Manager cancels a Submitted request with a reason',
        description: 'Cancellation while still Submitted.', pre: need(FRESH_DATA, accounts('manager1', 'ho1'), "A replenishment request from manager1 for 10 Denim Jeans for Downtown Store (Inventory → Request stock), still Submitted."), preExpect: READY,
        steps: [
          ['As manager1 open the request and click Cancel; enter reason "Found stock"; confirm.', 'Request status becomes Cancelled with the reason stored.'],
          ['As ho1 open Stock Requests.', 'The request is no longer pending in the queue.'],
        ],
        auto: async (ctx) => {
          const req = (await submitRequest(ctx, [['P002', 10]])).body;
          ctx.at(1);
          const r = await ctx.as('manager1').post(RF08.cancelRequest(req.id), { reason: 'Found stock' });
          check(r.status === 200, `${show(r)} — no cancel action`);
          const after = await getRequest(ctx, req.id); check(after.status === 'CANCELLED', `status ${after.status}`);
          ctx.at(2, 'Cancelled');
        },
      },
      {
        id: 'TC-08.1-10', ac: 'AC5', type: 'Negative', name: 'A request cannot be cancelled once In Progress, nor by another store',
        description: 'Cancellation is limited to Submitted requests of the own store.', pre: need(FRESH_DATA, accounts('manager1', 'manager2'), "A replenishment request from manager1 for 10 Denim Jeans for Downtown Store, which ho1 has issued to Uptown Store as a transfer order (status Issued).", "A second request from manager1 for 2 Rain Jackets, still Submitted."), preExpect: READY,
        steps: [
          ['As manager1 try to cancel the Denim Jeans request (In Progress).', 'Refused (409); status stays In Progress.'],
          ['As manager2 (Uptown) try to cancel the Rain Jacket request of Downtown.', 'Refused (403).'],
        ],
        auto: async (ctx) => {
          const { req } = await issuedOrder(ctx);
          const other = (await submitRequest(ctx, [['P004', 2]])).body;
          ctx.at(1);
          const a = await ctx.as('manager1').post(RF08.cancelRequest(req.id), { reason: 'x' });
          if (missingRoute(a)) blocked('Cancel-request action does not exist (see TC-08.1-09)');
          check(a.status === 409, show(a));
          ctx.at(2, '409');
          const b = await ctx.as('manager2').post(RF08.cancelRequest(other.id), { reason: 'x' });
          check(b.status === 403, show(b));
        },
      },
    ],
  },

  // ============================================================== US-08.2
  {
    ...S, id: 'US-08.2', name: 'Review request and check chain-wide stock',
    story: 'As an HO Manager, I want to see pending replenishment requests together with every store\'s stock of the requested products so that I can decide which store should supply.',
    acs: [
      { id: 'AC1', text: 'The queue lists Submitted and In Progress requests with requesting store, lines, needed-by date and age; sorted by needed-by date, then oldest first.', rules: 'FR-TRF-04' },
      { id: 'AC2', text: 'For each line, a table shows every other Active store with on-hand, minimum level and transferable quantity (= on-hand − minimum level), sorted by transferable quantity descending.', rules: 'BR-14, FR-TRF-05' },
      { id: 'AC3', text: 'Given no store can supply, when the HO Manager rejects the request with a reason, it becomes Rejected and the destination Store Manager is notified.', rules: 'BR-21, FR-TRF-07, FR-TRF-14' },
    ],
    cases: [
      {
        id: 'TC-08.2-01', ac: 'AC1', type: 'Functional', name: 'HO queue shows open requests ordered by needed-by date, then age',
        description: 'Content and ordering of the HO queue.', pre: need(FRESH_DATA, accounts('manager1', 'manager2', 'ho1'), "Requests submitted in this order: R1 by manager1, needed in 5 days; R2 by manager1, needed in 1 day; R3 by manager1, needed in 5 days; R4 by manager2, which ho1 has rejected."), preExpect: READY,
        steps: [['As ho1 open Stock Requests (pending queue).', 'Order is R2, R1, R3; each row shows store, lines, needed-by date and age; the rejected R4 is not in the pending queue.']],
        auto: async (ctx) => {
          const r1 = (await submitRequest(ctx, [['P002', 1]], 'manager1', { neededBy: isoDay(5) })).body;
          const r2 = (await submitRequest(ctx, [['P002', 2]], 'manager1', { neededBy: isoDay(1) })).body;
          const r3 = (await submitRequest(ctx, [['P002', 3]], 'manager1', { neededBy: isoDay(5) })).body;
          const r4 = (await submitRequest(ctx, [['P003', 1]], 'manager2')).body;
          await ctx.as('ho1').post(RF08.reject(r4.id), { reason: 'QC' });
          ctx.at(1);
          const q = (await ctx.as('ho1').get(`${RF08.requests}?queue=true`)).body.map((x) => x.id).filter((id) => [r1.id, r2.id, r3.id, r4.id].includes(id));
          const name = { [r1.id]: 'R1', [r2.id]: 'R2', [r3.id]: 'R3', [r4.id]: 'R4' };
          check(JSON.stringify(q) === JSON.stringify([r2.id, r1.id, r3.id]), `queue order ${q.map((id) => name[id]).join(', ')}`);
        },
      },
      {
        id: 'TC-08.2-02', ac: 'AC2', type: 'Functional', name: 'HO sees on-hand, minimum and transferable quantity of every other store',
        description: 'Chain-wide availability table used to choose source stores.', pre: need(FRESH_DATA, signedIn('ho1', 'Stock Requests'), "Denim Jeans (barcode 0002): 8 units at Downtown Store and 25 at Uptown Store, minimum level 10 at both.", "A third store \"QC Store 3\" created by admin1, with an Inventory Staff account inventory3 who has received 20 Denim Jeans there.", "A replenishment request from manager1 for 10 Denim Jeans for Downtown Store (Inventory → Request stock), still Submitted."), preExpect: READY,
        steps: [['As ho1 open the Denim Jeans request and its availability table.', 'Rows: Uptown 25 / 10 / 15, then QC Store 3 20 / 10 / 10 (sorted by transferable, descending); Downtown (destination) is not listed.']],
        auto: async (ctx) => {
          await thirdStore(ctx, 20);
          const req = (await submitRequest(ctx, [['P002', 10]])).body;
          ctx.at(1);
          const r = await ctx.as('ho1').get(RF08.availability(req.id));
          check(r.status === 200 && JSON.stringify(r.body).includes('STORE_002'), `${show(r)} — no availability view`);
        },
      },
      {
        id: 'TC-08.2-03', ac: 'AC3', type: 'Functional', name: 'HO rejects a Submitted request with a reason',
        description: 'Rejection stores the reason, is audited and does not move stock.', pre: need(FRESH_DATA, accounts('ho1', 'manager1'), "A replenishment request from manager1 for 10 Denim Jeans for Downtown Store (Inventory → Request stock), still Submitted.", stock('Downtown', ["Denim Jeans", 8])), preExpect: READY,
        steps: [
          ['As ho1 click Reject on the request and enter "No store can supply".', 'Request status Rejected; the reason is shown.'],
          ['As ho1 open the Audit Log.', 'An entry for the rejection exists.'],
          ['As manager1 open the request.', 'Status Rejected with the reason; Denim Jeans stock unchanged (8).'],
        ],
        auto: async (ctx) => {
          const req = (await submitRequest(ctx, [['P002', 10]])).body;
          ctx.at(1);
          const r = await ctx.as('ho1').post(RF08.reject(req.id), { reason: 'No store can supply' });
          const after = await getRequest(ctx, req.id);
          check(r.status === 200 && after.status === 'REJECTED' && (after.rejectionReason || after.rejectedReason) === 'No store can supply', show(r));
          ctx.at(2, 'Rejected with reason');
          const a = (await ctx.audit()).find((x) => x.resource === req.id && /REJECT/.test(x.action)); check(!!a, 'no audit entry');
          ctx.at(3, a.action);
          const mine = await getRequest(ctx, req.id, 'manager1'); const s = await ctx.stock('STORE_001', 'P002');
          check(mine.status === 'REJECTED' && s === 8, `${mine.status}, stock ${s}`);
        },
      },
      {
        id: 'TC-08.2-04', ac: 'AC3', type: 'Negative', name: 'Rejection needs a reason and is only possible while Submitted',
        description: 'Missing reason and wrong state are refused.', pre: need(FRESH_DATA, accounts('ho1'), "A replenishment request from manager1 for 10 Denim Jeans for Downtown Store, which ho1 has issued to Uptown Store as a transfer order (status Issued).", "A second request from manager1 for 2 Rain Jackets, still Submitted."), preExpect: READY,
        steps: [
          ['As ho1 reject the Rain Jacket request leaving the reason empty.', 'Refused (400); request stays Submitted.'],
          ['As ho1 reject the Denim Jeans request (In Progress).', 'Refused (409); request stays In Progress.'],
        ],
        auto: async (ctx) => {
          const { req } = await issuedOrder(ctx); const other = (await submitRequest(ctx, [['P004', 2]])).body;
          ctx.at(1);
          const a = await ctx.as('ho1').post(RF08.reject(other.id), {});
          const s = (await getRequest(ctx, other.id)).status;
          check(a.status === 400 && nReq(s) === 'SUBMITTED', `${show(a)}; status ${s}`);
          ctx.at(2, '400');
          const b = await ctx.as('ho1').post(RF08.reject(req.id), { reason: 'x' });
          check(b.status === 409, show(b));
        },
      },
    ],
  },

  // ============================================================== US-08.3
  {
    ...S, id: 'US-08.3', name: 'Allocate and issue transfer orders',
    story: 'As an HO Manager, I want to order one or more source stores to ship the requested goods so that the short store is replenished without back-and-forth negotiation.',
    acs: [
      { id: 'AC1', text: 'The HO Manager enters quantities per line per source store; on confirm, the system creates one transfer order per source store with status Issued, all in one transaction; the request becomes In Progress.', rules: 'BR-14, FR-TRF-06' },
      { id: 'AC2', text: 'Given a quantity above the source store\'s on-hand, confirming is blocked; given it would take the source below its minimum level, a warning is shown and the HO Manager may confirm.', rules: 'BR-14, OI-11' },
      { id: 'AC3', text: 'Total allocated per line cannot exceed requested quantity minus quantity already on open or received orders; partial allocation is allowed and the remainder stays open.', rules: 'BR-14, OI-04' },
      { id: 'AC4', text: 'The source store\'s Store Manager and Inventory Staff see the order under "Orders to dispatch"; the destination store sees it under "Incoming", including the source store name.', rules: 'FR-TRF-13, BR-02' },
      { id: 'AC5', text: 'The HO Manager can cancel an Issued order with a reason → Cancelled; its quantity returns to the request.', rules: 'BR-21, FR-TRF-07' },
    ],
    cases: [
      {
        id: 'TC-08.3-01', ac: 'AC1', type: 'Functional', name: 'Issue one transfer order from one source store',
        description: 'Full allocation of a line to a single source.', pre: need(FRESH_DATA, accounts('ho1'), "A replenishment request from manager1 for 10 Denim Jeans for Downtown Store (Inventory → Request stock), still Submitted.", "Denim Jeans (barcode 0002): 8 units at Downtown Store and 25 at Uptown Store, minimum level 10 at both."), preExpect: READY,
        steps: [
          ['As ho1 open the request, allocate Denim Jeans 10 from Uptown and confirm.', 'One order Uptown → Downtown, Denim Jeans 10, status Issued.'],
          ['Re-open the request.', 'Request status In Progress.'],
          ['Check Uptown stock and the Audit Log.', 'Uptown Denim Jeans still 25 (stock moves only at dispatch); issuing is audited.'],
        ],
        auto: async (ctx) => {
          const req = (await submitRequest(ctx, [['P002', 10]])).body;
          ctx.at(1);
          const r = await issueOrder(ctx, req); const os = await ordersFor(ctx, req.id); const o = os[0];
          check(r.status === 200 && os.length === 1 && nOrd(o.status) === 'ISSUED' && o.sourceStoreId === 'STORE_002' && o.destinationStoreId === 'STORE_001' && o.quantity === 10, show(r));
          ctx.at(2, `order ${o.id} Issued`);
          const s = (await getRequest(ctx, req.id)).status; check(nReq(s) === 'IN_PROGRESS', s);
          ctx.at(3, 'In Progress');
          const q = await ctx.stock('STORE_002', 'P002'); const a = (await ctx.audit()).find((x) => x.resource === req.id && /APPROVE|ISSUE/.test(x.action));
          check(q === 25 && !!a, `Uptown ${q}, audit ${!!a}`);
        },
      },
      {
        id: 'TC-08.3-02', retired: 'Needs one request to produce several transfer orders (split allocation) — data-model change (BUG-014).', ac: 'AC1', type: 'Functional', name: 'Split one line across two source stores',
        description: 'One order per source store, created together.', pre: need(FRESH_DATA, accounts('ho1'), "A third store \"QC Store 3\" created by admin1, with an Inventory Staff account inventory3 who has received 20 Denim Jeans there.", "A request from manager1 for 30 Denim Jeans for Downtown Store, still Submitted.", "Denim Jeans (barcode 0002): 8 units at Downtown Store and 25 at Uptown Store, minimum level 10 at both."), preExpect: READY,
        steps: [['As ho1 allocate 20 from Uptown and 10 from QC Store 3 and confirm.', 'Two Issued orders (20 from Uptown, 10 from QC Store 3); request In Progress.']],
        auto: async (ctx) => {
          const s3 = await thirdStore(ctx, 20);
          const req = (await submitRequest(ctx, [['P002', 30]])).body;
          ctx.at(1);
          const r = await ctx.as('ho1').post(RF08.issue(req.id), { fulfillmentType: 'TRANSFER', allocations: [
            { sourceStoreId: 'STORE_002', lines: [{ productId: 'P002', quantity: 20 }] }, { sourceStoreId: s3, lines: [{ productId: 'P002', quantity: 10 }] }] });
          const os = await ordersFor(ctx, req.id);
          check(r.status === 200 && os.length === 2, `${show(r)}; ${os.length} orders`);
        },
      },
      {
        id: 'TC-08.3-03', ac: 'AC2', type: 'Negative', name: 'Allocating more than the source on-hand is blocked and the request stays open',
        description: 'Over-allocation and invalid source stores leave the request allocatable.', pre: need(FRESH_DATA, accounts('ho1'), "A request from manager1 for 30 Denim Jeans for Downtown Store, still Submitted.", stock('Uptown', ["Denim Jeans", 25])), preExpect: READY,
        steps: [
          ['As ho1 allocate 30 from Uptown and confirm.', 'Blocked: Uptown has only 25; no order created.'],
          ['Try Downtown (the destination itself) as source, then a non-existent store.', 'Both refused (400 / 404).'],
          ['Re-open the request.', 'Still Submitted and can be allocated again.'],
        ],
        auto: async (ctx) => {
          const req = (await submitRequest(ctx, [['P002', 30]])).body;
          ctx.at(1);
          const a = await issueOrder(ctx, req); check(a.status === 409 && (await ordersFor(ctx, req.id)).length === 0, show(a));
          ctx.at(2, show(a));
          const b = await issueOrder(ctx, req, 'STORE_001'); const c = await issueOrder(ctx, req, 'STORE_999');
          check([400, 404].includes(b.status) && [400, 404].includes(c.status), `same store → ${show(b)}; unknown store → ${show(c)}`);
          ctx.at(3, `${b.status}, ${c.status}`);
          const s = (await getRequest(ctx, req.id)).status;
          check(nReq(s) === 'SUBMITTED', `request status ${s} — it can no longer be allocated`);
        },
      },
      {
        id: 'TC-08.3-04', ac: 'AC2', type: 'Boundary', name: 'Allocation that takes the source below its minimum level shows a warning but is allowed',
        description: 'Uptown Denim Jeans 25, minimum 10: allocating 20 leaves 5.', pre: need(FRESH_DATA, accounts('ho1'), "A request from manager1 for 20 Denim Jeans for Downtown Store, still Submitted.", stock('Uptown', ["Denim Jeans", 25, 10])), preExpect: READY,
        steps: [['As ho1 allocate 20 from Uptown and confirm.', 'A below-minimum warning is shown; after confirming, the order is Issued.']],
        auto: async (ctx) => {
          const req = (await submitRequest(ctx, [['P002', 20]])).body;
          ctx.at(1);
          const r = await issueOrder(ctx, req);
          check([200, 201].includes(r.status) && /warn/i.test(JSON.stringify(r.body)), `${show(r)} — issued without a warning`);
        },
      },
      {
        id: 'TC-08.3-05', retired: 'Needs partial allocation (several orders / remainders per request) — data-model change (BUG-014).', ac: 'AC3', type: 'Functional', name: 'Partial allocation leaves the remainder open',
        description: 'Allocating 6 of 10.', pre: need(FRESH_DATA, accounts('ho1'), "A replenishment request from manager1 for 10 Denim Jeans for Downtown Store (Inventory → Request stock), still Submitted.", "Denim Jeans (barcode 0002): 8 units at Downtown Store and 25 at Uptown Store, minimum level 10 at both."), preExpect: READY,
        steps: [['As ho1 allocate only 6 from Uptown and confirm.', 'Order for 6 is Issued; the request shows allocated 6 of 10 and stays In Progress with 4 open.']],
        auto: async (ctx) => {
          const req = (await submitRequest(ctx, [['P002', 10]])).body;
          ctx.at(1);
          const r = await issueOrder(ctx, req, 'STORE_002', 6); const [o] = await ordersFor(ctx, req.id);
          check(r.status === 200 && o && o.quantity === 6, `${show(r)}; order quantity ${o && o.quantity} (allocation quantity ignored)`);
        },
      },
      {
        id: 'TC-08.3-06', retired: 'Needs per-allocation quantities (several orders per request) — data-model change (BUG-014).', ac: 'AC3', type: 'Negative', name: 'Total allocated cannot exceed the requested quantity',
        description: 'Allocating 12 of 10.', pre: need(FRESH_DATA, accounts('ho1'), "A replenishment request from manager1 for 10 Denim Jeans for Downtown Store (Inventory → Request stock), still Submitted.", "Denim Jeans (barcode 0002): 8 units at Downtown Store and 25 at Uptown Store, minimum level 10 at both."), preExpect: READY,
        steps: [['As ho1 allocate 12 from Uptown and confirm.', 'Refused (400); no order created.']],
        auto: async (ctx) => {
          const req = (await submitRequest(ctx, [['P002', 10]])).body;
          ctx.at(1);
          const r = await issueOrder(ctx, req, 'STORE_002', 12); const [o] = await ordersFor(ctx, req.id);
          check(r.status === 400 && !o, `${show(r)}; order quantity ${o && o.quantity}`);
        },
      },
      {
        id: 'TC-08.3-07', ac: 'AC4', type: 'Security', name: 'The order is visible to the source and destination stores only',
        description: 'Orders to dispatch (source), Incoming with source name (destination), invisible to other stores.', pre: need(FRESH_DATA, accounts('inventory1', 'inventory2'), "A replenishment request from manager1 for 10 Denim Jeans for Downtown Store, which ho1 has issued to Uptown Store as a transfer order (status Issued).", "A third store \"QC Store 3\" created by admin1, with an Inventory Staff account inventory3."), preExpect: READY,
        steps: [
          ['As inventory2 (Uptown) open Inventory → transfers.', 'The order is listed under Orders to dispatch.'],
          ['As inventory1 (Downtown) open Inventory → transfers.', 'The order is listed under Incoming with source "Uptown Store".'],
          ['As inventory3 (QC Store 3) open Inventory → transfers.', 'The order is not listed.'],
        ],
        auto: async (ctx) => {
          await thirdStore(ctx, 0); const { order } = await issuedOrder(ctx);
          const see = async (u) => ((await ctx.as(u).get(RF08.orders)).body || []).find((o) => o.id === order.id);
          ctx.at(1); check(!!(await see('inventory2')), 'not visible to source');
          ctx.at(2, 'listed'); const d = await see('inventory1'); check(d && d.sourceStoreName, 'not visible to destination');
          ctx.at(3, `listed, source ${d.sourceStoreName}`); check(!(await see('inventory3')), 'visible to an unrelated store');
        },
      },
      {
        id: 'TC-08.3-08', ac: 'AC5', type: 'Functional', name: 'HO cancels an Issued order; its quantity returns to the request',
        description: 'Cancellation before dispatch.', pre: need(FRESH_DATA, accounts('ho1'), "A replenishment request from manager1 for 10 Denim Jeans for Downtown Store, which ho1 has issued to Uptown Store as a transfer order (status Issued)."), preExpect: READY,
        steps: [
          ['As ho1 open the order and Cancel it with reason "Wrong source".', 'Order status Cancelled with the reason.'],
          ['Re-open the request.', 'Allocated quantity back to 0; the request can be allocated again; stock unchanged.'],
        ],
        auto: async (ctx) => {
          const { order } = await issuedOrder(ctx);
          ctx.at(1);
          const r = await ctx.as('ho1').post(RF08.cancelOrder(order.id), { reason: 'Wrong source' });
          check(r.status === 200 && nOrd(r.body.status) === 'CANCELLED', `${show(r)} — no cancel action`);
          ctx.at(2, 'Cancelled');
        },
      },
      {
        id: 'TC-08.3-09', ac: 'AC5', type: 'Negative', name: 'An order cannot be cancelled once dispatched',
        description: 'In Transit orders are past the cancellation point (ST-02).', pre: need(FRESH_DATA, accounts('ho1'), "A transfer order of 10 Denim Jeans from Uptown Store to Downtown Store (requested by manager1, issued by ho1) that inventory2 has already dispatched (status In Transit)."), preExpect: READY,
        steps: [['As ho1 try to cancel the In Transit order.', 'Refused (409); order stays In Transit; stock unchanged.']],
        auto: async (ctx) => {
          const { order } = await inTransitOrder(ctx);
          ctx.at(1);
          const r = await ctx.as('ho1').post(RF08.cancelOrder(order.id), { reason: 'x' });
          if (missingRoute(r)) blocked('Cancel-order action does not exist (see TC-08.3-08)');
          check(r.status === 409, show(r));
        },
      },
      {
        id: 'TC-08.3-10', ac: 'AC1', type: 'Security', name: 'Only the HO Manager can allocate or reject',
        description: 'Store Managers and Inventory Staff cannot issue orders (§2.2 TRANSFER_ORDER_ISSUE).', pre: need(FRESH_DATA, accounts('manager1', 'manager2', 'inventory2'), "A replenishment request from manager1 for 10 Denim Jeans for Downtown Store (Inventory → Request stock), still Submitted.", API_CLIENT), preExpect: READY,
        steps: [['As manager1, manager2 and inventory2 send POST /api/stock-requests/<id>/approve {"fulfillmentType":"TRANSFER","sourceStoreId":"STORE_002"}; as manager2 send …/reject.', 'HTTP 403 for every call; request stays Submitted.']],
        auto: async (ctx) => {
          const req = (await submitRequest(ctx, [['P002', 10]])).body;
          ctx.at(1);
          const st = [];
          for (const u of ['manager1', 'manager2', 'inventory2']) st.push((await ctx.as(u).post(RF08.issue(req.id), { fulfillmentType: 'TRANSFER', sourceStoreId: 'STORE_002' })).status);
          st.push((await ctx.as('manager2').post(RF08.reject(req.id), { reason: 'x' })).status);
          const s = (await getRequest(ctx, req.id)).status;
          check(st.every((x) => x === 403) && nReq(s) === 'SUBMITTED', `${st.join(', ')}; status ${s}`);
        },
      },
    ],
  },

  // ============================================================== US-08.4
  {
    ...S, id: 'US-08.4', name: 'Dispatch transfer order',
    story: 'As Inventory Staff / Store Manager of the source store, I want to confirm dispatch so that my store\'s stock drops exactly when the goods leave.',
    acs: [
      { id: 'AC1', text: 'Given an Issued order and enough source stock, when dispatching, source stock decreases, a TRANSFER_OUT movement is created and the order becomes In Transit.', rules: 'BR-20, FR-TRF-08' },
      { id: 'AC2', text: 'Given source stock is now lower than the order quantity, dispatching is blocked and the order stays Issued.', rules: 'BR-12, BR-20' },
      { id: 'AC3', text: 'There is no approve / reject action on the order: the source can only dispatch it or report it unfulfillable.', rules: 'BR-15, OI-08' },
      { id: 'AC4', text: 'Dispatching the same order twice deducts stock only once.', rules: 'NFR-07' },
      { id: 'INT', text: 'Stock integrity: stock is never negative and only changes through movements; concurrent or failed operations never corrupt it; stock cannot leave a store outside a transfer order.', rules: 'BR-12, BR-20, D-06, NFR-05, FR-INV-06' },
    ],
    cases: [
      {
        id: 'TC-08.4-01', ac: 'AC1', type: 'Functional', name: 'Source Inventory Staff dispatches an Issued order',
        description: 'Stock leaves the source at dispatch.', pre: need(FRESH_DATA, accounts('inventory2'), "A replenishment request from manager1 for 10 Denim Jeans for Downtown Store, which ho1 has issued to Uptown Store as a transfer order (status Issued).", "Denim Jeans (barcode 0002): 8 units at Downtown Store and 25 at Uptown Store, minimum level 10 at both."), preExpect: READY,
        steps: [
          ['As inventory2 open Orders to dispatch and click Dispatch on the order.', 'Order status In Transit.'],
          ['Check stock of Uptown and Downtown.', 'Uptown Denim Jeans 25 → 15; Downtown unchanged (8).'],
          ['Open the Uptown stock card.', 'One TRANSFER_OUT movement of 10 referencing the order.'],
        ],
        auto: async (ctx) => {
          const { order } = await issuedOrder(ctx);
          ctx.at(1);
          const r = await ctx.as('inventory2').post(RF08.dispatch(order.id)); check(r.status === 200 && r.body.status === 'IN_TRANSIT', show(r));
          ctx.at(2, 'In Transit');
          const s1 = await ctx.stock('STORE_001', 'P002'); const s2 = await ctx.stock('STORE_002', 'P002'); check(s2 === 15 && s1 === 8, `${s2}/${s1}`);
          ctx.at(3, 'Uptown 15, Downtown 8');
          const out = (await ctx.movements('STORE_002')).filter((m) => m.type === 'TRANSFER_OUT'); check(out.length === 1 && out[0].quantity === 10, JSON.stringify(out));
        },
      },
      {
        id: 'TC-08.4-02', ac: 'AC1', type: 'Functional', name: 'Source Store Manager can dispatch',
        description: '§2.2 gives TRANSFER_DISPATCH to the Store Manager as well.', pre: need(FRESH_DATA, accounts('manager2'), "A replenishment request from manager1 for 10 Denim Jeans for Downtown Store, which ho1 has issued to Uptown Store as a transfer order (status Issued).", "Denim Jeans (barcode 0002): 8 units at Downtown Store and 25 at Uptown Store, minimum level 10 at both."), preExpect: READY,
        steps: [['As manager2 click Dispatch on the order.', 'Order In Transit; Uptown Denim Jeans 15.']],
        auto: async (ctx) => {
          const { order } = await issuedOrder(ctx);
          ctx.at(1);
          const r = await ctx.as('manager2').post(RF08.dispatch(order.id)); check(r.status === 200, show(r));
        },
      },
      {
        id: 'TC-08.4-03', ac: 'AC1', type: 'Security', name: 'Only the source store can dispatch',
        description: 'Destination staff and HO cannot dispatch.', pre: need(FRESH_DATA, accounts('inventory1', 'ho1'), "A replenishment request from manager1 for 10 Denim Jeans for Downtown Store, which ho1 has issued to Uptown Store as a transfer order (status Issued).", API_CLIENT), preExpect: READY,
        steps: [['As inventory1 (destination) and as ho1 send POST /api/transfers/<order id>/dispatch.', 'HTTP 403 for both; order stays Issued; Uptown stock 25.']],
        auto: async (ctx) => {
          const { order } = await issuedOrder(ctx);
          ctx.at(1);
          const a = await ctx.as('inventory1').post(RF08.dispatch(order.id)); const b = await ctx.as('ho1').post(RF08.dispatch(order.id));
          const s = await ctx.stock('STORE_002', 'P002');
          check(a.status === 403 && b.status === 403 && s === 25, `${a.status}, ${b.status}; Uptown ${s}`);
        },
      },
      {
        id: 'TC-08.4-04', ac: 'AC2', type: 'Negative', name: 'Dispatch is blocked when the source no longer has enough stock',
        description: 'Stock sold at the source after the order was issued.', pre: need(FRESH_DATA, accounts('inventory2'), "A replenishment request from manager1 for 10 Denim Jeans for Downtown Store, which ho1 has issued to Uptown Store as a transfer order (status Issued).", "After the order was issued, cashier2 (an Uptown cashier created by admin1) sold 20 Denim Jeans at Uptown Store, leaving 5."), preExpect: READY,
        steps: [
          ['As inventory2 click Dispatch.', 'Blocked: insufficient stock.'],
          ['Check the order, Uptown stock and stock card.', 'Order still Issued; Uptown Denim Jeans 5; no TRANSFER_OUT movement.'],
        ],
        auto: async (ctx) => {
          const { order } = await issuedOrder(ctx);
          await ctx.createUser('cashier2', 'CASHIER', 'STORE_002'); await ctx.checkout([['P002', 20]], {}, 'cashier2');
          ctx.at(1);
          const r = await ctx.as('inventory2').post(RF08.dispatch(order.id)); check(r.status === 409, show(r));
          ctx.at(2, show(r));
          const [o] = await ordersFor(ctx, order.stockRequestId); const s = await ctx.stock('STORE_002', 'P002');
          const out = (await ctx.movements('STORE_002')).filter((m) => m.type === 'TRANSFER_OUT').length;
          check(nOrd(o.status) === 'ISSUED' && s === 5 && out === 0, `${o.status}, ${s}, ${out}`);
        },
      },
      {
        id: 'TC-08.4-05', ac: 'AC3', type: 'Security', name: 'The source store has no approve or reject action on an order',
        description: 'Transfer orders are binding (D-06).', pre: need(FRESH_DATA, accounts('manager2'), "A replenishment request from manager1 for 10 Denim Jeans for Downtown Store, which ho1 has issued to Uptown Store as a transfer order (status Issued).", API_CLIENT), preExpect: READY,
        steps: [
          ['As manager2 look at the order in Orders to dispatch.', 'Only Dispatch and Report unfulfillable are offered.'],
          ['As manager2 send POST /api/transfers/<id>/approve and /reject.', 'Both refused (404/405/403); order stays Issued.'],
        ],
        auto: async (ctx) => {
          const { order } = await issuedOrder(ctx);
          ctx.at(1); ctx.saw('UI check');
          ctx.at(2);
          const a = await ctx.as('manager2').post(`/api/transfers/${order.id}/approve`); const b = await ctx.as('manager2').post(`/api/transfers/${order.id}/reject`, { reason: 'x' });
          check([403, 404, 405].includes(a.status) && [403, 404, 405].includes(b.status), `${a.status}, ${b.status}`);
        },
      },
      {
        id: 'TC-08.4-06', ac: 'AC4', type: 'Integrity', name: 'Dispatching the same order twice deducts stock once',
        description: 'Repeated and simultaneous dispatch of one order.', pre: need(FRESH_DATA, accounts('inventory2'), "Two transfer orders, A and B, each for 5 Denim Jeans from Uptown Store to Downtown Store, both Issued.", "Denim Jeans (barcode 0002): 8 units at Downtown Store and 25 at Uptown Store, minimum level 10 at both.", API_CLIENT), preExpect: READY,
        steps: [
          ['As inventory2 dispatch order A, then dispatch A again.', 'Second dispatch refused (409).'],
          ['Send three dispatch requests for order B at the same moment.', 'Exactly one succeeds.'],
          ['Check Uptown stock and stock card.', 'Denim Jeans 25 → 15; exactly 2 TRANSFER_OUT movements.'],
        ],
        auto: async (ctx) => {
          const A = await issuedOrder(ctx, 5); const B = await issuedOrder(ctx, 5); await ctx.token('inventory2');
          ctx.at(1);
          const a1 = await ctx.as('inventory2').post(RF08.dispatch(A.order.id)); const a2 = await ctx.as('inventory2').post(RF08.dispatch(A.order.id));
          check(a1.status === 200 && a2.status === 409, `${a1.status}, ${a2.status}`);
          ctx.at(2, '200 then 409');
          const bs = await Promise.all([1, 2, 3].map(() => ctx.as('inventory2').post(RF08.dispatch(B.order.id))));
          check(bs.filter((r) => r.status === 200).length === 1, bs.map((r) => r.status).join(', '));
          ctx.at(3, 'one succeeded');
          const s = await ctx.stock('STORE_002', 'P002'); const n = (await ctx.movements('STORE_002')).filter((m) => m.type === 'TRANSFER_OUT').length;
          check(s === 15 && n === 2, `Uptown ${s}, TRANSFER_OUT ${n}`);
        },
      },
      {
        id: 'TC-08.4-07', ac: 'INT', type: 'Integrity', name: 'Two orders competing for the same source stock never drive it negative',
        description: 'No reservation at issue (§9.2): only what exists can leave.', pre: need(FRESH_DATA, accounts('inventory2'), "Two Issued transfer orders of 20 Denim Jeans each from Uptown Store, which holds only 25.", API_CLIENT), preExpect: READY,
        steps: [
          ['As inventory2 dispatch both orders at the same moment.', 'One dispatch succeeds, the other is refused (409).'],
          ['Check Uptown stock.', 'Denim Jeans 5 — never negative.'],
        ],
        auto: async (ctx) => {
          const A = await issuedOrder(ctx, 20); const B = await issuedOrder(ctx, 20); await ctx.token('inventory2');
          ctx.at(1);
          const rs = await Promise.all([A, B].map((x) => ctx.as('inventory2').post(RF08.dispatch(x.order.id))));
          check(rs.filter((r) => r.status === 200).length === 1 && rs.filter((r) => r.status === 409).length === 1, rs.map((r) => r.status).join(', '));
          ctx.at(2, '200 + 409');
          const s = await ctx.stock('STORE_002', 'P002'); check(s === 5, `Uptown ${s}`);
        },
      },
      {
        id: 'TC-08.4-08', ac: 'INT', type: 'Integrity', name: 'Refused transfer operations leave stock and movements untouched',
        description: 'Only legitimate operations change stock (FR-INV-06).', pre: need(FRESH_DATA, accounts('ho1', 'inventory1', 'inventory2'), "A replenishment request from manager1 for 10 Denim Jeans for Downtown Store, which ho1 has issued to Uptown Store as a transfer order (status Issued).", "A second request from manager1 for 30 Denim Jeans — more than Uptown Store holds.", "Denim Jeans (barcode 0002): 8 units at Downtown Store and 25 at Uptown Store, minimum level 10 at both.", API_CLIENT), preExpect: READY,
        steps: [
          ['Perform, expecting refusals: ho1 issues the x30 request from Uptown; inventory1 dispatches the order; inventory1 receives it before dispatch.', 'All three refused.'],
          ['inventory2 dispatches the order twice.', 'First succeeds, second refused.'],
          ['Check stock cards and on-hand of both stores.', 'Apart from the opening balances: Uptown 15 with exactly 1 movement; Downtown 8 with no movement.'],
        ],
        auto: async (ctx) => {
          const { order } = await issuedOrder(ctx, 10); const big = (await submitRequest(ctx, [['P002', 30]])).body;
          ctx.at(1);
          const st = [(await issueOrder(ctx, big)).status, (await ctx.as('inventory1').post(RF08.dispatch(order.id))).status, (await ctx.as('inventory1').post(RF08.receive(order.id))).status];
          check(st.every((s) => s >= 400), st.join(', '));
          ctx.at(2, st.join(', '));
          const d = [(await ctx.as('inventory2').post(RF08.dispatch(order.id))).status, (await ctx.as('inventory2').post(RF08.dispatch(order.id))).status];
          check(d[0] === 200 && d[1] === 409, d.join(', '));
          ctx.at(3, d.join(', '));
          const moved = (m) => m.note !== 'Opening balance';
          const m2 = (await ctx.movements('STORE_002')).filter(moved).length; const m1 = (await ctx.movements('STORE_001')).filter(moved).length;
          const s2 = await ctx.stock('STORE_002', 'P002'); const s1 = await ctx.stock('STORE_001', 'P002');
          check(m2 === 1 && m1 === 0 && s2 === 15 && s1 === 8, `Uptown ${s2} (${m2} movements), Downtown ${s1} (${m1})`);
        },
      },
      {
        id: 'TC-08.4-09', retired: 'Removing ad-hoc "Dispatch stock" means redesigning the stock-out flow and its screen (BUG-008).', ac: 'INT', type: 'Integrity', name: 'Stock cannot leave a store towards another store outside a transfer order',
        description: 'D-06: inter-store movements only through HO-issued orders.', pre: need(FRESH_DATA, accounts('inventory1'), "Classic T-Shirt (barcode 0001): 40 units at Downtown Store and 30 at Uptown Store.", API_CLIENT), preExpect: READY,
        steps: [
          ['As inventory1 try to send T-Shirt x5 to Uptown without a transfer order (Inventory → Dispatch stock, or POST /api/inventory/dispatch-stock {"productId":"P001","quantity":5,"destinationStoreId":"STORE_002"}).', 'Not possible: refused (4xx) or no such action.'],
          ['Check T-Shirt across both stores.', 'Chain total still 70 (40 + 30).'],
        ],
        auto: async (ctx) => {
          ctx.at(1);
          const r = await ctx.as('inventory1').post('/api/inventory/dispatch-stock', { productId: 'P001', quantity: 5, destinationStoreId: 'STORE_002' });
          const t = await total(ctx, 'P001');
          check(r.status >= 400, `${show(r)} — Downtown stock reduced without a transfer order; chain total ${t}`);
          ctx.at(2, show(r));
          check(t === 70, `chain total ${t}`);
        },
      },
    ],
  },

  // ============================================================== US-08.5
  {
    ...S, id: 'US-08.5', name: 'Report order unfulfillable',
    story: 'As the source store\'s Store Manager, I want to report that I physically cannot ship an order so that head office can reallocate it quickly.',
    acs: [
      { id: 'AC1', text: 'Given an Issued order, when reporting with a mandatory reason, the order becomes Unfulfillable, its quantity returns to the request and the HO Manager is notified to reallocate.', rules: 'BR-15, FR-TRF-09' },
      { id: 'AC2', text: 'An order that is In Transit or Received cannot be reported unfulfillable.', rules: 'ST-02' },
    ],
    cases: [
      {
        id: 'TC-08.5-01', ac: 'AC1', type: 'Functional', name: 'Source Store Manager reports an Issued order unfulfillable',
        description: 'The order is released back to HO for reallocation.', pre: need(FRESH_DATA, accounts('manager2', 'ho1'), "A replenishment request from manager1 for 10 Denim Jeans for Downtown Store, which ho1 has issued to Uptown Store as a transfer order (status Issued)."), preExpect: READY,
        steps: [
          ['As manager2 open the order and choose Report unfulfillable; enter reason "Damaged stock"; confirm.', 'Order status Unfulfillable with the reason.'],
          ['As ho1 open the request.', 'Quantity 10 is open again for allocation; HO sees a notification; stock unchanged.'],
        ],
        auto: async (ctx) => {
          const { order } = await issuedOrder(ctx);
          ctx.at(1);
          const r = await ctx.as('manager2').post(RF08.unfulfillable(order.id), { reason: 'Damaged stock' });
          check(r.status === 200 && r.body.status === 'UNFULFILLABLE', `${show(r)} — no unfulfillable action`);
          ctx.at(2, 'Unfulfillable');
        },
      },
      {
        id: 'TC-08.5-02', ac: 'AC2', type: 'Negative', name: 'Unfulfillable needs a reason, an Issued order and the source store',
        description: 'Missing reason, wrong state and wrong store are refused.', pre: need(FRESH_DATA, accounts('manager1', 'manager2'), "Two transfer orders of 5 Denim Jeans from Uptown Store to Downtown Store: order A still Issued, order B already dispatched (In Transit)."), preExpect: READY,
        steps: [
          ['As manager2 report order A without a reason.', 'Refused (400).'],
          ['As manager2 report order B (In Transit).', 'Refused (409).'],
          ['As manager1 (destination) report order A.', 'Refused (403).'],
        ],
        auto: async (ctx) => {
          const A = await issuedOrder(ctx, 5);
          ctx.at(1);
          const a = await ctx.as('manager2').post(RF08.unfulfillable(A.order.id), {});
          if (missingRoute(a)) blocked('Unfulfillable action does not exist (see TC-08.5-01)');
          check(a.status === 400, show(a));
          const B = await inTransitOrder(ctx, 5);
          ctx.at(2, '400');
          const b = await ctx.as('manager2').post(RF08.unfulfillable(B.order.id), { reason: 'x' }); check(b.status === 409, show(b));
          ctx.at(3, '409');
          const c = await ctx.as('manager1').post(RF08.unfulfillable(A.order.id), { reason: 'x' }); check(c.status === 403, show(c));
        },
      },
    ],
  },

  // ============================================================== US-08.6
  {
    ...S, id: 'US-08.6', name: 'Receive transfer order',
    story: 'As Inventory Staff / Store Manager of the destination store, I want to confirm receipt so that my store\'s stock increases.',
    acs: [
      { id: 'AC1', text: 'Given an In Transit order, when receiving, destination stock increases by exactly the dispatched quantity, a TRANSFER_IN movement is created, the order becomes Received, and the request\'s received quantity is updated.', rules: 'BR-20, FR-TRF-10' },
      { id: 'AC2', text: 'Given a Received order, when receiving again (including a duplicate network request), it is rejected and stock is not increased twice.', rules: 'BR-20, NFR-07' },
      { id: 'AC3', text: 'Given goods arrive short / damaged, receive the full quantity, note the discrepancy, and create a stock adjustment with reason "Transfer difference" referencing the order number [Assumption — OI-05].', rules: 'BR-11, BR-20, OI-05' },
      { id: 'AC4', text: 'Given every line of the request is now fully received, the request becomes Completed automatically.', rules: 'BR-22, FR-TRF-11' },
      { id: 'AC5', text: 'Only users of the destination store can receive.', rules: 'BR-02' },
      { id: 'INT', text: 'Stock integrity across the whole flow: chain-wide quantity is conserved, stock equals the movement ledger, and state survives a restart.', rules: 'BR-12, NFR-06, NFR-14, FR-INV-08' },
    ],
    cases: [
      {
        id: 'TC-08.6-01', ac: 'AC1', type: 'Functional', name: 'Destination Inventory Staff receives an In Transit order',
        description: 'Stock arrives at the destination on receipt.', pre: need(FRESH_DATA, accounts('inventory1', 'ho1'), "A transfer order of 10 Denim Jeans from Uptown Store to Downtown Store (requested by manager1, issued by ho1) that inventory2 has already dispatched (status In Transit).", stock('Downtown', ["Denim Jeans", 8])), preExpect: READY,
        steps: [
          ['As inventory1 open Incoming and click Receive on the order.', 'Order status Received.'],
          ['Check Downtown stock and stock card.', 'Denim Jeans 8 → 18; one TRANSFER_IN movement of 10.'],
          ['Open the Audit Log as ho1.', 'The receipt is audited.'],
        ],
        auto: async (ctx) => {
          const { order } = await inTransitOrder(ctx);
          ctx.at(1);
          const r = await ctx.as('inventory1').post(RF08.receive(order.id)); check(r.status === 200 && nOrd(r.body.status) === 'RECEIVED', show(r));
          ctx.at(2, 'Received');
          const s = await ctx.stock('STORE_001', 'P002'); const inn = (await ctx.movements('STORE_001')).filter((m) => m.type === 'TRANSFER_IN');
          check(s === 18 && inn.length === 1 && inn[0].quantity === 10, `Downtown ${s}, TRANSFER_IN ${JSON.stringify(inn)}`);
          ctx.at(3, 'Downtown 18, 1 TRANSFER_IN');
          check(!!(await ctx.audit()).find((x) => x.resource === order.id && /RECEIVE/.test(x.action)), 'no audit entry');
        },
      },
      {
        id: 'TC-08.6-02', ac: 'AC1', type: 'Functional', name: 'Destination Store Manager can receive',
        description: '§2.2 gives TRANSFER_RECEIVE to the Store Manager as well.', pre: need(FRESH_DATA, accounts('manager1'), "A transfer order of 10 Denim Jeans from Uptown Store to Downtown Store (requested by manager1, issued by ho1) that inventory2 has already dispatched (status In Transit).", stock('Downtown', ["Denim Jeans", 8])), preExpect: READY,
        steps: [['As manager1 click Receive on the order.', 'Order Received; Downtown Denim Jeans 18.']],
        auto: async (ctx) => {
          const { order } = await inTransitOrder(ctx);
          ctx.at(1);
          const r = await ctx.as('manager1').post(RF08.receive(order.id)); check(r.status === 200, show(r));
        },
      },
      {
        id: 'TC-08.6-03', ac: 'AC2', type: 'Integrity', name: 'An order can be received only once and only while In Transit',
        description: 'Duplicate and premature receipts never add stock.', pre: need(FRESH_DATA, accounts('inventory1'), "Three transfer orders of 5 Denim Jeans each from Uptown Store to Downtown Store: order A Issued (not dispatched); orders B and C In Transit.", stock('Downtown', ["Denim Jeans", 8]), API_CLIENT), preExpect: READY,
        steps: [
          ['As inventory1 receive order A.', 'Refused (409) — not dispatched yet.'],
          ['Receive order B, then receive B again.', 'First succeeds; second refused (409).'],
          ['Send three receive requests for order C at the same moment.', 'Exactly one succeeds.'],
          ['Check Downtown stock and stock card.', 'Denim Jeans 8 → 18; exactly 2 TRANSFER_IN movements.'],
        ],
        auto: async (ctx) => {
          const A = await issuedOrder(ctx, 5); const B = await inTransitOrder(ctx, 5); const C = await inTransitOrder(ctx, 5); await ctx.token('inventory1');
          ctx.at(1);
          const a = await ctx.as('inventory1').post(RF08.receive(A.order.id)); check(a.status === 409, show(a));
          ctx.at(2, '409');
          const b1 = await ctx.as('inventory1').post(RF08.receive(B.order.id)); const b2 = await ctx.as('inventory1').post(RF08.receive(B.order.id));
          check(b1.status === 200 && b2.status === 409, `${b1.status}, ${b2.status}`);
          ctx.at(3, '200 then 409');
          const cs = await Promise.all([1, 2, 3].map(() => ctx.as('inventory1').post(RF08.receive(C.order.id))));
          check(cs.filter((r) => r.status === 200).length === 1, cs.map((r) => r.status).join(', '));
          ctx.at(4, 'one succeeded');
          const s = await ctx.stock('STORE_001', 'P002'); const n = (await ctx.movements('STORE_001')).filter((m) => m.type === 'TRANSFER_IN').length;
          check(s === 18 && n === 2, `Downtown ${s}, TRANSFER_IN ${n}`);
        },
      },
      {
        id: 'TC-08.6-04', ac: 'AC3', type: 'Functional', name: 'Short arrival: receive in full, then adjust with reason Transfer difference',
        description: 'Discrepancy handling agreed in OI-05.', pre: need(FRESH_DATA, accounts('inventory1'), "A transfer order of 10 Denim Jeans from Uptown Store to Downtown Store (requested by manager1, issued by ho1) that inventory2 has already dispatched (status In Transit).", "Physically only 8 of the 10 units arrived at Downtown Store."), preExpect: READY,
        steps: [
          ['As inventory1 receive the order (full quantity) and note the discrepancy.', 'Order Received; Downtown Denim Jeans 18.'],
          ['Create a stock adjustment: Denim Jeans −2, reason Transfer difference, reference = order number.', 'Adjustment saved; Denim Jeans 16; ADJUST movement references the order.'],
        ],
        auto: async (ctx) => {
          const { order } = await inTransitOrder(ctx);
          ctx.at(1);
          const r = await ctx.as('inventory1').post(RF08.receive(order.id)); check(r.status === 200, show(r));
          ctx.at(2, 'Received, 18');
          const a = await ctx.as('inventory1').post(RF08.adjust, { productId: 'P002', quantityChange: -2, reasonCode: 'TRANSFER_DIFF', reference: order.id });
          check([200, 201].includes(a.status) && (await ctx.stock('STORE_001', 'P002')) === 16, `${show(a)} — no stock adjustment action`);
        },
      },
      {
        id: 'TC-08.6-05', ac: 'AC4', type: 'Functional', name: 'Request completes automatically when everything is received',
        description: 'BR-22 auto-completion.', pre: need(FRESH_DATA, accounts('inventory1', 'manager1'), "A transfer order of 10 Denim Jeans from Uptown Store to Downtown Store (requested by manager1, issued by ho1) that inventory2 has already dispatched (status In Transit)."), preExpect: READY,
        steps: [['As inventory1 receive the order, then (as manager1) open the request.', 'Request status Completed.']],
        auto: async (ctx) => {
          const { req, order } = await inTransitOrder(ctx);
          ctx.at(1);
          await ctx.as('inventory1').post(RF08.receive(order.id));
          const s = (await getRequest(ctx, req.id)).status; check(s === 'COMPLETED', s);
        },
      },
      {
        id: 'TC-08.6-06', retired: 'Needs partial allocation (BUG-014) to have a request partly received.', ac: 'AC4', type: 'Functional', name: 'Request stays In Progress while part of the quantity is still open',
        description: 'Partial receipt does not complete the request.', pre: need(FRESH_DATA, accounts('inventory1'), "A request from manager1 for 10 Denim Jeans of which ho1 allocated only 6 from Uptown Store; that order has been dispatched."), preExpect: READY,
        steps: [['As inventory1 receive the order (6), then open the request.', 'Request still In Progress: received 6 of 10.']],
        auto: async (ctx) => {
          const req = (await submitRequest(ctx, [['P002', 10]])).body;
          await issueOrder(ctx, req, 'STORE_002', 6); const [o] = await ordersFor(ctx, req.id);
          if (o && o.quantity === 10) blocked('Partial allocation is not possible — the API always ships the full request (see TC-08.3-05)');
          await ctx.as('inventory2').post(RF08.dispatch(o.id));
          ctx.at(1);
          await ctx.as('inventory1').post(RF08.receive(o.id));
          const s = (await getRequest(ctx, req.id)).status; check(nReq(s) === 'IN_PROGRESS', s);
        },
      },
      {
        id: 'TC-08.6-07', ac: 'AC5', type: 'Security', name: 'Only the destination store can receive',
        description: 'Source staff and HO cannot receive.', pre: need(FRESH_DATA, accounts('inventory2', 'ho1'), "A transfer order of 10 Denim Jeans from Uptown Store to Downtown Store (requested by manager1, issued by ho1) that inventory2 has already dispatched (status In Transit).", API_CLIENT), preExpect: READY,
        steps: [['As inventory2 (source) and as ho1 send POST /api/transfers/<order id>/receive.', 'HTTP 403 for both; order stays In Transit; Downtown stock 8.']],
        auto: async (ctx) => {
          const { order } = await inTransitOrder(ctx);
          ctx.at(1);
          const a = await ctx.as('inventory2').post(RF08.receive(order.id)); const b = await ctx.as('ho1').post(RF08.receive(order.id));
          const s = await ctx.stock('STORE_001', 'P002');
          check(a.status === 403 && b.status === 403 && s === 8, `${a.status}, ${b.status}; Downtown ${s}`);
        },
      },
      {
        id: 'TC-08.6-08', ac: 'INT', type: 'Integrity', name: 'Chain-wide quantity is conserved through dispatch and receipt',
        description: 'Goods in transit are the only difference between the chain total before and after.', pre: need(FRESH_DATA, accounts('inventory1', 'inventory2'), "A replenishment request from manager1 for 10 Denim Jeans for Downtown Store, which ho1 has issued to Uptown Store as a transfer order (status Issued).", "Denim Jeans (barcode 0002): 8 units at Downtown Store and 25 at Uptown Store, minimum level 10 at both."), preExpect: READY,
        steps: [
          ['Note Denim Jeans on-hand at both stores.', 'Total 33 (8 + 25).'],
          ['inventory2 dispatches the order; note the total again.', 'Total 23 — the 10 units are in transit.'],
          ['inventory1 receives the order; note the total again.', 'Total 33 again.'],
        ],
        auto: async (ctx) => {
          const { order } = await issuedOrder(ctx);
          ctx.at(1); const t0 = await total(ctx, 'P002'); check(t0 === 33, t0);
          ctx.at(2, '33'); await ctx.as('inventory2').post(RF08.dispatch(order.id)); const t1 = await total(ctx, 'P002'); check(t1 === 23, t1);
          ctx.at(3, '23'); await ctx.as('inventory1').post(RF08.receive(order.id)); const t2 = await total(ctx, 'P002'); check(t2 === 33, t2);
          ctx.saw('33');
        },
      },
      {
        id: 'TC-08.6-09', ac: 'INT', type: 'Integrity', name: 'Stock reconciles with the movement ledger after transfer activity',
        description: 'BR-12 / NFR-06: on-hand equals the sum of movements for every store and product.', pre: need(FRESH_DATA, accounts('ho1'), "Activity since the demo start: three completed transfers from Uptown to Downtown (10 Denim Jeans, 5 Classic T-Shirts, 7 Baseball Caps), one request rejected by ho1 and one order of 3 Denim Jeans still In Transit."), preExpect: READY,
        steps: [
          ['For every store and product compare on-hand with the sum of its stock-card movements.', 'They match for every row; no on-hand is negative or non-integer.'],
          ['Open the stock card of any demo product.', 'Its first line is the opening balance (ADJUST "Opening balance"), so the ledger starts from the demo stock.'],
        ],
        auto: async (ctx) => {
          for (const [p, q] of [['P002', 10], ['P001', 5], ['P005', 7]]) {
            const req = (await submitRequest(ctx, [[p, q]])).body; await issueOrder(ctx, req);
            const [o] = await ordersFor(ctx, req.id); await ctx.as('inventory2').post(RF08.dispatch(o.id)); await ctx.as('inventory1').post(RF08.receive(o.id));
          }
          const rej = (await submitRequest(ctx, [['P003', 2]])).body; await ctx.as('ho1').post(RF08.reject(rej.id), { reason: 'QC' });
          await inTransitOrder(ctx, 3);
          ctx.at(1);
          const problems = await ctx.reconcile(); check(problems.length === 0, problems.join('; '));
          ctx.at(2, 'all rows match');
          const bad = [];
          for (const s of ['STORE_001', 'STORE_002']) {
            const cur = await ctx.stockMap(s); const movs = await ctx.movements(s);
            for (const [p, q] of Object.entries(cur)) {
              const sum = movs.filter((m) => m.productId === p).reduce((a, m) => a + (['RECEIVE', 'TRANSFER_IN', 'ADJUST'].includes(m.type) ? 1 : -1) * m.quantity, 0);
              if (sum !== q) bad.push(`${s}/${p}: on-hand ${q}, Σ movements ${sum}`);
            }
          }
          check(bad.length === 0, `${bad.length} rows have no opening movement, e.g. ${bad.slice(0, 2).join('; ')}`);
        },
      },
      {
        id: 'TC-08.6-10', ac: 'INT', type: 'Integrity', name: 'An order in transit survives a server restart and completes consistently',
        description: 'Durability of transfer state and stock (NFR-14).', pre: need(FRESH_DATA, accounts('inventory1'), "A transfer order of 10 Denim Jeans from Uptown Store to Downtown Store (requested by manager1, issued by ho1) that inventory2 has already dispatched (status In Transit)."), preExpect: READY,
        steps: [
          ['Restart the application (same database).', 'The order is still In Transit; Uptown Denim Jeans 15.'],
          ['As inventory1 receive the order.', 'Received; Downtown Denim Jeans 18; stock reconciles with movements.'],
        ],
        auto: async (ctx) => {
          const { order } = await inTransitOrder(ctx);
          ctx.at(1);
          await ctx.restart(); ctx.tokens = {};
          const [o] = await ordersFor(ctx, order.stockRequestId); const s2 = await ctx.stock('STORE_002', 'P002');
          check(o.status === 'IN_TRANSIT' && s2 === 15, `${o.status}, Uptown ${s2}`);
          ctx.at(2, 'In Transit, Uptown 15');
          const r = await ctx.as('inventory1').post(RF08.receive(order.id)); const s1 = await ctx.stock('STORE_001', 'P002'); const p = await ctx.reconcile();
          check(r.status === 200 && s1 === 18 && p.length === 0, `${show(r)}; Downtown ${s1}; ${p.join('; ')}`);
        },
      },
    ],
  },

  // ============================================================== US-08.7
  {
    ...S, id: 'US-08.7', name: 'Close request with shortfall',
    story: 'As an HO Manager, I want to close a request that cannot be fully supplied so that it does not stay open forever.',
    acs: [
      { id: 'AC1', text: 'Given an In Progress request with no Issued or In Transit orders, when closing with a reason, it becomes Completed and the shortfall per line is recorded.', rules: 'BR-22, FR-TRF-11' },
      { id: 'AC2', text: 'The destination Store Manager is notified of the closure and shortfall.', rules: 'FR-TRF-14' },
    ],
    cases: [
      {
        id: 'TC-08.7-01', ac: 'AC1', type: 'Functional', name: 'HO closes a request with a shortfall reason',
        description: 'Closing an In Progress request that has no open order left (its only order could not be fulfilled).', pre: need(FRESH_DATA, accounts('ho1'), "A replenishment request from manager1 for 10 Denim Jeans for Downtown Store, issued by ho1 to Uptown Store; manager2 has reported that order Unfulfillable, so the request is In Progress with no open order."), preExpect: READY,
        steps: [
          ['As ho1 open the request, choose Close, enter reason "Supplier out of stock" and confirm.', 'Request Completed; shortfall Denim Jeans 10 is recorded with the reason.'],
          ['As manager1 open the request.', 'Status Completed, showing the shortfall and the reason.'],
        ],
        auto: async (ctx) => {
          const { req, order } = await issuedOrder(ctx);
          await ctx.as('manager2').post(RF08.unfulfillable(order.id), { reason: 'Damaged stock' });
          ctx.at(1);
          const r = await ctx.as('ho1').post(RF08.closeRequest(req.id), { reason: 'Supplier out of stock' });
          check(r.status === 200 && r.body.status === 'COMPLETED' && r.body.shortfall === 10, `${show(r)} — no close action`);
          ctx.at(2, 'Completed, shortfall 10');
          const mine = await getRequest(ctx, req.id, 'manager1');
          check(mine.status === 'COMPLETED' && mine.closeReason === 'Supplier out of stock', `status ${mine.status}, reason ${mine.closeReason}`);
        },
      },
      {
        id: 'TC-08.7-02', ac: 'AC1', type: 'Negative', name: 'A request cannot be closed while an order is still open',
        description: 'Orders Issued or In Transit block closing.', pre: need(FRESH_DATA, accounts('ho1'), "A replenishment request from manager1 for 10 Denim Jeans for Downtown Store, which ho1 has issued to Uptown Store as a transfer order (status Issued)."), preExpect: READY,
        steps: [['As ho1 try to close the request.', 'Refused (409); request stays In Progress.']],
        auto: async (ctx) => {
          const { req } = await issuedOrder(ctx);
          ctx.at(1);
          const r = await ctx.as('ho1').post(RF08.closeRequest(req.id), { reason: 'x' });
          if (missingRoute(r)) blocked('Close-request action does not exist (see TC-08.7-01)');
          check(r.status === 409, show(r));
        },
      },
      {
        id: 'TC-08.7-03', ac: 'AC2', type: 'UI', name: 'Destination Store Manager is notified of the closure and shortfall',
        description: 'Manual UI check of the in-app notification.', pre: need(FRESH_DATA, accounts('manager1'), "A request that ho1 has just closed with a shortfall (see TC-08.7-01)."), preExpect: READY,
        steps: [['Sign in as manager1 and open notifications.', 'A notification names the request, the closure reason and the shortfall per line.']],
      },
    ],
  },

  // ============================================================== US-08.8
  {
    ...S, id: 'US-08.8', name: 'Track requests and transfer orders',
    story: 'As a Store Manager / HO Manager, I want to see where each request and order stands so that I know when goods will arrive.',
    acs: [
      { id: 'AC1', text: 'Store Manager: "My requests" with status and per-line requested / allocated / received quantities; "Orders to dispatch" (as source) and "Incoming" (as destination).', rules: 'FR-TRF-13, BR-02' },
      { id: 'AC2', text: 'HO Manager: every request and order chain-wide, filterable by status, store, date range.', rules: 'FR-TRF-13' },
      { id: 'AC3', text: 'Request and order details show a timeline: submitted → orders issued → dispatched → received (or rejected / cancelled / unfulfillable / closed), with who and when for each step.', rules: 'FR-TRF-12, ST-01, ST-02' },
    ],
    cases: [
      {
        id: 'TC-08.8-01', ac: 'AC1', type: 'Functional', name: 'My requests shows status and per-line quantities, own store only',
        description: 'Store Manager tracking view.', pre: need(FRESH_DATA, accounts('manager1'), "A request from manager1 for 10 Denim Jeans that has been issued from Uptown, dispatched and received.", "A request submitted by manager2 for Uptown Store."), preExpect: READY,
        steps: [
          ['As manager1 open My requests.', 'Only Downtown requests are listed (not manager2\'s).'],
          ['Open the Denim Jeans request.', 'Line shows requested 10, allocated 10, received 10; status Completed.'],
        ],
        auto: async (ctx) => {
          const { req, order } = await inTransitOrder(ctx); await ctx.as('inventory1').post(RF08.receive(order.id));
          const other = (await submitRequest(ctx, [['P003', 1]], 'manager2')).body;
          ctx.at(1);
          const mine = (await ctx.as('manager1').get(`${RF08.requests}?storeId=STORE_002`)).body;
          check(mine.every((x) => x.storeId === 'STORE_001') && !mine.some((x) => x.id === other.id), 'other store\'s request listed');
          ctx.at(2, `${mine.length} Downtown request(s)`);
          const r = mine.find((x) => x.id === req.id); const line = (r.lines || [])[0] || r;
          const q = [line.requestedQty, line.allocatedQty, line.receivedQty];
          check(q.every((v) => v === 10), `line requested/allocated/received = ${q.map((v) => v ?? '—').join(' / ')}`);
        },
      },
      {
        id: 'TC-08.8-02', ac: 'AC2', type: 'Functional', name: 'HO filters requests by status, store and date range',
        description: 'Chain-wide tracking view.', pre: need(FRESH_DATA, accounts('ho1'), "Requests A and B submitted by manager1 and request C submitted by manager2; ho1 has issued request A."), preExpect: READY,
        steps: [
          ['As ho1 filter requests by store Uptown.', 'Only C.'],
          ['Filter by status In Progress.', 'Only A.'],
          ['Filter by date range tomorrow.', 'No requests.'],
        ],
        auto: async (ctx) => {
          const { req: A } = await issuedOrder(ctx, 2); await submitRequest(ctx, [['P003', 1]]); const C = (await submitRequest(ctx, [['P003', 1]], 'manager2')).body;
          const ids = async (q) => (await ctx.as('ho1').get(`${RF08.requests}?${q}`)).body.map((x) => x.id);
          ctx.at(1); const s = await ids('storeId=STORE_002'); check(JSON.stringify(s) === JSON.stringify([C.id]), JSON.stringify(s));
          ctx.at(2, 'only C'); const st = await ids('status=IN_PROGRESS'); check(JSON.stringify(st) === JSON.stringify([A.id]), `status filter returned ${st.length} requests`);
          ctx.at(3, 'only A'); const d = await ids(`from=${isoDay(1)}&to=${isoDay(1)}`); check(d.length === 0, `${d.length} requests`);
        },
      },
      {
        id: 'TC-08.8-03', ac: 'AC3', type: 'Functional', name: 'Timeline shows every step with who and when',
        description: 'Request and order timeline.', pre: need(FRESH_DATA, accounts('ho1'), "A request from manager1 for 10 Denim Jeans that has gone through the whole flow: issued from Uptown, dispatched and received."), preExpect: READY,
        steps: [
          ['As ho1 open the request detail.', 'Timeline: Submitted → order issued → dispatched → received, each with user and time.'],
        ],
        auto: async (ctx) => {
          const req = (await submitRequest(ctx, [['P002', 10]])).body;
          await issueOrder(ctx, req);
          const [o] = await ordersFor(ctx, req.id);
          await ctx.as('inventory2').post(RF08.dispatch(o.id)); await ctx.as('inventory1').post(RF08.receive(o.id));
          ctx.at(1);
          const r = await getRequest(ctx, req.id); const [o2] = await ordersFor(ctx, req.id);
          const steps = (r.history || []).map((h) => h.status);
          const complete = steps.some((s) => /DISPATCH|TRANSIT/.test(s)) && (r.history || []).every((h) => h.at && h.by) && o2.dispatchedAt && o2.dispatchedBy && o2.receivedAt && o2.receivedBy;
          check(complete, `timeline ${steps.join(' → ')}; order dispatchedBy ${o2.dispatchedBy || '—'}, receivedBy ${o2.receivedBy || '—'}`);
          ctx.saw(steps.join(' → '));
        },
      },
    ],
  },
];
