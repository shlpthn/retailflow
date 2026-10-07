const express = require('express');
const router = express.Router();
const db = require('../db');
const { requirePermission } = require('../permissions');
const { resolveStoreScope, assertStoreAccess, effectiveStoreId } = require('../middleware/storeScope');

function positiveWholeQuantity(value) {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? value : null;
  if (typeof value === 'string' && /^[0-9]+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

// ============================================================================
// ONE inventory page, shared by Inventory Staff / Store Manager / Head Office
// Manager (Section 8, 27). What differs is which ACTIONS the permission set
// unlocks, not the page itself. The frontend renders "Add Stock" / "Dispatch
// Stock" / "Request Stock" buttons purely based on req.user.permissions
// returned from /auth/me — but the buttons are cosmetic. Every action below
// is independently permission-checked here, so hiding a button front-end
// never substitutes for the real enforcement.
// ============================================================================

router.get('/', requirePermission('INVENTORY_VIEW'), resolveStoreScope, (req, res) => {
  const storeId = req.query.storeId
    ? (assertStoreAccess(req, res, req.query.storeId) ? req.query.storeId : null)
    : effectiveStoreId(req);
  if (storeId === null && res.headersSent) return; // assertStoreAccess already responded 403/404

  for (const product of db.products) {
    if (!db.getInventoryRow(storeId, product.id)) {
      db.inventory.push({ storeId, productId: product.id, quantity: 0, threshold: 10 });
    }
  }

  const rows = db.getInventoryForStore(storeId).map((row) => {
    const product = db.getProduct(row.productId);
    return {
      storeId: row.storeId,
      productId: row.productId,
      name: product?.name,
      image: product?.image,
      barcode: product?.barcode,
      quantity: row.quantity,
      threshold: row.threshold,
      status: row.quantity === 0 ? 'OUT_OF_STOCK' : row.quantity <= row.threshold ? 'LOW_STOCK' : 'OK',
    };
  });

  const lowStock = rows.filter((r) => r.status !== 'OK');
  const pendingTransfersIn = db.transfers.filter(
    (t) => t.destinationStoreId === storeId && ['DISPATCHED', 'IN_TRANSIT'].includes(t.status)
  );
  const pendingRequests = db.stockRequests.filter(
    (r) => r.storeId === storeId && ['REQUESTED', 'UNDER_REVIEW', 'APPROVED', 'FULFILLMENT_PENDING'].includes(r.status)
  );

  res.json({
    storeId,
    storeName: db.getStore(storeId)?.name,
    rows,
    activityPanel: {
      lowStockAlerts: lowStock,
      incomingTransfers: pendingTransfersIn,
      pendingRequests,
    },
  });
});

/**
 * GET /api/inventory/restock-history (alias: /api/inventory/restocks)
 * Fetches the restock history (which product was restocked, how much, when, by whom)
 * for a store.
 * Supports query parameters:
 *   - storeId: target store (for roles with organization scope, e.g. Head Office Manager)
 *   - limit: maximum number of records to return (default 20, max 100)
 *   - productId: filter by a specific product
 */
const handleRestockHistory = (req, res) => {
  const storeId = req.query.storeId
    ? (assertStoreAccess(req, res, req.query.storeId) ? req.query.storeId : null)
    : effectiveStoreId(req);
  if (storeId === null && res.headersSent) return;
  if (!assertStoreAccess(req, res, storeId)) return;

  const RESTOCK_TYPES = new Set(['RECEIVE', 'TRANSFER_IN']);
  const matching = db.stockMovements.filter((m) => {
    if (m.storeId !== storeId) return false;
    if (!RESTOCK_TYPES.has(m.type)) return false;
    if (req.query.productId && m.productId !== req.query.productId) return false;
    return true;
  });

  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const sorted = [...matching].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const paged = sorted.slice(0, limit);

  const restocks = paged.map((m) => {
    const product = db.getProduct(m.productId);
    const actor = db.getUserById(m.actorId);
    return {
      id: m.id,
      storeId: m.storeId,
      productId: m.productId,
      productName: product?.name || m.productId,
      productBarcode: product?.barcode || null,
      productImage: product?.image || null,
      quantity: m.quantity,
      type: m.type,
      note: m.note || null,
      actorId: m.actorId,
      actorName: actor?.name || actor?.username || 'system',
      createdAt: m.createdAt,
    };
  });

  res.json({
    storeId,
    storeName: db.getStore(storeId)?.name || storeId,
    totalCount: matching.length,
    limit,
    restocks,
    history: restocks,
  });
};

router.get('/restock-history', requirePermission('INVENTORY_VIEW'), resolveStoreScope, handleRestockHistory);
router.get('/restocks', requirePermission('INVENTORY_VIEW'), resolveStoreScope, handleRestockHistory);

router.get('/movements', requirePermission('INVENTORY_VIEW'), resolveStoreScope, (req, res) => {
  const storeId = effectiveStoreId(req);
  const movements = db.stockMovements
    .filter((m) => m.storeId === storeId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(movements);
});

// Inventory Staff only, and always their OWN store — barcode-based Add Stock workflow.
router.post('/add-stock', requirePermission('INVENTORY_RECEIVE'), resolveStoreScope, (req, res) => {
  const { productId, quantity, note } = req.body || {};
  const qty = positiveWholeQuantity(quantity);
  if (!productId || qty === null) return res.status(400).json({ error: 'productId and positive whole quantity required' });
  const storeId = req.storeScope.storeId; // forced to the authenticated user's store
  if (!assertStoreAccess(req, res, storeId)) return;

  const product = db.getProduct(productId);
  if (!product) return res.status(404).json({ error: 'Unknown product/barcode' });

  let row = db.getInventoryRow(storeId, productId);
  if (!row) { row = { storeId, productId, quantity: 0, threshold: 10 }; db.inventory.push(row); }
  const before = row.quantity;
  row.quantity += qty;

  db.stockMovements.push({
    id: db.id('MOV'), storeId, productId, type: 'RECEIVE', quantity: qty,
    actorId: req.user.id, note: note || null, createdAt: new Date().toISOString(),
  });
  db.logAudit({
    user: req.user, action: 'ADD_STOCK', resource: `${storeId}/${productId}`, storeId,
    before: { quantity: before }, after: { quantity: row.quantity },
  });

  res.json({ storeId, productId, quantity: row.quantity, product });
});

// Inventory Staff only, and always their OWN store — barcode-based Dispatch Stock workflow.
router.post('/dispatch-stock', requirePermission('INVENTORY_DISPATCH'), resolveStoreScope, (req, res) => {
  const { productId, quantity, destinationStoreId, note } = req.body || {};
  const qty = positiveWholeQuantity(quantity);
  if (!productId || qty === null) return res.status(400).json({ error: 'productId and positive whole quantity required' });
  const storeId = req.storeScope.storeId;
  if (!assertStoreAccess(req, res, storeId)) return;

  const row = db.getInventoryRow(storeId, productId);
  if (!row || row.quantity < qty) {
    return res.status(409).json({ error: 'Insufficient stock to dispatch that quantity' });
  }
  const before = row.quantity;
  row.quantity -= qty;

  db.stockMovements.push({
    id: db.id('MOV'), storeId, productId, type: 'DISPATCH', quantity: qty,
    actorId: req.user.id, note: destinationStoreId ? `to ${destinationStoreId}` : (note || null),
    createdAt: new Date().toISOString(),
  });
  db.logAudit({
    user: req.user, action: 'DISPATCH_STOCK', resource: `${storeId}/${productId}`, storeId,
    before: { quantity: before }, after: { quantity: row.quantity, destinationStoreId: destinationStoreId || null },
  });

  res.json({ storeId, productId, quantity: row.quantity });
});

module.exports = router;
