const express = require('express');
const router = express.Router();
const db = require('../db');
const { requirePermission } = require('../permissions');
const { resolveStoreScope } = require('../middleware/storeScope');

// This entire router is exclusive to CHECKOUT_VIEW/CHECKOUT_CREATE, which by
// default only Cashier holds (Section 2 — "exclusive to the Cashier role").

router.get('/products', requirePermission('CHECKOUT_VIEW'), resolveStoreScope, (req, res) => {
  const storeId = req.storeScope.storeId;
  const items = db.getAllProducts().map((p) => {
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
  const today = new Date().toISOString().slice(0, 10);
  const active = db.promotions.filter((p) => p.active && p.validFrom <= today && today <= p.validTo);
  res.json(active);
});

function positiveWholeQuantity(value) {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? value : null;
  if (typeof value === 'string' && /^[0-9]+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}
function findValidPromotion(code, storeId) {
  if (!code) return null;
  const today = new Date().toISOString().slice(0, 10);
  const promo = db.promotions.find((p) => p.code === code);
  if (!promo || !promo.active) return null;
  if (promo.validFrom > today || today > promo.validTo) return null;
  if (promo.applicableStoreIds && !promo.applicableStoreIds.includes(storeId)) return null;
  return promo;
}

function normalizeRecommendationContext(value) {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { modelVersion, strategy, fallback, suggestedProductIds } = value;
  if (typeof modelVersion !== 'string' || modelVersion.length < 1 || modelVersion.length > 120) return null;
  if (strategy !== 'user-based-knn' && strategy !== 'popularity') return null;
  if (typeof fallback !== 'boolean' || !Array.isArray(suggestedProductIds) || suggestedProductIds.length > 50) return null;
  if (!suggestedProductIds.every((id) => typeof id === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(id))) return null;
  return {
    modelVersion,
    strategy,
    fallback,
    suggestedProductIds: [...new Set(suggestedProductIds)],
  };
}

router.post('/', requirePermission('CHECKOUT_CREATE'), resolveStoreScope, (req, res) => {
  const { items, promotionCode, paymentMethod, customerId, recommendationContext } = req.body || {};
  const storeId = req.storeScope.storeId; // cashier's own store only — never client-selectable
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Cart is empty' });
  if (!paymentMethod) return res.status(400).json({ error: 'paymentMethod required' });
  const normalizedCustomerId = typeof customerId === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(customerId.trim()) ? customerId.trim() : null;
  const normalizedRecommendationContext = normalizeRecommendationContext(recommendationContext);
  if (recommendationContext !== undefined && normalizedRecommendationContext === null) {
    return res.status(400).json({ error: 'Invalid recommendationContext' });
  }

  // Validate stock availability for every line before mutating anything.
  const resolved = [];
  for (const line of items) {
    const product = db.getProduct(line.productId);
    if (!product) return res.status(404).json({ error: `Unknown product ${line.productId}` });
    const qty = positiveWholeQuantity(line.quantity);
    if (qty === null) return res.status(400).json({ error: 'Invalid whole quantity' });
    const row = db.getInventoryRow(storeId, line.productId);
    if (!row || row.quantity < qty) {
      return res.status(409).json({ error: `Insufficient stock for ${product.name}` });
    }
    resolved.push({ product, qty, row });
  }

  const subtotal = resolved.reduce((sum, l) => sum + l.product.price * l.qty, 0);
  const promo = findValidPromotion(promotionCode, storeId);
  const discount = promo ? (promo.type === 'PERCENT' ? subtotal * (promo.value / 100) : promo.value) : 0;
  const total = Math.max(0, subtotal - discount);

  // Commit: decrement inventory, record movements, record the sale.
  for (const l of resolved) {
    l.row.quantity -= l.qty;
    db.stockMovements.push({
      id: db.id('MOV'), storeId, productId: l.product.id, type: 'SALE', quantity: l.qty,
      actorId: req.user.id, note: 'checkout', createdAt: new Date().toISOString(),
    });
  }

  const sale = {
    id: db.id('SALE'),
    storeId,
    cashierId: req.user.id,
    cashierName: req.user.name,
    items: resolved.map((l) => ({ productId: l.product.id, name: l.product.name, quantity: l.qty, unitPrice: l.product.price })),
    subtotal, discount, total,
    promotionCode: promo ? promo.code : null,
    customerId: normalizedCustomerId,
    recommendationContext: normalizedRecommendationContext,
    paymentMethod,
    createdAt: new Date().toISOString(),
  };
  db.sales.push(sale);

  db.logAudit({
    user: req.user, action: 'CHECKOUT_SALE', resource: sale.id, storeId,
    after: { total: sale.total, items: sale.items.length },
  });
  // Persist the completed sale before acknowledging checkout. This protects the
  // transaction from an immediate process restart after the response is sent.
  db.maybeFlush();

  res.status(201).json({ receipt: sale });
});

module.exports = router;
