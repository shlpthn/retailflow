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

module.exports = router;
