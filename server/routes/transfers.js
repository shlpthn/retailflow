const express = require('express');
const router = express.Router();
const db = require('../db');
const { requirePermission, requireAnyPermission, hasPermission } = require('../permissions');
const { resolveStoreScope } = require('../middleware/storeScope');

const requestOf = (transfer) => db.stockRequests.find((r) => r.id === transfer.stockRequestId);

function enrichTransfer(t) {
  return {
    ...t,
    productName: db.getProduct(t.productId)?.name,
    sourceStoreName: db.getStore(t.sourceStoreId)?.name,
    destinationStoreName: db.getStore(t.destinationStoreId)?.name,
  };
}

router.get('/', requireAnyPermission('INVENTORY_VIEW', 'STOCK_REQUEST_APPROVE'), resolveStoreScope, (req, res) => {
  let list = db.transfers;
  if (req.storeScope.type === 'SINGLE') {
    const sid = req.storeScope.storeId;
    list = list.filter((t) => t.sourceStoreId === sid || t.destinationStoreId === sid);
  }
  res.json(list.map(enrichTransfer).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

// Inventory Staff at the SOURCE store dispatches the transfer (Section 17 diagram).
router.post('/:transferId/dispatch', requirePermission('TRANSFER_DISPATCH'), resolveStoreScope, (req, res) => {
  const transfer = db.transfers.find((t) => t.id === req.params.transferId);
  if (!transfer) return res.status(404).json({ error: 'Transfer not found' });
  if (transfer.status !== 'PENDING_DISPATCH') return res.status(409).json({ error: `Cannot dispatch a transfer in status ${transfer.status}` });
  if (req.storeScope.type === 'SINGLE' && req.storeScope.storeId !== transfer.sourceStoreId) {
    return res.status(403).json({ error: 'Only the source store can dispatch this transfer' });
  }

  const row = db.getInventoryRow(transfer.sourceStoreId, transfer.productId);
  if (!row || row.quantity < transfer.quantity) return res.status(409).json({ error: 'Insufficient stock at source store' });
  row.quantity -= transfer.quantity;

  db.stockMovements.push({
    id: db.id('MOV'), storeId: transfer.sourceStoreId, productId: transfer.productId, type: 'TRANSFER_OUT',
    quantity: transfer.quantity, actorId: req.user.id, note: `to ${transfer.destinationStoreId}`, createdAt: new Date().toISOString(),
  });
  transfer.status = 'IN_TRANSIT';
  transfer.dispatchedBy = req.user.id;
  transfer.dispatchedAt = new Date().toISOString();
  const request = requestOf(transfer);
  if (request) request.history.push({ status: 'DISPATCHED', at: transfer.dispatchedAt, by: req.user.id, orderId: transfer.id });
  db.logAudit({ user: req.user, action: 'DISPATCH_TRANSFER', resource: transfer.id, storeId: transfer.sourceStoreId });
  db.notify(transfer.destinationStoreId, 'TRANSFER_IN_TRANSIT', `${transfer.quantity}x ${db.getProduct(transfer.productId).name} is on the way`);

  res.json(enrichTransfer(transfer));
});

// Inventory Staff at the DESTINATION store receives the transfer.
router.post('/:transferId/receive', requirePermission('TRANSFER_RECEIVE'), resolveStoreScope, (req, res) => {
  const transfer = db.transfers.find((t) => t.id === req.params.transferId);
  if (!transfer) return res.status(404).json({ error: 'Transfer not found' });
  if (transfer.status !== 'IN_TRANSIT') return res.status(409).json({ error: `Cannot receive a transfer in status ${transfer.status}` });
  if (req.storeScope.type === 'SINGLE' && req.storeScope.storeId !== transfer.destinationStoreId) {
    return res.status(403).json({ error: 'Only the destination store can receive this transfer' });
  }

  let row = db.getInventoryRow(transfer.destinationStoreId, transfer.productId);
  if (!row) { row = { storeId: transfer.destinationStoreId, productId: transfer.productId, quantity: 0, threshold: 0 }; db.inventory.push(row); }
  row.quantity += transfer.quantity;

  db.stockMovements.push({
    id: db.id('MOV'), storeId: transfer.destinationStoreId, productId: transfer.productId, type: 'TRANSFER_IN',
    quantity: transfer.quantity, actorId: req.user.id, note: `from ${transfer.sourceStoreId}`, createdAt: new Date().toISOString(),
  });
  transfer.status = 'COMPLETED';
  transfer.receivedBy = req.user.id;
  transfer.receivedAt = new Date().toISOString();

  const request = requestOf(transfer);
  if (request) {
    request.receivedQty = (request.receivedQty || 0) + transfer.quantity;
    request.history.push({ status: 'RECEIVED', at: transfer.receivedAt, by: req.user.id, orderId: transfer.id });
    if (request.receivedQty >= request.quantity) { // BR-22: complete once everything requested has arrived
      request.status = 'COMPLETED';
      request.history.push({ status: 'COMPLETED', at: transfer.receivedAt, by: req.user.id });
    }
  }

  db.logAudit({ user: req.user, action: 'RECEIVE_TRANSFER', resource: transfer.id, storeId: transfer.destinationStoreId });
  res.json(enrichTransfer(transfer));
});

// The order's quantity goes back to its request, which stays In Progress for HO to reallocate (ST-01).
function releaseToRequest(transfer, user, status, reason) {
  const request = requestOf(transfer);
  if (!request) return;
  request.allocatedQty = Math.max(0, (request.allocatedQty || 0) - transfer.quantity);
  request.history.push({ status, at: new Date().toISOString(), by: user.id, orderId: transfer.id, reason });
}

// US-08.3 AC5 — HO cancels an Issued order with a reason (BR-21).
router.post('/:transferId/cancel', requirePermission('STOCK_REQUEST_APPROVE'), (req, res) => {
  const transfer = db.transfers.find((t) => t.id === req.params.transferId);
  if (!transfer) return res.status(404).json({ error: 'Transfer not found' });
  if (transfer.status !== 'PENDING_DISPATCH') return res.status(409).json({ error: `Cannot cancel a transfer in status ${transfer.status}` });
  const reason = typeof (req.body && req.body.reason) === 'string' ? req.body.reason.trim() : '';
  if (!reason) return res.status(400).json({ error: 'A reason is required' });
  transfer.status = 'CANCELLED';
  transfer.cancelReason = reason;
  transfer.cancelledBy = req.user.id;
  transfer.cancelledAt = new Date().toISOString();
  releaseToRequest(transfer, req.user, 'ORDER_CANCELLED', reason);
  db.notify(transfer.sourceStoreId, 'TRANSFER_CANCELLED', `Transfer ${transfer.id} was cancelled: ${reason}`);
  db.logAudit({ user: req.user, action: 'CANCEL_TRANSFER', resource: transfer.id, storeId: transfer.sourceStoreId, after: { status: transfer.status, reason } });
  res.json(enrichTransfer(transfer));
});

// US-08.5 — the source Store Manager reports an Issued order unfulfillable with a reason (BR-15).
router.post('/:transferId/unfulfillable', requirePermission('TRANSFER_ORDER_REPORT'), resolveStoreScope, (req, res) => {
  const transfer = db.transfers.find((t) => t.id === req.params.transferId);
  if (!transfer) return res.status(404).json({ error: 'Transfer not found' });
  if (req.storeScope.type === 'SINGLE' && req.storeScope.storeId !== transfer.sourceStoreId) {
    return res.status(403).json({ error: 'Only the source store can report this order' });
  }
  if (transfer.status !== 'PENDING_DISPATCH') return res.status(409).json({ error: `Cannot report a transfer in status ${transfer.status}` });
  const reason = typeof (req.body && req.body.reason) === 'string' ? req.body.reason.trim() : '';
  if (!reason) return res.status(400).json({ error: 'A reason is required' });
  transfer.status = 'UNFULFILLABLE';
  transfer.unfulfillableReason = reason;
  transfer.reportedBy = req.user.id;
  transfer.reportedAt = new Date().toISOString();
  releaseToRequest(transfer, req.user, 'ORDER_UNFULFILLABLE', reason);
  db.notify(null, 'TRANSFER_UNFULFILLABLE', `Transfer ${transfer.id} cannot be fulfilled by ${db.getStore(transfer.sourceStoreId)?.name}: ${reason}`);
  db.logAudit({ user: req.user, action: 'REPORT_TRANSFER_UNFULFILLABLE', resource: transfer.id, storeId: transfer.sourceStoreId, after: { status: transfer.status, reason } });
  res.json(enrichTransfer(transfer));
});

// Factory/supplier orders: simplified single-step "goods arrived" receipt,
// performed by Inventory Staff at the destination store.
router.get('/factory-orders', requireAnyPermission('INVENTORY_VIEW', 'STOCK_REQUEST_APPROVE'), resolveStoreScope, (req, res) => {
  let list = db.factoryOrders;
  if (req.storeScope.type === 'SINGLE') list = list.filter((o) => o.destinationStoreId === req.storeScope.storeId);
  res.json(list.map((o) => ({ ...o, productName: db.getProduct(o.productId)?.name, destinationStoreName: db.getStore(o.destinationStoreId)?.name })));
});

router.post('/factory-orders/:orderId/receive', requirePermission('INVENTORY_RECEIVE'), resolveStoreScope, (req, res) => {
  const order = db.factoryOrders.find((o) => o.id === req.params.orderId);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.status !== 'ORDERED') return res.status(409).json({ error: `Cannot receive an order in status ${order.status}` });
  if (req.storeScope.type === 'SINGLE' && req.storeScope.storeId !== order.destinationStoreId) {
    return res.status(403).json({ error: 'Only the destination store can receive this order' });
  }

  let row = db.getInventoryRow(order.destinationStoreId, order.productId);
  if (!row) { row = { storeId: order.destinationStoreId, productId: order.productId, quantity: 0, threshold: 0 }; db.inventory.push(row); }
  row.quantity += order.quantity;

  db.stockMovements.push({
    id: db.id('MOV'), storeId: order.destinationStoreId, productId: order.productId, type: 'RECEIVE',
    quantity: order.quantity, actorId: req.user.id, note: 'factory order', createdAt: new Date().toISOString(),
  });
  order.status = 'RECEIVED';

  const request = db.stockRequests.find((r) => r.id === order.stockRequestId);
  if (request) { request.status = 'COMPLETED'; request.history.push({ status: 'COMPLETED', at: new Date().toISOString(), by: req.user.id }); }

  db.logAudit({ user: req.user, action: 'RECEIVE_FACTORY_ORDER', resource: order.id, storeId: order.destinationStoreId });
  res.json(order);
});

module.exports = router;
