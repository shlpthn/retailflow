const express = require('express');
const router = express.Router();
const db = require('../db');
const { requirePermission } = require('../permissions');
const { resolveStoreScope } = require('../middleware/storeScope');
const { statusOf, effectiveByCode } = require('../promotionRules');

// This entire router is exclusive to CHECKOUT_VIEW/CHECKOUT_CREATE, which by
// default only Cashier holds (Section 2 — "exclusive to the Cashier role").

const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER_QR', 'CARD']; // BA D-01 / FR-POS-05

router.get('/products', requirePermission('CHECKOUT_VIEW'), resolveStoreScope, (req, res) => {
  const storeId = req.storeScope.storeId;
  const items = db.getAllProducts().filter((p) => p.status !== 'INACTIVE').map((p) => {
    const r = storeId ? db.getInventoryRow(storeId, p.id) : null;
    return {
      productId: p.id,
      name: p.name,
      image: p.image,
      barcode: p.barcode,
      price: p.price,
      available: r ? r.quantity : 0,
    };
  });
  res.json(items);
});

router.get('/promotions', requirePermission('CHECKOUT_VIEW'), (req, res) => {
  const now = Date.now();
  res.json(db.promotions.filter((p) => statusOf(p, now) === 'ACTIVE').map((p) => ({ ...p, status: 'ACTIVE' })));
});

function positiveWholeQuantity(value) {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? value : null;
  if (typeof value === 'string' && /^[0-9]+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

/** Receipt number <store code>-<yyyyMMdd>-<6-digit sequence per store and day> (FR-POS-08). */
function nextReceiptNo(storeId, at) {
  const day = at.slice(0, 10).replace(/-/g, '');
  const prefix = `${storeId}-${day}-`;
  const seq = db.sales.filter((s) => s.receiptNo && s.receiptNo.startsWith(prefix)).length + 1;
  return prefix + String(seq).padStart(6, '0');
}

router.post('/', requirePermission('CHECKOUT_CREATE'), resolveStoreScope, (req, res) => {
  const { items, promotionCode, paymentMethod, customerId, amountTendered, idempotencyKey, expectedTotal } = req.body || {};
  const storeId = req.storeScope.storeId; // cashier's own store only — never client-selectable

  // A retried request (same idempotency key) returns the receipt created the first time (BR-07, FR-POS-07).
  if (idempotencyKey) {
    const existing = db.sales.find((s) => s.idempotencyKey === String(idempotencyKey) && s.cashierId === req.user.id);
    if (existing) return res.status(200).json({ receipt: existing, duplicate: true });
  }

  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Cart is empty' });
  if (!PAYMENT_METHODS.includes(paymentMethod)) {
    return res.status(400).json({ error: `paymentMethod must be one of ${PAYMENT_METHODS.join(', ')}` });
  }
  const normalizedCustomerId = typeof customerId === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(customerId.trim()) ? customerId.trim() : null;

  // Validate every line, adding up quantities per product before the stock check (BR-06).
  const byProduct = new Map();
  for (const line of items) {
    const product = db.getProduct(line.productId);
    if (!product) return res.status(404).json({ error: `Unknown product ${line.productId}` });
    if (product.status === 'INACTIVE') return res.status(400).json({ error: `${product.name} is inactive and cannot be sold` });
    const qty = positiveWholeQuantity(line.quantity);
    if (qty === null) return res.status(400).json({ error: 'Invalid whole quantity' });
    const entry = byProduct.get(product.id) || { product, qty: 0 };
    entry.qty += qty;
    byProduct.set(product.id, entry);
  }
  const resolved = [...byProduct.values()].map((l) => ({ ...l, row: db.getInventoryRow(storeId, l.product.id) }));
  const short = resolved.filter((l) => !l.row || l.row.quantity < l.qty);
  if (short.length) {
    const shortLines = short.map((l) => ({ productId: l.product.id, name: l.product.name, requested: l.qty, available: l.row ? l.row.quantity : 0 }));
    return res.status(409).json({
      error: `Insufficient stock: ${shortLines.map((s) => `${s.name} (${s.available} left)`).join(', ')}`,
      shortLines,
    });
  }

  // Promotion evaluated at payment time; discount = Σ floor(line amount × % / 100) (BR-17).
  const now = new Date();
  const promo = effectiveByCode(db.promotions, promotionCode, now.getTime());
  const pct = promo ? (promo.discountPercent ?? promo.value) : 0;
  const lines = resolved.map((l) => {
    const lineSubtotal = l.product.price * l.qty;
    const lineDiscount = promo ? (promo.type === 'FIXED' ? 0 : Math.floor((lineSubtotal * pct) / 100)) : 0;
    return { productId: l.product.id, name: l.product.name, quantity: l.qty, unitPrice: l.product.price, lineSubtotal, lineDiscount, lineTotal: lineSubtotal - lineDiscount };
  });
  const subtotal = lines.reduce((sum, l) => sum + l.lineSubtotal, 0);
  let discount = lines.reduce((sum, l) => sum + l.lineDiscount, 0);
  if (promo && promo.type === 'FIXED') discount = Math.min(subtotal, promo.value); // legacy fixed promotions
  const total = Math.max(0, subtotal - discount);

  // The cashier confirmed a total; if the server's figure differs (e.g. the promotion ended), ask again (US-09.3 AC2).
  if (expectedTotal !== undefined && expectedTotal !== null && Number(expectedTotal) !== total) {
    return res.status(409).json({ error: `The total changed from ${expectedTotal} to ${total}; please confirm again`, totalChanged: true, total, previousTotal: Number(expectedTotal) });
  }

  // Cash: the amount tendered must cover the total; the change is recorded (US-06.4 AC2).
  let tendered = null; let change = null;
  if (paymentMethod === 'CASH' && amountTendered !== undefined && amountTendered !== null && amountTendered !== '') {
    tendered = Number(amountTendered);
    if (!Number.isFinite(tendered) || tendered < 0) return res.status(400).json({ error: 'Invalid amount tendered' });
    if (tendered < total) return res.status(400).json({ error: `Amount tendered ${tendered} is less than the total ${total}` });
    change = tendered - total;
  }

  // Commit: decrement inventory, record movements, record the sale.
  const createdAt = now.toISOString();
  for (const l of resolved) {
    l.row.quantity -= l.qty;
    db.stockMovements.push({
      id: db.id('MOV'), storeId, productId: l.product.id, type: 'SALE', quantity: l.qty,
      actorId: req.user.id, note: 'checkout', createdAt,
    });
  }

  const sale = {
    id: db.id('SALE'),
    receiptNo: nextReceiptNo(storeId, createdAt),
    storeId,
    cashierId: req.user.id,
    cashierName: req.user.name,
    items: lines,
    subtotal, discount, total,
    promotionId: promo ? promo.id : null,
    promotionCode: promo ? promo.code : null,
    promotionName: promo ? promo.name : null,
    promotionPercent: promo && promo.type !== 'FIXED' ? pct : null,
    customerId: normalizedCustomerId,
    paymentMethod,
    amountTendered: tendered,
    change,
    idempotencyKey: idempotencyKey ? String(idempotencyKey) : null,
    createdAt,
  };
  db.sales.push(sale);

  db.logAudit({
    user: req.user, action: 'CHECKOUT_SALE', resource: sale.id, storeId,
    after: { receiptNo: sale.receiptNo, total: sale.total, items: sale.items.length },
  });
  // Persist the completed sale before acknowledging checkout. This protects the
  // transaction from an immediate process restart after the response is sent.
  db.maybeFlush();

  res.status(201).json({ receipt: sale });
});

module.exports = router;
