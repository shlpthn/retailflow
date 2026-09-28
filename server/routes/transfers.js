const express = require('express');
const router = express.Router();
const db = require('../db');
const { requirePermission, requireAnyPermission, hasPermission } = require('../permissions');
const { resolveStoreScope } = require('../middleware/storeScope');

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
  if (!row) { row = { storeId: transfer.destinationStoreId, productId: transfer.productId, quantity: 0, threshold: 10 }; db.inventory.push(row); }
  row.quantity += transfer.quantity;

  db.stockMovements.push({
    id: db.id('MOV'), storeId: transfer.destinationStoreId, productId: transfer.productId, type: 'TRANSFER_IN',
    quantity: transfer.quantity, actorId: req.user.id, note: `from ${transfer.sourceStoreId}`, createdAt: new Date().toISOString(),
  });
  transfer.status = 'COMPLETED';

  const request = db.stockRequests.find((r) => r.id === transfer.stockRequestId);
  if (request) { request.status = 'COMPLETED'; request.history.push({ status: 'COMPLETED', at: new Date().toISOString(), by: req.user.id }); }

  db.logAudit({ user: req.user, action: 'RECEIVE_TRANSFER', resource: transfer.id, storeId: transfer.destinationStoreId });
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
  if (!row) { row = { storeId: order.destinationStoreId, productId: order.productId, quantity: 0, threshold: 10 }; db.inventory.push(row); }
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
