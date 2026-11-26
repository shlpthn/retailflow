'use strict';
// PBI RF-09 — Promotions · Sprint 5 (Tasks 47 / 73)
const { check, show, sleep } = require('../lib/harness');
const {
  need, FRESH_DATA, signedIn, accounts, stock, API_CLIENT, PROMO_ON, PROMO_OFF, READY, history, receiptsOf, PROMO, DAY, at, isoDay, createPromo, endEarly, promoById, sellWithCode,
} = require('./common');

const S = { pbi: 'RF-09', sprint: 'S5', backlog: 'RF-09' };
const SEED = PROMO.seed;
const receipt = async (ctx, id) => (await receiptsOf(ctx, 'STORE_001')).find((s) => s.id === id);
const listCount = async (ctx) => ((await ctx.as('ho1').get(PROMO.list)).body || []).length;

module.exports = [
  // ============================================================== US-09.1
  {
    ...S, id: 'US-09.1', name: 'Create promotion',
    story: 'As an HO Manager, I want to create a percentage discount on all products for a period to drive chain-wide sales.',
    acs: [
      { id: 'AC1', text: 'Given a name, discount 1–100 % and start < end, when saving, the promotion is Scheduled (or Active if the start time has passed).', rules: 'BR-16, D-02, FR-PRM-01, FR-PRM-03, ST-04' },
      { id: 'AC2', text: 'Given the period overlaps another Scheduled / Active promotion, when saving, an error names the conflicting promotion.', rules: 'BR-16, D-02, FR-PRM-02' },
      { id: 'AC3', text: 'Given an end time in the past, when saving, an error is shown.', rules: 'FR-PRM-01' },
    ],
    cases: [
      {
        id: 'TC-09.1-01', ac: 'AC1', type: 'Functional', name: 'Promotion starting in the future is created as Scheduled',
        description: 'Status on creation when the start is ahead.', pre: need(FRESH_DATA, signedIn('ho1', 'Promotions'), PROMO_OFF), preExpect: READY,
        steps: [['Click New promotion: name "QC Winter", discount 20 %, start in 30 days, end in 40 days; save.', 'Promotion saved with status Scheduled.']],
        auto: async (ctx) => {
          await endEarly(ctx, SEED.id);
          ctx.at(1);
          const r = await createPromo(ctx, { name: 'QC Winter', percent: 20, from: 30, to: 40 });
          check(r.status === 201 && r.body.status === 'SCHEDULED', `HTTP ${r.status}, status ${JSON.stringify(r.body.status)} (only active=${r.body.active})`);
        },
      },
      {
        id: 'TC-09.1-02', ac: 'AC1', type: 'Functional', name: 'Promotion whose start time has passed is created as Active',
        description: 'Status on creation when the start is already reached.', pre: need(FRESH_DATA, signedIn('ho1', 'Promotions'), PROMO_OFF), preExpect: READY,
        steps: [['New promotion: 15 %, start 1 hour ago, end in 5 days; save.', 'Promotion saved with status Active.']],
        auto: async (ctx) => {
          await endEarly(ctx, SEED.id);
          ctx.at(1);
          const r = await createPromo(ctx, { startAt: at(-3600000), endAt: at(5 * DAY) });
          check(r.status === 201 && r.body.status === 'ACTIVE', `HTTP ${r.status}, status ${JSON.stringify(r.body.status)}`);
        },
      },
      {
        id: 'TC-09.1-03', ac: 'AC1', type: 'Boundary', name: 'Discounts of exactly 1 % and 100 % are accepted',
        description: 'Both ends of the allowed range.', pre: need(FRESH_DATA, signedIn('ho1', 'Promotions'), PROMO_OFF), preExpect: READY,
        steps: [['Create a 1 % promotion for days +20 … +21.', 'Saved.'], ['Create a 100 % promotion for days +22 … +23.', 'Saved.']],
        auto: async (ctx) => {
          await endEarly(ctx, SEED.id);
          ctx.at(1); const a = await createPromo(ctx, { percent: 1, from: 20, to: 21 }); check(a.status === 201, show(a));
          ctx.at(2, '1 % saved'); const b = await createPromo(ctx, { percent: 100, from: 22, to: 23 }); check(b.status === 201, show(b));
        },
      },
      {
        id: 'TC-09.1-04', ac: 'AC1', type: 'Negative', name: 'Discount outside 1–100 or not a whole number is rejected',
        description: 'Invalid percentages.', pre: need(FRESH_DATA, signedIn('ho1', 'Promotions'), PROMO_OFF), preExpect: READY,
        steps: [
          ['Try to save promotions (each on its own future window) with discount 0, then 101.', 'Both refused with a validation message.'],
          ['Try discount −5, 12.5 and "abc".', 'All refused.'],
          ['Open the promotion list.', 'None of them was saved.'],
        ],
        auto: async (ctx) => {
          await endEarly(ctx, SEED.id); const n0 = await listCount(ctx); let w = 20;
          ctx.at(1);
          const a = []; for (const v of [0, 101]) { a.push((await createPromo(ctx, { percent: v, from: w, to: w + 1 })).status); w += 2; }
          check(a.every((s) => s === 400), `0 → ${a[0]}, 101 → ${a[1]} (saved)`);
          ctx.at(2, '400, 400');
          const b = []; for (const v of [-5, 12.5, 'abc']) { b.push((await createPromo(ctx, { percent: v, from: w, to: w + 1 })).status); w += 2; }
          check(b.every((s) => s === 400), `−5 → ${b[0]}, 12.5 → ${b[1]}, "abc" → ${b[2]}`);
          ctx.at(3, 'all 400'); const n = await listCount(ctx); check(n === n0, `${n - n0} saved`);
        },
      },
      {
        id: 'TC-09.1-05', ac: 'AC1', type: 'Negative', name: 'Start must be before end',
        description: 'Start after end and start equal to end are both invalid.', pre: need(FRESH_DATA, signedIn('ho1', 'Promotions'), PROMO_OFF), preExpect: READY,
        steps: [['Save a promotion with start in 10 days and end in 5 days.', 'Refused.'], ['Save a promotion whose start equals its end.', 'Refused.']],
        auto: async (ctx) => {
          await endEarly(ctx, SEED.id);
          ctx.at(1); const a = await createPromo(ctx, { from: 10, to: 5 }); check(a.status === 400, show(a));
          ctx.at(2, '400'); const t = at(10 * DAY); const b = await createPromo(ctx, { startAt: t, endAt: t }); check(b.status === 400, show(b));
        },
      },
      {
        id: 'TC-09.1-06', ac: 'AC2', type: 'Negative', name: 'Overlapping the active promotion is rejected and names it',
        description: 'Only one promotion may be effective at a time (D-02).', pre: need(FRESH_DATA, signedIn('ho1', 'Promotions'), PROMO_ON), preExpect: READY,
        steps: [['Save a 20 % promotion for days +5 … +15 (inside "Autumn 10% Off").', 'Refused; the message names "Autumn 10% Off".']],
        auto: async (ctx) => {
          ctx.at(1);
          const r = await createPromo(ctx, { percent: 20, from: 5, to: 15 });
          check([400, 409].includes(r.status) && JSON.stringify(r.body).includes(SEED.name), show(r));
        },
      },
      {
        id: 'TC-09.1-07', ac: 'AC2', type: 'Negative', name: 'Overlapping a Scheduled promotion is rejected at either edge or inside it',
        description: 'Partial overlaps count as overlaps.', pre: need(FRESH_DATA, signedIn('ho1', 'Promotions'), PROMO_OFF), preExpect: READY,
        steps: [
          ['Save promotion A for days +20 … +30.', 'Saved (Scheduled).'],
          ['Save B for +15 … +21, C for +29 … +35 and D for +22 … +25.', 'B, C and D are each refused, naming A.'],
        ],
        auto: async (ctx) => {
          await endEarly(ctx, SEED.id);
          ctx.at(1); const a = await createPromo(ctx, { name: 'QC A', from: 20, to: 30 }); check(a.status === 201, show(a));
          ctx.at(2, 'A saved');
          const st = []; for (const [f, t] of [[15, 21], [29, 35], [22, 25]]) st.push((await createPromo(ctx, { from: f, to: t })).status);
          check(st.every((s) => [400, 409].includes(s)), `B ${st[0]}, C ${st[1]}, D ${st[2]} (saved)`);
        },
      },
      {
        id: 'TC-09.1-08', ac: 'AC2', type: 'Boundary', name: 'Back-to-back promotions and periods of ended promotions are allowed',
        description: 'Non-overlapping periods, and Expired/Inactive promotions do not block.', pre: need(FRESH_DATA, signedIn('ho1', 'Promotions'), PROMO_OFF), preExpect: READY,
        steps: [
          ['Save A for +20 … +25 and B starting right after A ends, until +30.', 'Both saved.'],
          ['Save a 15 % promotion from 1 hour ago to +10 days (inside the period of the ended "Autumn 10% Off").', 'Saved.'],
        ],
        auto: async (ctx) => {
          await endEarly(ctx, SEED.id);
          ctx.at(1); const aEnd = Date.now() + 25 * DAY;
          const a = await createPromo(ctx, { startAt: at(20 * DAY), endAt: new Date(aEnd).toISOString() });
          const b = await createPromo(ctx, { startAt: new Date(aEnd + 1).toISOString(), endAt: at(30 * DAY) });
          check(a.status === 201 && b.status === 201, `${a.status}, ${b.status}`);
          ctx.at(2, 'both saved'); const c = await createPromo(ctx, { startAt: at(-3600000), endAt: at(10 * DAY) }); check(c.status === 201, show(c));
        },
      },
      {
        id: 'TC-09.1-09', ac: 'AC3', type: 'Negative', name: 'End time in the past is rejected',
        description: 'A promotion that is already over cannot be created.', pre: need(FRESH_DATA, signedIn('ho1', 'Promotions'), PROMO_OFF), preExpect: READY,
        steps: [['Save a promotion from 10 days ago to 2 days ago.', 'Refused with a message about the end time.']],
        auto: async (ctx) => {
          await endEarly(ctx, SEED.id);
          ctx.at(1); const r = await createPromo(ctx, { from: -10, to: -2 }); check(r.status === 400, show(r));
        },
      },
      {
        id: 'TC-09.1-10', ac: 'AC1', type: 'Negative', name: 'Only a percentage on all products can be created',
        description: 'D-02 / OI-07: no fixed amounts, no product or store scoping.', pre: need(FRESH_DATA, accounts('ho1'), PROMO_OFF, API_CLIENT), preExpect: READY,
        steps: [
          ['As ho1 send POST /api/promotions with type "FIXED" and value 5.', 'Refused (400).'],
          ['Send a percentage promotion limited to product P001, then one limited to store STORE_002.', 'Both refused (400).'],
        ],
        auto: async (ctx) => {
          await endEarly(ctx, SEED.id);
          ctx.at(1); const a = await createPromo(ctx, { from: 20, to: 21, extra: { type: 'FIXED', value: 5 } }); check(a.status === 400, show(a));
          ctx.at(2, '400');
          const b = await createPromo(ctx, { from: 22, to: 23, extra: { applicableProductIds: ['P001'] } }); const c = await createPromo(ctx, { from: 24, to: 25, extra: { applicableStoreIds: ['STORE_002'] } });
          check(b.status === 400 && c.status === 400, `product-scoped ${b.status}, store-scoped ${c.status}`);
        },
      },
      {
        id: 'TC-09.1-11', ac: 'AC1', type: 'Security', name: 'Only the HO Manager can create, edit or end promotions',
        description: '§2.2 PROMOTION_MANAGE.', pre: need(FRESH_DATA, accounts('cashier1', 'inventory1', 'manager1', 'admin1'), PROMO_ON, API_CLIENT), preExpect: READY,
        steps: [['As cashier1, inventory1, manager1 and admin1: POST /api/promotions, PUT /api/promotions/PROMO001 {"value":99} and end it early.', 'HTTP 403 for every call; "Autumn 10% Off" unchanged (10 %).']],
        auto: async (ctx) => {
          ctx.at(1); const st = [];
          for (const u of ['cashier1', 'inventory1', 'manager1', 'admin1']) {
            st.push((await createPromo(ctx, { from: 50, to: 51 }, u)).status, (await ctx.as(u).put(`${PROMO.list}/${SEED.id}`, { value: 99 })).status);
            const e = (await ctx.as(u).post(PROMO.endEarly(SEED.id), {})).status; st.push(e === 404 ? 403 : e);
          }
          const p = await promoById(ctx, SEED.id);
          check(st.every((s) => s === 403) && p.value === 10, `${st.join(', ')}; value ${p.value}`);
        },
      },
      {
        id: 'TC-09.1-12', ac: 'AC1', type: 'Functional', name: 'Status moves automatically from Scheduled to Active to Expired',
        description: 'FR-PRM-03 time-based transitions.', pre: need(FRESH_DATA, signedIn('ho1', 'Promotions'), accounts('cashier1'), PROMO_OFF, stock('Downtown', ["Classic T-Shirt", 40])), preExpect: READY,
        steps: [
          ['Create a 15 % promotion starting in 2 seconds and ending in 5 seconds.', 'Status Scheduled.'],
          ['After 3 seconds refresh the list; sell T-Shirt x1 as cashier1.', 'Status Active; the sale gets discount 2 (floor of 2.25).'],
          ['After 3 more seconds refresh; sell T-Shirt x1 again.', 'Status Expired; no discount.'],
        ],
        auto: async (ctx) => {
          await endEarly(ctx, SEED.id);
          ctx.at(1); const c = (await createPromo(ctx, { startAt: at(2000), endAt: at(5000) })).body; check(c.status === 'SCHEDULED', `status ${JSON.stringify(c.status)}`);
          ctx.at(2, 'Scheduled'); await sleep(3000);
          const s1 = (await sellWithCode(ctx, [['P001', 1]], c.code)).body.receipt; const st1 = (await promoById(ctx, c.id)).status;
          check(st1 === 'ACTIVE' && s1.discount === 2, `status ${JSON.stringify(st1)}, discount ${s1.discount}`);
          ctx.at(3, 'Active, discount 2'); await sleep(3000);
          const s2 = (await sellWithCode(ctx, [['P001', 1]], c.code)).body.receipt; const st2 = (await promoById(ctx, c.id)).status;
          check(st2 === 'EXPIRED' && s2.discount === 0, `status ${JSON.stringify(st2)}, discount ${s2.discount}`);
        },
      },
    ],
  },

  // ============================================================== US-09.2
  {
    ...S, id: 'US-09.2', name: 'Edit / end promotion early',
    story: 'As an HO Manager, I want to adjust or stop a promotion when plans change.',
    acs: [
      { id: 'AC1', text: 'Scheduled promotions can be fully edited (overlap is still checked).', rules: 'BR-16' },
      { id: 'AC2', text: 'Active promotions can only be "Ended early" → Inactive; the percentage cannot change so receipts under the same promotion stay consistent.', rules: 'BR-17, ST-04, FR-PRM-03' },
      { id: 'AC3', text: 'Expired / Inactive promotions are read-only.', rules: 'ST-04, BR-18' },
    ],
    cases: [
      {
        id: 'TC-09.2-01', ac: 'AC1', type: 'Functional', name: 'A Scheduled promotion can be fully edited',
        description: 'Name, percentage and dates are editable before the start.', pre: need(FRESH_DATA, signedIn('ho1', 'Promotions'), PROMO_OFF, "A Scheduled promotion \"QC Spring\", 20 %, running from day +20 to day +30."), preExpect: READY,
        steps: [['Edit "QC Spring": name "QC edited", 25 %, days +21 … +31; save.', 'Saved; the list shows the new values and status Scheduled.']],
        auto: async (ctx) => {
          await endEarly(ctx, SEED.id); const c = (await createPromo(ctx, { name: 'QC Spring', percent: 20, from: 20, to: 30 })).body;
          ctx.at(1);
          const s = at(21 * DAY); const e = at(31 * DAY);
          const r = await ctx.as('ho1').put(`${PROMO.list}/${c.id}`, { name: 'QC edited', value: 25, discountPercent: 25, startAt: s, endAt: e, validFrom: s.slice(0, 10), validTo: e.slice(0, 10) });
          const p = await promoById(ctx, c.id);
          check(r.status === 200 && p.name === 'QC edited' && (p.discountPercent === 25 || p.value === 25), `${show(r)}; stored ${p.name} ${p.value} %`);
        },
      },
      {
        id: 'TC-09.2-02', ac: 'AC1', type: 'Negative', name: 'Editing a Scheduled promotion into another one\'s period is rejected',
        description: 'Overlap is re-checked on edit.', pre: need(FRESH_DATA, signedIn('ho1', 'Promotions'), PROMO_OFF, "Two Scheduled promotions: A from day +20 to day +25 and B from day +30 to day +35."), preExpect: READY,
        steps: [['Edit B to start on day +24.', 'Refused, naming A; B keeps its original dates.']],
        auto: async (ctx) => {
          await endEarly(ctx, SEED.id); await createPromo(ctx, { name: 'QC A', from: 20, to: 25 }); const b = (await createPromo(ctx, { name: 'QC B', from: 30, to: 35 })).body;
          ctx.at(1);
          const s = at(24 * DAY); const r = await ctx.as('ho1').put(`${PROMO.list}/${b.id}`, { startAt: s, validFrom: s.slice(0, 10) });
          const after = await promoById(ctx, b.id);
          check([400, 409].includes(r.status) && after.validFrom === b.validFrom, `${show(r)}; B start ${b.validFrom} → ${after.validFrom}`);
        },
      },
      {
        id: 'TC-09.2-03', ac: 'AC2', type: 'Functional', name: 'Ending an Active promotion early makes it Inactive and stops it at checkout',
        description: 'The "End early" action.', pre: need(FRESH_DATA, "Browser 1: the user ho1 (Head Office Manager) signed in on the Promotions screen.", "Browser 2: the user cashier1 (Cashier, Downtown Store) signed in on the Checkout screen.", PROMO_ON, stock('Downtown', ["Running Sneakers", 22])), preExpect: READY,
        steps: [
          ['As ho1 click End early on "Autumn 10% Off" and confirm.', 'Status Inactive.'],
          ['As cashier1 sell Running Sneakers x1 (enter SAVE10 if the screen asks for a code).', 'No discount: total 65.'],
        ],
        auto: async (ctx) => {
          ctx.at(1);
          const r = await ctx.as('ho1').post(PROMO.endEarly(SEED.id), {});
          const p = await promoById(ctx, SEED.id);
          check(r.status === 200 && p.status === 'INACTIVE', `End early: ${show(r)}; status ${JSON.stringify(p.status)}`);
          ctx.at(2, 'Inactive');
          const s = (await sellWithCode(ctx, [['P003', 1]], SEED.code)).body.receipt; check(s.discount === 0 && s.total === 65, `${s.discount}/${s.total}`);
        },
      },
      {
        id: 'TC-09.2-04', ac: 'AC2', type: 'Negative', name: 'The percentage of an Active promotion cannot be changed',
        description: 'Keeps receipts under one promotion consistent.', pre: need(FRESH_DATA, signedIn('ho1', 'Promotions'), PROMO_ON), preExpect: READY,
        steps: [['Edit "Autumn 10% Off" and change the discount to 50 %; save.', 'Refused; the promotion stays at 10 %.']],
        auto: async (ctx) => {
          ctx.at(1);
          const r = await ctx.as('ho1').put(`${PROMO.list}/${SEED.id}`, { value: 50, discountPercent: 50 }); const p = await promoById(ctx, SEED.id);
          check([400, 409].includes(r.status) && p.value === 10, `HTTP ${r.status}; stored ${p.value} %`);
        },
      },
      {
        id: 'TC-09.2-05', ac: 'AC3', type: 'Negative', name: 'An ended promotion is read-only',
        description: 'Inactive / Expired promotions cannot be edited or re-activated.', pre: need(FRESH_DATA, signedIn('ho1', 'Promotions'), PROMO_OFF), preExpect: READY,
        steps: [['Try to edit its name to "Revived", discount 30 % and re-activate it.', 'Refused; name, percentage and status unchanged.']],
        auto: async (ctx) => {
          await endEarly(ctx, SEED.id);
          ctx.at(1);
          const r = await ctx.as('ho1').put(`${PROMO.list}/${SEED.id}`, { name: 'Revived', value: 30, active: true, status: 'ACTIVE' }); const p = await promoById(ctx, SEED.id);
          check([400, 409].includes(r.status) && p.name === SEED.name, `HTTP ${r.status}; now "${p.name}", ${p.value} %, active ${p.active}`);
        },
      },
      {
        id: 'TC-09.2-06', ac: 'AC3', type: 'Negative', name: 'A promotion used on receipts cannot be deleted',
        description: 'Receipts reference the promotion; it must remain on record.', pre: need(FRESH_DATA, signedIn('ho1', 'Promotions'), PROMO_ON, "A completed sale by cashier1 of 1 pair of Running Sneakers using code SAVE10."), preExpect: READY,
        steps: [['As ho1 try to delete "Autumn 10% Off".', 'Refused; the promotion is still listed.']],
        auto: async (ctx) => {
          await sellWithCode(ctx, [['P003', 1]], SEED.code);
          ctx.at(1);
          const r = await ctx.as('ho1').del(`${PROMO.list}/${SEED.id}`); const p = await promoById(ctx, SEED.id);
          check(r.status >= 400 && !!p, `${show(r)}; still listed ${!!p}`);
        },
      },
    ],
  },

  // ============================================================== US-09.3
  {
    ...S, id: 'US-09.3', name: 'Apply promotion automatically at POS',
    story: 'As a Cashier, I want valid promotions applied automatically so that customers pay the right price without manual calculation.',
    acs: [
      { id: 'AC1', text: 'Given an Active promotion at payment time, each line\'s discount = floor(line amount × % / 100); the cart shows the promotion name and total discount.', rules: 'BR-17, FR-PRM-04, D-02' },
      { id: 'AC2', text: 'Given the promotion expires while the cart is open, when completing, the server recalculates at commit time and tells the cashier the total changed before re-confirming.', rules: 'BR-17, FR-POS-04' },
      { id: 'AC3', text: 'The receipt stores the promotion code, % and per-line discount; editing / ending the promotion later does not change past receipts.', rules: 'BR-17, BR-05, §7.3 SALE / SALE_LINE' },
      { id: 'AC4', text: 'No Active promotion → no discount; cashiers cannot enter manual discounts.', rules: 'BR-17, D-02' },
    ],
    cases: [
      {
        id: 'TC-09.3-01', retired: 'Automatic promotion without a code changes every sale total in the catalog and the POS screen (BUG-033).', ac: 'AC1', type: 'Functional', name: 'The active promotion is applied automatically without a code',
        description: 'No code entry: the active promotion applies on its own.', pre: need(FRESH_DATA, signedIn('cashier1', 'Checkout'), PROMO_OFF, "An Active 15 % promotion created by ho1, running from one hour ago to five days from now.", stock('Downtown', ["Classic T-Shirt", 40], ["Running Sneakers", 22])), preExpect: READY,
        steps: [['As cashier1 add T-Shirt x1 and Sneakers x1 without entering any code; complete the sale.', 'Cart shows the promotion name and discount 11 (2 + 9); total 69.']],
        auto: async (ctx) => {
          await endEarly(ctx, SEED.id); await createPromo(ctx, { startAt: at(-3600000), endAt: at(5 * DAY) });
          ctx.at(1);
          const s = (await ctx.checkout([['P001', 1], ['P003', 1]])).body.receipt;
          check(s.discount === 11 && s.total === 69, `discount ${s.discount}, total ${s.total} (promotion ${s.promotionCode})`);
        },
      },
      {
        id: 'TC-09.3-02', ac: 'AC1', type: 'Boundary', name: 'Discount is the sum of line discounts rounded down per line',
        description: 'floor per line, not a percentage of the subtotal; amounts are whole VND.', pre: need(FRESH_DATA, signedIn('cashier1', 'Checkout'), PROMO_OFF, "An Active 15 % promotion created by ho1, running from one hour ago to five days from now.", stock('Downtown', ["Classic T-Shirt", 40], ["Running Sneakers", 22])), preExpect: READY,
        steps: [['Sell T-Shirt x1 (15) and Sneakers x1 (65) under the 15 % promotion (enter its code if the screen requires one).', 'Line discounts 2 (2.25 rounded down) and 9 (9.75 rounded down): discount 11, total 69 — not 12 / 68.']],
        auto: async (ctx) => {
          await endEarly(ctx, SEED.id); const c = (await createPromo(ctx, { startAt: at(-3600000), endAt: at(5 * DAY) })).body;
          ctx.at(1);
          const s = (await sellWithCode(ctx, [['P001', 1], ['P003', 1]], c.code)).body.receipt;
          check(s.discount === 11 && s.total === 69, `discount ${s.discount}, total ${s.total}`);
        },
      },
      {
        id: 'TC-09.3-03', ac: 'AC1', type: 'Functional', name: 'The promotion applies to every product at every store',
        description: 'Chain-wide, all products (D-02).', pre: need(FRESH_DATA, signedIn('cashier1', 'Checkout'), "An Uptown Cashier account cashier2, created by admin1.", PROMO_ON, "All five demo products in stock at Downtown Store, and Denim Jeans in stock at Uptown Store."), preExpect: READY,
        steps: [
          ['As cashier1 sell one of each of the 5 products under "Autumn 10% Off".', 'Every line is discounted: 1 + 4 + 6 + 8 + 1 = 20.'],
          ['As cashier2 (Uptown) sell Denim Jeans x1.', 'Discount 4.'],
        ],
        auto: async (ctx) => {
          await ctx.createUser('cashier2', 'CASHIER', 'STORE_002');
          ctx.at(1); const a = (await sellWithCode(ctx, [['P001', 1], ['P002', 1], ['P003', 1], ['P004', 1], ['P005', 1]], SEED.code)).body.receipt;
          check(a.discount === 20, `discount ${a.discount}`);
          ctx.at(2, '20'); const b = (await sellWithCode(ctx, [['P002', 1]], SEED.code, {}, 'cashier2')).body.receipt; check(b.discount === 4, `discount ${b.discount}`);
        },
      },
      {
        id: 'TC-09.3-04', ac: 'AC2', type: 'Functional', name: 'Promotion ended while the cart is open: cashier is told the new total and re-confirms',
        description: 'Commit-time recalculation with explicit re-confirmation.', pre: need(FRESH_DATA, "Browser 1: the user cashier1 (Cashier, Downtown Store) signed in on the Checkout screen.", "Browser 2: the user ho1 (Head Office Manager) signed in on the Promotions screen.", PROMO_ON, stock('Downtown', ["Running Sneakers", 22])), preExpect: READY,
        steps: [
          ['As cashier1 add Sneakers x1; the cart shows "Autumn 10% Off" and total 59.', 'Total 59 is displayed.'],
          ['As ho1 end "Autumn 10% Off" early.', 'Promotion Inactive.'],
          ['As cashier1 click Complete checkout.', 'The sale is not completed yet; the screen says the total changed from 59 to 65 and asks to re-confirm. Stock unchanged.'],
          ['Re-confirm.', 'Sale completed with no discount, total 65.'],
        ],
        notes: 'API contract assumed by QC: the client sends expectedTotal; the server answers 409 with the new total when it differs.',
        auto: async (ctx) => {
          ctx.at(1); await ctx.as('cashier1').get('/api/checkout/promotions'); ctx.saw('cart total 59');
          ctx.at(2); await endEarly(ctx, SEED.id);
          ctx.at(3, 'ended');
          const a = await sellWithCode(ctx, [['P003', 1]], SEED.code, { expectedTotal: 59 }); const st = await ctx.stock('STORE_001', 'P003');
          check(a.status === 409 && st === 22, `${show(a)}; Sneakers ${st} — completed without telling the cashier`);
          ctx.at(4, '409 total changed');
          const b = await sellWithCode(ctx, [['P003', 1]], SEED.code, { expectedTotal: 65 }); check(b.status === 201 && b.body.receipt.total === 65, show(b));
        },
      },
      {
        id: 'TC-09.3-05', ac: 'AC2', type: 'Boundary', name: 'Promotion reaching its end time while the cart is open is not applied',
        description: 'Validity is checked against the payment time (BR-17: start ≤ payment ≤ end).', pre: need(FRESH_DATA, signedIn('cashier1', 'Checkout'), PROMO_OFF, "A 15 % promotion created by ho1 that ends 3 seconds after the test starts.", stock('Downtown', ["Running Sneakers", 22])), preExpect: READY,
        steps: [
          ['As cashier1 add Sneakers x1; the cart shows the 15 % discount.', 'Discount displayed.'],
          ['Wait until the end time has passed (4 seconds) and complete the sale.', 'No discount is applied: total 65.'],
        ],
        auto: async (ctx) => {
          await endEarly(ctx, SEED.id); const c = (await createPromo(ctx, { startAt: at(-3600000), endAt: at(3000) })).body;
          ctx.at(1); await ctx.as('cashier1').get('/api/checkout/promotions'); ctx.saw('discount displayed');
          ctx.at(2); await sleep(4000);
          const s = (await sellWithCode(ctx, [['P003', 1]], c.code)).body.receipt;
          check(s.discount === 0 && s.total === 65, `discount ${s.discount}, total ${s.total} — still applied after its end time`);
        },
      },
      {
        id: 'TC-09.3-06', ac: 'AC3', type: 'Functional', name: 'Receipt stores the promotion code, percentage and per-line discount',
        description: 'Promotion snapshot on the receipt.', pre: need(FRESH_DATA, accounts('cashier1'), PROMO_ON, stock('Downtown', ["Classic T-Shirt", 40], ["Running Sneakers", 22])), preExpect: READY,
        steps: [
          ['As cashier1 sell T-Shirt x1 and Sneakers x1 under "Autumn 10% Off".', 'Sale completes.'],
          ['Open the receipt from Sales history.', 'Shows code SAVE10, 10 %, and line discounts 1 (T-Shirt) and 6 (Sneakers).'],
        ],
        auto: async (ctx) => {
          ctx.at(1); const id = (await sellWithCode(ctx, [['P001', 1], ['P003', 1]], SEED.code)).body.receipt.id;
          ctx.at(2, `receipt ${id}`);
          const s = await receipt(ctx, id);
          const pct = s.promotionPercent ?? (s.promotion && s.promotion.percent); const lines = s.items.map((l) => l.lineDiscount ?? l.discount);
          const miss = [];
          if (!s.promotionCode) miss.push('code');
          if (pct !== 10) miss.push(`percentage (${pct ?? 'none'})`);
          if (JSON.stringify(lines) !== '[1,6]') miss.push(`line discounts (${JSON.stringify(lines)})`);
          check(miss.length === 0, 'receipt lacks ' + miss.join(', '));
        },
      },
      {
        id: 'TC-09.3-07', ac: 'AC3', type: 'Integrity', name: 'Editing a promotion does not change receipts issued under it',
        description: 'Snapshot stability after an edit.', pre: need(FRESH_DATA, accounts('cashier1', 'ho1'), PROMO_ON, "Two completed sales under \"Autumn 10% Off\": 1 pair of Running Sneakers, and 2 Classic T-Shirts."), preExpect: READY,
        steps: [
          ['Open both receipts and note discount, total and promotion details.', 'Values noted.'],
          ['As ho1 edit the promotion: new name, 25 %, earlier end date.', 'Edit saved (or refused for an Active promotion).'],
          ['Re-open both receipts.', 'Both receipts are identical to the noted values.'],
        ],
        auto: async (ctx) => {
          const a = (await sellWithCode(ctx, [['P003', 1]], SEED.code)).body.receipt.id; const b = (await sellWithCode(ctx, [['P001', 2]], SEED.code)).body.receipt.id;
          ctx.at(1); const before = JSON.stringify([await receipt(ctx, a), await receipt(ctx, b)]);
          ctx.at(2, 'noted'); await ctx.as('ho1').put(`${PROMO.list}/${SEED.id}`, { name: 'QC Edited', value: 25, discountPercent: 25, validTo: isoDay(3) });
          ctx.at(3); const after = JSON.stringify([await receipt(ctx, a), await receipt(ctx, b)]);
          check(before === after, 'receipts changed after the edit');
          ctx.saw('identical');
        },
      },
      {
        id: 'TC-09.3-08', ac: 'AC3', type: 'Integrity', name: 'Ending a promotion and restarting do not change receipts issued under it',
        description: 'Snapshot stability after end-early and a restart.', pre: need(FRESH_DATA, accounts('ho1'), PROMO_ON, "A completed sale of 1 pair of Running Sneakers under \"Autumn 10% Off\"."), preExpect: READY,
        steps: [
          ['Open the receipt and note its values.', 'Values noted.'],
          ['As ho1 end the promotion early, then re-open the receipt.', 'Receipt unchanged.'],
          ['Restart the application and re-open the receipt.', 'Receipt unchanged.'],
        ],
        auto: async (ctx) => {
          const id = (await sellWithCode(ctx, [['P003', 1]], SEED.code)).body.receipt.id;
          ctx.at(1); const before = JSON.stringify(await receipt(ctx, id));
          ctx.at(2, 'noted'); await endEarly(ctx, SEED.id); check(JSON.stringify(await receipt(ctx, id)) === before, 'receipt changed after end-early');
          ctx.at(3, 'unchanged'); await ctx.restart(); ctx.tokens = {}; check(JSON.stringify(await receipt(ctx, id)) === before, 'receipt changed after restart');
          ctx.saw('unchanged');
        },
      },
      {
        id: 'TC-09.3-09', ac: 'AC4', type: 'Negative', name: 'No discount when no promotion is active (Scheduled ones included)',
        description: 'Only an Active promotion gives a discount.', pre: need(FRESH_DATA, signedIn('cashier1', 'Checkout'), accounts('ho1'), PROMO_OFF, stock('Downtown', ["Running Sneakers", 22])), preExpect: READY,
        steps: [
          ['As cashier1 sell Sneakers x1.', 'No discount: total 65.'],
          ['As ho1 create a 20 % promotion starting in 5 days; as cashier1 sell Sneakers x1 again (enter its code if the screen asks).', 'Still no discount: total 65.'],
        ],
        auto: async (ctx) => {
          await endEarly(ctx, SEED.id);
          ctx.at(1); const a = (await sellWithCode(ctx, [['P003', 1]], SEED.code)).body.receipt; check(a.discount === 0 && a.total === 65, `${a.discount}/${a.total}`);
          ctx.at(2, '0 / 65'); const c = (await createPromo(ctx, { percent: 20, from: 5, to: 10 })).body;
          const b = (await sellWithCode(ctx, [['P003', 1]], c.code)).body.receipt; check(b.discount === 0 && b.total === 65, `${b.discount}/${b.total}`);
          ctx.saw('0 / 65');
        },
      },
      {
        id: 'TC-09.3-10', ac: 'AC4', type: 'Security', name: 'Cashiers cannot enter manual discounts',
        description: 'Discounts come only from the active promotion.', pre: need(FRESH_DATA, signedIn('cashier1', 'Checkout'), PROMO_OFF, API_CLIENT), preExpect: READY,
        steps: [
          ['On Checkout look for any manual discount or price override control.', 'None exists.'],
          ['As cashier1 send POST /api/checkout for Sneakers x1 with "discount":30,"total":1 and a made-up code "FAKE50".', 'Receipt has discount 0 and total 65.'],
        ],
        auto: async (ctx) => {
          await endEarly(ctx, SEED.id);
          ctx.at(1); ctx.saw('UI check');
          ctx.at(2); const s = (await sellWithCode(ctx, [['P003', 1]], 'FAKE50', { discount: 30, total: 1, discountPercent: 50 })).body.receipt;
          check(s.discount === 0 && s.total === 65, `${s.discount}/${s.total}`);
        },
      },
    ],
  },
];
