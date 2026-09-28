const express = require('express');
const router = express.Router();
const db = require('../db');
const { requirePermission } = require('../permissions');

// Shared by Inventory Staff, Store Manager, Head Office Manager (Section 27).
router.get('/', requirePermission('PRODUCT_VIEW'), (req, res) => {
  res.json(db.getAllProducts());
});

// Head Office Manager only — global product management (Section 18).
router.post('/', requirePermission('PRODUCT_MANAGE'), (req, res) => {
  const { name, barcode, price, image } = req.body || {};
  if (!name || !barcode || price == null) return res.status(400).json({ error: 'name, barcode, price required' });
  const product = { id: db.id('P'), name, barcode, price: Number(price), image: image || '📦' };
  db.products.push(product);
  db.logAudit({ user: req.user, action: 'CREATE_PRODUCT', resource: product.id, after: product });
  res.status(201).json(product);
});

router.put('/:productId', requirePermission('PRODUCT_MANAGE'), (req, res) => {
  const product = db.getProduct(req.params.productId);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  const before = { ...product };
  Object.assign(product, req.body || {}, { id: product.id });
  db.logAudit({ user: req.user, action: 'UPDATE_PRODUCT', resource: product.id, before, after: product });
  res.json(product);
});

router.delete('/:productId', requirePermission('PRODUCT_MANAGE'), (req, res) => {
  const idx = db.products.findIndex((p) => p.id === req.params.productId);
  if (idx === -1) return res.status(404).json({ error: 'Product not found' });
  const [removed] = db.products.splice(idx, 1);
  db.logAudit({ user: req.user, action: 'DELETE_PRODUCT', resource: removed.id, before: removed });
  res.status(204).end();
});

module.exports = router;
