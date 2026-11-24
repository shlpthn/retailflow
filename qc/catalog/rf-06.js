'use strict';
// PBI RF-06 — Point of sale · Sprint 3 backlog item US-06.4
const { check, show } = require('../lib/harness');
const {
  need, FRESH_DATA, signedIn, accounts, stock, API_CLIENT, READY, history,
} = require('./common');

const storeCount = async (ctx) => (await history(ctx, 'ho1', 'storeId=STORE_001&limit=100')).body.totalCount;

module.exports = [{
  pbi: 'RF-06', sprint: 'S3', backlog: 'US-06.4', id: 'US-06.4', name: 'Payment and sale completion',
  story: 'As a Cashier, I want to complete the transaction so that revenue and stock are recorded correctly.',
  acs: [
    { id: 'AC1', text: 'The Cashier selects a payment method: Cash, Bank transfer/QR or Card (recorded only, no payment gateway — D-01).', rules: 'D-01, FR-POS-05' },
    { id: 'AC2', text: 'Given Cash, when the amount tendered is less than the total, completion is blocked; when it is greater than or equal to the total, the change due is shown.', rules: 'FR-POS-05' },
    { id: 'AC3', text: 'Given every line has enough stock, when completing, a Completed receipt is created, stock is deducted exactly once and a SALE movement is recorded, all in one transaction.', rules: 'BR-07, FR-POS-06, FR-INV-04' },
    { id: 'AC4', text: 'Given one line lacks stock at commit time (e.g. another till just sold it), the whole transaction is rejected, no stock is deducted, and the short lines and remaining stock are shown.', rules: 'BR-06, BR-12, NFR-05' },
    { id: 'AC5', text: 'Given a flaky network causes the request to be sent twice, only one receipt exists and stock is deducted once.', rules: 'BR-07, FR-POS-07, NFR-07' },
  ],
  cases: [
    {
      id: 'TC-06.4-01', ac: 'AC1', type: 'Functional', name: 'Each payment method is recorded on the receipt',
      description: 'Cash, Bank transfer/QR and Card can each be selected and are stored on the receipt as chosen.',
      pre: need(FRESH_DATA, signedIn('cashier1', 'Checkout'), stock('Downtown', ["Baseball Cap", 50])), preExpect: READY,
      steps: [
        ['Add Baseball Cap (scan 0005) to the cart, choose Cash, enter amount tendered 12 and click Complete checkout.', 'Sale completes; receipt shows payment method Cash.'],
        ['Add Baseball Cap again, choose Bank transfer/QR and complete.', 'Sale completes; receipt shows Bank transfer/QR.'],
        ['Add Baseball Cap again, choose Card and complete.', 'Sale completes; receipt shows Card.'],
      ],
      auto: async (ctx) => {
        let n = 1;
        for (const m of ['CASH', 'BANK_TRANSFER_QR', 'CARD']) {
          ctx.at(n++);
          const r = await ctx.checkout([['P005', 1]], { paymentMethod: m, amountTendered: 12 });
          check(r.status === 201 && r.body.receipt.paymentMethod === m, `${m}: ${show(r)}`);
          ctx.saw(`receipt ${r.body.receipt.id}, method ${m}`);
        }
      },
    },
    {
      id: 'TC-06.4-02', ac: 'AC1', type: 'Negative', name: 'A payment method outside the allowed list is rejected',
      description: 'The server accepts only Cash, Bank transfer/QR and Card, whatever the client sends.',
      pre: need(FRESH_DATA, accounts('cashier1', 'manager1'), stock('Downtown', ["Baseball Cap", 50]), API_CLIENT), preExpect: READY,
      steps: [
        ['As cashier1 send POST /api/checkout {"items":[{"productId":"P005","quantity":1}],"paymentMethod":"BITCOIN"}.', 'HTTP 400 with an error message; no receipt is created.'],
        ['Sign in as manager1 and open Inventory; read Baseball Cap.', 'Baseball Cap on-hand is still 50.'],
      ],
      auto: async (ctx) => {
        ctx.at(1);
        const r = await ctx.checkout([['P005', 1]], { paymentMethod: 'BITCOIN' });
        check(r.status === 400, show(r));
        ctx.at(2, show(r));
        const q = await ctx.stock('STORE_001', 'P005');
        check(q === 50, `Baseball Cap on-hand ${q}`);
        ctx.saw('on-hand 50');
      },
    },
    {
      id: 'TC-06.4-03', ac: 'AC2', type: 'Negative', name: 'Cash payment with amount tendered below the total is blocked',
      description: 'A cash sale cannot be completed when the customer hands over less than the amount due.',
      pre: need(FRESH_DATA, signedIn('cashier1', 'Checkout'), accounts('manager1'), stock('Downtown', ["Denim Jeans", 8])), preExpect: READY,
      steps: [
        ['Add Denim Jeans (0002) — total 45. Choose Cash and enter amount tendered 20.', 'The screen shows amount tendered 20 against total 45.'],
        ['Click Complete checkout.', 'Completion is blocked with a message that the amount tendered is insufficient; no receipt is shown.'],
        ['Open Recent Sales, then (as manager1) Inventory → Denim Jeans.', 'No new receipt; Denim Jeans on-hand is still 8.'],
      ],
      auto: async (ctx) => {
        ctx.at(1);
        ctx.saw('cart total 45, tendered 20');
        ctx.at(2);
        const r = await ctx.checkout([['P002', 1]], { paymentMethod: 'CASH', amountTendered: 20 });
        check(r.status === 400, `${show(r)} — sale completed although tendered 20 < total 45`);
        ctx.at(3, show(r));
        const q = await ctx.stock('STORE_001', 'P002'); const n = await storeCount(ctx);
        check(q === 8 && n === 0, `Denim Jeans ${q}, receipts ${n}`);
      },
    },
    {
      id: 'TC-06.4-04', ac: 'AC2', type: 'Boundary', name: 'Cash payment with amount tendered equal to the total completes with zero change',
      description: 'Boundary of AC2: tendered = total is allowed.',
      pre: need(FRESH_DATA, signedIn('cashier1', 'Checkout'), stock('Downtown', ["Denim Jeans", 8])), preExpect: READY,
      steps: [
        ['Add Denim Jeans (total 45), choose Cash, enter amount tendered 45, click Complete checkout.', 'Sale completes.'],
        ['Read the receipt.', 'Receipt shows amount tendered 45 and change 0.'],
      ],
      auto: async (ctx) => {
        ctx.at(1);
        const r = await ctx.checkout([['P002', 1]], { paymentMethod: 'CASH', amountTendered: 45 });
        check(r.status === 201, show(r));
        ctx.at(2, `receipt ${r.body.receipt.id}`);
        const s = r.body.receipt; const t = s.amountTendered ?? s.cashReceived; const c = s.change ?? s.changeAmount;
        check(t === 45 && c === 0, `receipt stores tendered=${t}, change=${c}`);
      },
    },
    {
      id: 'TC-06.4-05', ac: 'AC2', type: 'Functional', name: 'Cash payment above the total shows and records the change due',
      description: 'When the customer overpays, the change is shown before completion and stored on the receipt.',
      pre: need(FRESH_DATA, signedIn('cashier1', 'Checkout'), stock('Downtown', ["Denim Jeans", 8])), preExpect: READY,
      steps: [
        ['Add Denim Jeans (total 45), choose Cash, enter amount tendered 50.', 'Change due 5 is shown before completing.'],
        ['Click Complete checkout and read the receipt.', 'Receipt shows amount tendered 50 and change 5.'],
      ],
      auto: async (ctx) => {
        ctx.at(1);
        ctx.saw('change is computed by the client (UI check)');
        ctx.at(2);
        const r = await ctx.checkout([['P002', 1]], { paymentMethod: 'CASH', amountTendered: 50 });
        check(r.status === 201, show(r));
        const s = r.body.receipt; const t = s.amountTendered ?? s.cashReceived; const c = s.change ?? s.changeAmount;
        check(t === 50 && c === 5, `receipt stores tendered=${t}, change=${c}`);
      },
    },
    {
      id: 'TC-06.4-06', ac: 'AC3', type: 'Functional', name: 'A completed sale creates one receipt and deducts stock once',
      description: 'Happy path of AC3 with two products.',
      pre: need(FRESH_DATA, signedIn('cashier1', 'Checkout'), accounts('manager1'), stock('Downtown', ["Classic T-Shirt", 40], ["Baseball Cap", 50])), preExpect: READY,
      steps: [
        ['Add Classic T-Shirt x2 (0001 scanned twice) and Baseball Cap x1, choose Card, click Complete checkout.', 'Receipt is shown with total 42.'],
        ['As manager1 open Inventory (Downtown).', 'Classic T-Shirt 40 → 38; Baseball Cap 50 → 49.'],
        ['As manager1 open Sales history.', 'Exactly one receipt exists for this sale.'],
      ],
      auto: async (ctx) => {
        ctx.at(1);
        const r = await ctx.checkout([['P001', 2], ['P005', 1]], { paymentMethod: 'CARD' });
        check(r.status === 201 && r.body.receipt.total === 42, show(r));
        ctx.at(2, `receipt ${r.body.receipt.id}, total 42`);
        const a = await ctx.stock('STORE_001', 'P001'); const b = await ctx.stock('STORE_001', 'P005');
        check(a === 38 && b === 49, `T-Shirt ${a}, Cap ${b}`);
        ctx.at(3, 'T-Shirt 38, Cap 49');
        const n = await storeCount(ctx);
        check(n === 1, `${n} receipts`);
        ctx.saw('1 receipt');
      },
    },
    {
      id: 'TC-06.4-07', ac: 'AC3', type: 'Functional', name: 'Each sold line records a SALE stock movement',
      description: 'The stock card shows one SALE movement per receipt line, with quantity and cashier.',
      pre: need(FRESH_DATA, signedIn('cashier1', 'Checkout'), accounts('manager1'), stock('Downtown', ["Classic T-Shirt", 40], ["Baseball Cap", 50])), preExpect: READY,
      steps: [
        ['Sell Classic T-Shirt x2 and Baseball Cap x1 (Card).', 'Sale completes.'],
        ['As manager1 open Inventory → stock history (stock card) for Downtown.', 'Two new SALE movements: T-Shirt −2 and Cap −1, performed by Cara Chen (cashier1).'],
      ],
      auto: async (ctx) => {
        ctx.at(1);
        const r = await ctx.checkout([['P001', 2], ['P005', 1]], { paymentMethod: 'CARD' });
        check(r.status === 201, show(r));
        ctx.at(2, `receipt ${r.body.receipt.id}`);
        const movs = (await ctx.movements('STORE_001')).filter((m) => m.type === 'SALE');
        const t = movs.find((m) => m.productId === 'P001'); const c = movs.find((m) => m.productId === 'P005');
        check(movs.length === 2 && t && t.quantity === 2 && c && c.quantity === 1 && t.actorId === 'U001', JSON.stringify(movs));
        ctx.saw('SALE T-Shirt 2, SALE Cap 1, by U001');
      },
    },
    {
      id: 'TC-06.4-08', ac: 'AC4', type: 'Negative', name: 'Sale rejected when another till sold the stock first; nothing is deducted',
      description: 'Commit-time stock check: the whole cart is rejected and no line is deducted.',
      pre: need(FRESH_DATA, "Browser A: the user cashier1 (Cashier, Downtown Store) signed in on the Checkout screen.", "Browser B: a second Cashier account cashier1b at Downtown Store (created by admin1 on the Users screen), signed in on the Checkout screen.", accounts('manager1'), stock('Downtown', ["Rain Jacket", 3], ["Classic T-Shirt", 40])), preExpect: READY,
      steps: [
        ['Browser A: add Rain Jacket (0004) x3 and Classic T-Shirt x2, choose Card (do not complete).', 'Cart shows both lines; Rain Jacket shows 3 in stock.'],
        ['Browser B: sell Rain Jacket x1 (Card).', 'Sale B completes; Rain Jacket on-hand becomes 2.'],
        ['Browser A: click Complete checkout.', 'Sale A is rejected (stock changed); no receipt.'],
        ['As manager1 open Inventory and the stock card.', 'Rain Jacket 2, Classic T-Shirt 40; no SALE movement for sale A.'],
      ],
      auto: async (ctx) => {
        await ctx.createUser('cashier1b', 'CASHIER', 'STORE_001');
        ctx.at(1); ctx.saw('cart prepared');
        ctx.at(2);
        const b = await ctx.checkout([['P004', 1]], {}, 'cashier1b');
        check(b.status === 201, show(b));
        ctx.at(3, 'sale B completed, Rain Jacket 2');
        const a = await ctx.checkout([['P004', 3], ['P001', 2]], { paymentMethod: 'CARD' });
        check(a.status === 409, show(a));
        ctx.at(4, show(a));
        const j = await ctx.stock('STORE_001', 'P004'); const t = await ctx.stock('STORE_001', 'P001');
        const sales = (await ctx.movements('STORE_001')).filter((m) => m.type === 'SALE').length;
        check(j === 2 && t === 40 && sales === 1, `Rain Jacket ${j}, T-Shirt ${t}, SALE movements ${sales}`);
        ctx.saw('Rain Jacket 2, T-Shirt 40, only sale B movement');
      },
    },
    {
      id: 'TC-06.4-09', ac: 'AC4', type: 'Functional', name: 'Rejection lists every short line with its remaining stock',
      description: 'The cashier sees all short lines and how many units are left, not just the first one.',
      pre: need(FRESH_DATA, signedIn('cashier1', 'Checkout'), "A second Cashier account cashier1b at Downtown Store (created by admin1 on the Users screen), signed in in a second browser.", stock('Downtown', ["Denim Jeans", 8], ["Rain Jacket", 3])), preExpect: READY,
      steps: [
        ['cashier1: cart Denim Jeans x8 and Rain Jacket x3 (do not complete).', 'Cart accepted (stock 8 and 3).'],
        ['cashier1b: sell Denim Jeans x1 and Rain Jacket x1.', 'Sale completes; stock now 7 and 2.'],
        ['cashier1: click Complete checkout.', 'Rejected; the message lists Denim Jeans (7 left) and Rain Jacket (2 left).'],
      ],
      auto: async (ctx) => {
        await ctx.createUser('cashier1b', 'CASHIER', 'STORE_001');
        ctx.at(1); ctx.saw('cart prepared');
        ctx.at(2);
        await ctx.checkout([['P002', 1], ['P004', 1]], {}, 'cashier1b');
        ctx.at(3, 'Denim 7, Rain Jacket 2');
        const r = await ctx.checkout([['P002', 8], ['P004', 3]]);
        const body = JSON.stringify(r.body || '');
        check(r.status === 409 && /Denim|P002/.test(body) && /Rain|P004/.test(body) && /\b7\b/.test(body) && /\b2\b/.test(body), show(r));
      },
    },
    {
      id: 'TC-06.4-10', ac: 'AC4', type: 'Boundary', name: 'Quantities of the same product on separate lines are added up for the stock check',
      description: 'BR-06 checks the total quantity per product in the cart; stock must never go negative.',
      pre: need(FRESH_DATA, accounts('cashier1', 'manager1'), stock('Downtown', ["Rain Jacket", 3]), API_CLIENT), preExpect: READY,
      steps: [
        ['As cashier1 send POST /api/checkout with two lines {"productId":"P004","quantity":2} and {"productId":"P004","quantity":2} (Rain Jacket stock 3).', 'HTTP 409 — 4 Rain Jackets requested, 3 in stock.'],
        ['As manager1 open Inventory.', 'Rain Jacket on-hand is still 3 (never negative).'],
      ],
      auto: async (ctx) => {
        ctx.at(1);
        const r = await ctx.checkout([['P004', 2], ['P004', 2]]);
        const q = await ctx.stock('STORE_001', 'P004');
        check(r.status === 409, `${show(r)}; Rain Jacket on-hand now ${q}`);
        ctx.at(2, show(r));
        check(q === 3, `Rain Jacket ${q}`);
      },
    },
    {
      id: 'TC-06.4-11', ac: 'AC4', type: 'Integrity', name: 'Two tills completing at the same moment cannot oversell the last units',
      description: 'Concurrency (NFR-05): with 3 Rain Jackets left, at most 3 units are sold.',
      pre: need(FRESH_DATA, accounts('cashier1', 'manager1'), "A second Cashier account cashier1b at Downtown Store (created by admin1 on the Users screen).", stock('Downtown', ["Rain Jacket", 3]), API_CLIENT), preExpect: READY,
      steps: [
        ['Send 6 checkouts of Rain Jacket x1 at the same moment, alternating cashier1 and cashier1b.', 'Exactly 3 succeed (201) and 3 are rejected (409).'],
        ['As manager1 read Inventory and the stock card.', 'Rain Jacket 0 (not negative); exactly 3 SALE movements.'],
      ],
      auto: async (ctx) => {
        await ctx.createUser('cashier1b', 'CASHIER', 'STORE_001');
        await Promise.all(['cashier1', 'cashier1b'].map((u) => ctx.token(u)));
        ctx.at(1);
        const rs = await Promise.all([...Array(6)].map((_, i) => ctx.checkout([['P004', 1]], {}, i % 2 ? 'cashier1b' : 'cashier1')));
        const ok = rs.filter((r) => r.status === 201).length; const no = rs.filter((r) => r.status === 409).length;
        check(ok === 3 && no === 3, `201×${ok}, 409×${no}`);
        ctx.at(2, '201×3, 409×3');
        const q = await ctx.stock('STORE_001', 'P004');
        const m = (await ctx.movements('STORE_001')).filter((x) => x.type === 'SALE').length;
        check(q === 0 && m === 3, `Rain Jacket ${q}, SALE movements ${m}`);
        ctx.saw('Rain Jacket 0, 3 movements');
      },
    },
    {
      id: 'TC-06.4-12', ac: 'AC5', type: 'Integrity', name: 'The same sale sent three times creates one receipt',
      description: 'Retries carrying the same idempotency key return the first receipt instead of creating new ones.',
      pre: need(FRESH_DATA, accounts('cashier1', 'manager1'), stock('Downtown', ["Baseball Cap", 50]), API_CLIENT), preExpect: READY,
      steps: [
        ['As cashier1 send POST /api/checkout {"items":[{"productId":"P005","quantity":1}],"paymentMethod":"CARD","idempotencyKey":"qc-key-1"} three times, one after another.', 'All three responses carry the same receipt.'],
        ['As manager1 read Sales history and Inventory.', 'One receipt; Baseball Cap 50 → 49.'],
      ],
      auto: async (ctx) => {
        ctx.at(1);
        const ids = new Set();
        for (let i = 0; i < 3; i++) ids.add((await ctx.checkout([['P005', 1]], { paymentMethod: 'CARD', idempotencyKey: 'qc-key-1' })).body.receipt.id);
        check(ids.size === 1, `${ids.size} different receipts: ${[...ids].join(', ')}`);
        ctx.at(2, 'same receipt returned');
        const n = await storeCount(ctx); const q = await ctx.stock('STORE_001', 'P005');
        check(n === 1 && q === 49, `${n} receipts, Cap ${q}`);
      },
    },
    {
      id: 'TC-06.4-13', ac: 'AC5', type: 'Integrity', name: 'Duplicate requests arriving in parallel deduct stock once',
      description: 'Same as TC-06.4-12 but the duplicates arrive simultaneously (double click / network retry).',
      pre: need(FRESH_DATA, accounts('cashier1', 'manager1'), stock('Downtown', ["Baseball Cap", 50]), API_CLIENT), preExpect: READY,
      steps: [
        ['Send the same checkout (Baseball Cap x1, idempotencyKey "qc-key-2") three times at the same moment.', 'Requests complete without creating extra receipts.'],
        ['As manager1 read Sales history and Inventory.', 'One receipt; Baseball Cap 49.'],
      ],
      auto: async (ctx) => {
        await ctx.token('cashier1');
        ctx.at(1);
        await Promise.all([1, 2, 3].map(() => ctx.checkout([['P005', 1]], { paymentMethod: 'CARD', idempotencyKey: 'qc-key-2' })));
        ctx.at(2, 'requests answered');
        const n = await storeCount(ctx); const q = await ctx.stock('STORE_001', 'P005');
        check(n === 1 && q === 49, `${n} receipts, Cap ${q}`);
      },
    },
  ],
}];
