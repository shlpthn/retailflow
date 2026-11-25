const express = require('express');
const router = express.Router();
const db = require('../db');
const { requirePermission, requireAnyPermission, hasPermission } = require('../permissions');
const { resolveStoreScope, assertStoreAccess } = require('../middleware/storeScope');

function positiveWholeQuantity(value) {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? value : null;
  if (typeof value === 'string' && /^[0-9]+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

// Section 7 lifecycle: REQUESTED -> UNDER_REVIEW -> APPROVED/REJECTED
// -> FULFILLMENT_PENDING -> DISPATCHED -> IN_TRANSIT -> RECEIVED -> COMPLETED
// Every transition is recorded, never a silent inventory mutation (mistake #15).

router.get(
  '/',
  requireAnyPermission('STOCK_REQUEST_CREATE', 'STOCK_REQUEST_APPROVE'),
  resolveStoreScope,
  (req, res) => {
    let list;
    if (hasPermission(req.user, 'STOCK_REQUEST_APPROVE')) {
      // Head Office Manager: sees everything, optionally filtered by store.
      const filterStoreId = req.query.storeId || null;
      list = filterStoreId ? db.stockRequests.filter((r) => r.storeId === filterStoreId) : db.stockRequests;
    } else {
      // Store Manager: only their own store's requests, regardless of query params.
      list = db.stockRequests.filter((r) => r.storeId === req.storeScope.storeId);
    }
    res.json(list.map(enrich).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
  }
);

function enrich(r) {
  const product = db.getProduct(r.productId);
  return { ...r, productName: product?.name, storeName: db.getStore(r.storeId)?.name };
}

router.post('/', requirePermission('STOCK_REQUEST_CREATE'), resolveStoreScope, (req, res) => {
  const { productId, quantity, note } = req.body || {};
  const qty = positiveWholeQuantity(quantity);
  if (!productId || qty === null) return res.status(400).json({ error: 'productId and positive whole quantity required' });
  const storeId = req.storeScope.storeId; // always the requesting manager's own store
  if (!db.getProduct(productId)) return res.status(404).json({ error: 'Unknown product' });

  const request = {
    id: db.id('REQ'),
    storeId, productId, quantity: qty, note: note || null,
    status: 'REQUESTED',
    requestedBy: req.user.id,
    history: [{ status: 'REQUESTED', at: new Date().toISOString(), by: req.user.id }],
    fulfillment: null,
    createdAt: new Date().toISOString(),
  };
  db.stockRequests.push(request);
  db.notify(null, 'STOCK_REQUEST', `${db.getStore(storeId)?.name} requested ${qty}x ${db.getProduct(productId).name}`);
  db.logAudit({ user: req.user, action: 'CREATE_STOCK_REQUEST', resource: request.id, storeId, after: request });

  res.status(201).json(enrich(request));
});

function transition(request, status, byUser) {
  request.status = status;
  request.history.push({ status, at: new Date().toISOString(), by: byUser.id });
}

router.post('/:requestId/reject', requirePermission('STOCK_REQUEST_REJECT'), (req, res) => {
  const request = db.stockRequests.find((r) => r.id === req.params.requestId);
  if (!request) return res.status(404).json({ error: 'Request not found' });
  if (!['REQUESTED', 'UNDER_REVIEW'].includes(request.status)) {
    return res.status(409).json({ error: `Cannot reject a request in status ${request.status}` });
  }
  const before = request.status;
  transition(request, 'REJECTED', req.user);
  request.rejectionReason = (req.body && req.body.reason) || null;
  db.logAudit({ user: req.user, action: 'REJECT_STOCK_REQUEST', resource: request.id, storeId: request.storeId, before: { status: before }, after: { status: request.status } });
  res.json(enrich(request));
});

// Head Office Manager approves AND decides the fulfillment source in one step
// (Section 17): either an inter-store TRANSFER or a FACTORY order.
router.post('/:requestId/approve', requirePermission('STOCK_REQUEST_APPROVE'), (req, res) => {
  const request = db.stockRequests.find((r) => r.id === req.params.requestId);
  if (!request) return res.status(404).json({ error: 'Request not found' });
  if (!['REQUESTED', 'UNDER_REVIEW'].includes(request.status)) {
    return res.status(409).json({ error: `Cannot approve a request in status ${request.status}` });
  }
  const { fulfillmentType, sourceStoreId } = req.body || {};
  if (!['TRANSFER', 'FACTORY'].includes(fulfillmentType)) {
    return res.status(400).json({ error: 'fulfillmentType must be TRANSFER or FACTORY' });
  }

  if (fulfillmentType === 'TRANSFER') {
    if (!sourceStoreId) return res.status(400).json({ error: 'sourceStoreId required for a transfer' });
    if (sourceStoreId === request.storeId) return res.status(400).json({ error: 'Source store cannot equal destination store' });
    if (!db.getStore(sourceStoreId)) return res.status(404).json({ error: 'Source store not found' });
    const sourceRow = db.getInventoryRow(sourceStoreId, request.productId);
    if (!sourceRow || sourceRow.quantity < request.quantity) {
      return res.status(409).json({ error: 'Source store does not have enough stock for this transfer' });
    }
  }

  transition(request, 'APPROVED', req.user);

  if (fulfillmentType === 'TRANSFER') {
    const sourceRow = db.getInventoryRow(sourceStoreId, request.productId);
    const transfer = {
      id: db.id('XFER'),
      stockRequestId: request.id,
      productId: request.productId,
      quantity: request.quantity,
      sourceStoreId,
      destinationStoreId: request.storeId,
      status: 'PENDING_DISPATCH',
      createdAt: new Date().toISOString(),
    };
    db.transfers.push(transfer);
    request.fulfillment = { type: 'TRANSFER', sourceStoreId, transferId: transfer.id };
    transition(request, 'FULFILLMENT_PENDING', req.user);
    db.notify(sourceStoreId, 'TRANSFER_REQUEST', `Dispatch ${transfer.quantity}x ${db.getProduct(transfer.productId).name} to ${db.getStore(request.storeId).name}`);
  } else {
    const order = {
      id: db.id('PO'),
      stockRequestId: request.id,
      productId: request.productId,
      quantity: request.quantity,
      destinationStoreId: request.storeId,
      status: 'ORDERED',
      createdAt: new Date().toISOString(),
    };
    db.factoryOrders.push(order);
    request.fulfillment = { type: 'FACTORY', factoryOrderId: order.id };
    transition(request, 'FULFILLMENT_PENDING', req.user);
  }

  db.logAudit({ user: req.user, action: 'APPROVE_STOCK_REQUEST', resource: request.id, storeId: request.storeId, after: request.fulfillment });
  res.json(enrich(request));
});

module.exports = router;
