const express = require('express');
const router = express.Router();
const db = require('../db');
const { requirePermission } = require('../permissions');

router.get('/', requirePermission('STORE_VIEW'), (req, res) => {
  res.json(db.getAllStores());
});

router.post('/', requirePermission('STORE_MANAGE'), (req, res) => {
  const { name, address } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  const store = { id: db.id('STORE_'), name, address: address || '' };
  db.stores.push(store);

  for (const product of db.products) {
    if (!db.getInventoryRow(store.id, product.id)) {
      db.inventory.push({ storeId: store.id, productId: product.id, quantity: 0, threshold: 10 });
    }
  }

  db.logAudit({ user: req.user, action: 'CREATE_STORE', resource: store.id, after: store });
  res.status(201).json(store);
});

router.put('/:id', requirePermission('STORE_MANAGE'), (req, res) => {
  const { id } = req.params;
  const store = db.stores.find((s) => s.id === id);
  if (!store) return res.status(404).json({ error: 'Store not found' });

  const { name, address } = req.body || {};
  const before = { ...store };
  if (name !== undefined) store.name = name.trim();
  if (address !== undefined) store.address = address.trim();

  db.logAudit({ user: req.user, action: 'UPDATE_STORE', resource: id, before, after: store });
  res.json(store);
});

router.delete('/:id', requirePermission('STORE_MANAGE'), (req, res) => {
  const { id } = req.params;
  const idx = db.stores.findIndex((s) => s.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Store not found' });

  if (db.stores.length <= 1) {
    return res.status(400).json({ error: 'Cannot delete the only remaining store in the system' });
  }

  const [removed] = db.stores.splice(idx, 1);

  // Clean up inventory records associated with this store
  for (let i = db.inventory.length - 1; i >= 0; i--) {
    if (db.inventory[i].storeId === id) {
      db.inventory.splice(i, 1);
    }
  }

  // Unassign users who had this store as their storeId
  for (const u of db.users) {
    if (u.storeId === id) {
      u.storeId = null;
    }
  }

  db.logAudit({ user: req.user, action: 'DELETE_STORE', resource: id, before: removed });
  res.json({ success: true, deleted: removed });
});

module.exports = router;
