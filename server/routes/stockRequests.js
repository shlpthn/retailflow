const express = require('express');
const router = express.Router();
const db = require('../db');
const { requirePermission, requireAnyPermission, hasPermission } = require('../permissions');
const { resolveStoreScope } = require('../middleware/storeScope');

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
// (BA names: Submitted -> In Progress -> Completed, or Rejected / Cancelled — ST-01.)
// Every transition is recorded, never a silent inventory mutation (mistake #15).

const OPEN = ['REQUESTED', 'UNDER_REVIEW', 'APPROVED', 'FULFILLMENT_PENDING'];
const SUBMITTED = ['REQUESTED', 'UNDER_REVIEW'];
// BA status names accepted by ?status= (ST-01) mapped to the stored ones.
const STATUS_FILTER = {
  SUBMITTED, IN_PROGRESS: ['APPROVED', 'FULFILLMENT_PENDING'], COMPLETED: ['COMPLETED'], REJECTED: ['REJECTED'], CANCELLED: ['CANCELLED'],
};
const openOrders = (request) => db.transfers.filter((t) => t.stockRequestId === request.id && ['PENDING_DISPATCH', 'IN_TRANSIT'].includes(t.status));
const reasonOf = (req) => (req.body && typeof req.body.reason === 'string' ? req.body.reason.trim() : '');

router.get(
  '/',
  requireAnyPermission('STOCK_REQUEST_CREATE', 'STOCK_REQUEST_APPROVE'),
  resolveStoreScope,
  (req, res) => {
    const q = req.query;
    let list;
    if (hasPermission(req.user, 'STOCK_REQUEST_APPROVE')) {
      // Head Office Manager: sees everything, optionally filtered by store.
      list = q.storeId ? db.stockRequests.filter((r) => r.storeId === q.storeId) : db.stockRequests;
    } else {
      // Store Manager: only their own store's requests, regardless of query params.
      list = db.stockRequests.filter((r) => r.storeId === req.storeScope.storeId);
    }
    if (q.status) {
      const wanted = String(q.status).split(',').flatMap((s) => STATUS_FILTER[s] || [s]);
      list = list.filter((r) => wanted.includes(r.status));
    }
    if (q.from) list = list.filter((r) => r.createdAt.slice(0, 10) >= q.from);
    if (q.to) list = list.filter((r) => r.createdAt.slice(0, 10) <= q.to);

    if (q.queue === 'true') {
      // HO work queue (US-08.2 AC1): open requests by needed-by date, then oldest first.
      list = list.filter((r) => OPEN.includes(r.status)).sort((a, b) =>
        (a.neededBy || '9999-12-31').localeCompare(b.neededBy || '9999-12-31') || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id, undefined, { numeric: true }));
      return res.json(list.map(enrich));
    }
    res.json(list.map(enrich).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
  }
);

function enrich(r) {
  const product = db.getProduct(r.productId);
  return { ...r, productName: product?.name, storeName: db.getStore(r.storeId)?.name };
}

router.post('/', requirePermission('STOCK_REQUEST_CREATE'), resolveStoreScope, (req, res) => {
  const { productId, quantity, note, neededBy } = req.body || {};
  const qty = positiveWholeQuantity(quantity);
  if (!productId || qty === null) return res.status(400).json({ error: 'productId and positive whole quantity required' });
  const storeId = req.storeScope.storeId; // always the requesting manager's own store
  const product = db.getProduct(productId);
  if (!product) return res.status(404).json({ error: 'Unknown product' });
  if (product.status === 'INACTIVE') return res.status(400).json({ error: `${product.name} is inactive and cannot be requested` });
  if (neededBy && !/^\d{4}-\d{2}-\d{2}$/.test(String(neededBy))) return res.status(400).json({ error: 'neededBy must be yyyy-MM-dd' });

  const now = new Date().toISOString();
  const request = {
    id: db.id('REQ'),
    storeId, productId, quantity: qty, note: note || null,
    neededBy: neededBy || null,
    requestedQty: qty, allocatedQty: 0, receivedQty: 0,
    status: 'REQUESTED',
    requestedBy: req.user.id,
    history: [{ status: 'REQUESTED', at: now, by: req.user.id }],
    fulfillment: null,
    submittedAt: now,
    createdAt: now,
  };
  db.stockRequests.push(request);
  db.notify(null, 'STOCK_REQUEST', `${db.getStore(storeId)?.name} requested ${qty}x ${product.name}`);
  db.logAudit({ user: req.user, action: 'CREATE_STOCK_REQUEST', resource: request.id, storeId, after: request });

  res.status(201).json(enrich(request));
});

function transition(request, status, byUser, extra = {}) {
  request.status = status;
  request.history.push({ status, at: new Date().toISOString(), by: byUser.id, ...extra });
}

// US-08.1 AC5 — the requesting Store Manager cancels a Submitted request with a reason (BR-21).
router.post('/:requestId/cancel', requirePermission('STOCK_REQUEST_CREATE'), (req, res) => {
  const request = db.stockRequests.find((r) => r.id === req.params.requestId);
  if (!request) return res.status(404).json({ error: 'Request not found' });
  if (request.storeId !== req.user.storeId) return res.status(403).json({ error: 'Only the requesting store can cancel this request' });
  if (!SUBMITTED.includes(request.status)) return res.status(409).json({ error: `Cannot cancel a request in status ${request.status}` });
  const reason = reasonOf(req);
  if (!reason) return res.status(400).json({ error: 'A reason is required' });
  const before = request.status;
  transition(request, 'CANCELLED', req.user, { reason });
  request.cancelReason = reason;
  db.logAudit({ user: req.user, action: 'CANCEL_STOCK_REQUEST', resource: request.id, storeId: request.storeId, before: { status: before }, after: { status: request.status, reason } });
  res.json(enrich(request));
});

router.post('/:requestId/reject', requirePermission('STOCK_REQUEST_REJECT'), (req, res) => {
  const request = db.stockRequests.find((r) => r.id === req.params.requestId);
  if (!request) return res.status(404).json({ error: 'Request not found' });
  if (!SUBMITTED.includes(request.status)) {
    return res.status(409).json({ error: `Cannot reject a request in status ${request.status}` });
  }
  const reason = reasonOf(req);
  if (!reason) return res.status(400).json({ error: 'A reason is required to reject a request' });
  const before = request.status;
  transition(request, 'REJECTED', req.user, { reason });
  request.rejectionReason = reason;
  db.notify(request.storeId, 'STOCK_REQUEST_REJECTED', `Request ${request.id} was rejected: ${reason}`);
  db.logAudit({ user: req.user, action: 'REJECT_STOCK_REQUEST', resource: request.id, storeId: request.storeId, before: { status: before }, after: { status: request.status } });
  res.json(enrich(request));
});

// US-08.2 AC2 — per other Active store: on-hand, minimum level and transferable quantity.
router.get('/:requestId/availability', requirePermission('STOCK_REQUEST_APPROVE'), (req, res) => {
  const request = db.stockRequests.find((r) => r.id === req.params.requestId);
  if (!request) return res.status(404).json({ error: 'Request not found' });
  const rows = db.getAllStores().filter((s) => s.id !== request.storeId && s.status !== 'INACTIVE').map((s) => {
    const row = db.getInventoryRow(s.id, request.productId) || { quantity: 0, threshold: 0 };
    return { storeId: s.id, storeName: s.name, onHand: row.quantity, minLevel: row.threshold, transferable: Math.max(0, row.quantity - row.threshold) };
  }).sort((a, b) => b.transferable - a.transferable || b.onHand - a.onHand);
  res.json({ requestId: request.id, productId: request.productId, productName: db.getProduct(request.productId)?.name, requested: request.quantity, stores: rows });
});

// Head Office Manager approves AND decides the fulfillment source in one step
// (Section 17): either an inter-store TRANSFER or a FACTORY order. A request whose
// previous order was cancelled or reported unfulfillable can be allocated again.
router.post('/:requestId/approve', requirePermission('STOCK_REQUEST_APPROVE'), (req, res) => {
  const request = db.stockRequests.find((r) => r.id === req.params.requestId);
  if (!request) return res.status(404).json({ error: 'Request not found' });
  const reallocation = request.status === 'FULFILLMENT_PENDING' && openOrders(request).length === 0 && (request.allocatedQty || 0) === 0;
  if (!SUBMITTED.includes(request.status) && !reallocation) {
    return res.status(409).json({ error: `Cannot approve a request in status ${request.status}` });
  }
  const { fulfillmentType, sourceStoreId } = req.body || {};
  if (!['TRANSFER', 'FACTORY'].includes(fulfillmentType)) {
    return res.status(400).json({ error: 'fulfillmentType must be TRANSFER or FACTORY' });
  }

  let warning = null;
  if (fulfillmentType === 'TRANSFER') {
    if (!sourceStoreId) return res.status(400).json({ error: 'sourceStoreId required for a transfer' });
    if (sourceStoreId === request.storeId) return res.status(400).json({ error: 'Source store cannot equal destination store' });
    if (!db.getStore(sourceStoreId)) return res.status(404).json({ error: 'Source store not found' });
    const sourceRow = db.getInventoryRow(sourceStoreId, request.productId);
    if (!sourceRow || sourceRow.quantity < request.quantity) {
      return res.status(409).json({ error: 'Source store does not have enough stock for this transfer' });
    }
    const left = sourceRow.quantity - request.quantity;
    if (left < sourceRow.threshold) {
      warning = `${db.getStore(sourceStoreId).name} will be left with ${left}, below its minimum level of ${sourceRow.threshold}`;
    }
  }

  if (!reallocation) transition(request, 'APPROVED', req.user);
  const now = new Date().toISOString();

  if (fulfillmentType === 'TRANSFER') {
    const transfer = {
      id: db.id('XFER'),
      stockRequestId: request.id,
      productId: request.productId,
      quantity: request.quantity,
      sourceStoreId,
      destinationStoreId: request.storeId,
      status: 'PENDING_DISPATCH',
      issuedBy: req.user.id,
      issuedAt: now,
      createdAt: now,
    };
    db.transfers.push(transfer);
    request.fulfillment = { type: 'TRANSFER', sourceStoreId, transferId: transfer.id };
    request.allocatedQty = request.quantity;
    transition(request, 'FULFILLMENT_PENDING', req.user, { orderId: transfer.id, step: 'ORDER_ISSUED' });
    db.notify(sourceStoreId, 'TRANSFER_REQUEST', `Dispatch ${transfer.quantity}x ${db.getProduct(transfer.productId).name} to ${db.getStore(request.storeId).name}`);
  } else {
    const order = {
      id: db.id('PO'),
      stockRequestId: request.id,
      productId: request.productId,
      quantity: request.quantity,
      destinationStoreId: request.storeId,
      status: 'ORDERED',
      createdAt: now,
    };
    db.factoryOrders.push(order);
    request.fulfillment = { type: 'FACTORY', factoryOrderId: order.id };
    request.allocatedQty = request.quantity;
    transition(request, 'FULFILLMENT_PENDING', req.user);
  }

  db.logAudit({ user: req.user, action: 'APPROVE_STOCK_REQUEST', resource: request.id, storeId: request.storeId, after: request.fulfillment });
  res.json({ ...enrich(request), warning });
});

// US-08.7 — HO closes an In Progress request that has no open order, recording the shortfall (BR-22).
router.post('/:requestId/close', requirePermission('STOCK_REQUEST_APPROVE'), (req, res) => {
  const request = db.stockRequests.find((r) => r.id === req.params.requestId);
  if (!request) return res.status(404).json({ error: 'Request not found' });
  if (!['APPROVED', 'FULFILLMENT_PENDING'].includes(request.status)) return res.status(409).json({ error: `Cannot close a request in status ${request.status}` });
  if (openOrders(request).length) return res.status(409).json({ error: 'The request still has an issued or in-transit order' });
  const reason = reasonOf(req);
  if (!reason) return res.status(400).json({ error: 'A reason is required' });
  request.shortfall = Math.max(0, request.quantity - (request.receivedQty || 0));
  request.closeReason = reason;
  request.closedBy = req.user.id;
  transition(request, 'COMPLETED', req.user, { reason, shortfall: request.shortfall });
  db.notify(request.storeId, 'STOCK_REQUEST_CLOSED', `Request ${request.id} was closed with a shortfall of ${request.shortfall}: ${reason}`);
  db.logAudit({ user: req.user, action: 'CLOSE_STOCK_REQUEST', resource: request.id, storeId: request.storeId, after: { status: request.status, shortfall: request.shortfall, reason } });
  res.json(enrich(request));
});

module.exports = router;
