const express = require('express');
const router = express.Router();
const db = require('../db');
const { requirePermission } = require('../permissions');

router.get('/', requirePermission('PROMOTION_VIEW'), (req, res) => {
  res.json(db.promotions);
});

router.post('/', requirePermission('PROMOTION_MANAGE'), (req, res) => {
  const { name, code, type, value, validFrom, validTo, applicableProductIds, applicableStoreIds } = req.body || {};
  if (!name || !code || !type || value == null || !validFrom || !validTo) {
    return res.status(400).json({ error: 'name, code, type, value, validFrom, validTo required' });
  }
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0 || !['PERCENT', 'FIXED'].includes(type)) {
    return res.status(400).json({ error: 'type must be PERCENT or FIXED and value must be finite and non-negative' });
  }
  const promo = {
    id: db.id('PROMO'), name, code, type, value: numericValue, active: true,
    validFrom, validTo,
    applicableProductIds: applicableProductIds || null,
    applicableStoreIds: applicableStoreIds || null,
  };
  db.promotions.push(promo);
  db.logAudit({ user: req.user, action: 'CREATE_PROMOTION', resource: promo.id, after: promo });
  res.status(201).json(promo);
});

router.put('/:promoId', requirePermission('PROMOTION_MANAGE'), (req, res) => {
  const promo = db.promotions.find((p) => p.id === req.params.promoId);
  if (!promo) return res.status(404).json({ error: 'Promotion not found' });
  const before = { ...promo };
  Object.assign(promo, req.body || {}, { id: promo.id });
  db.logAudit({ user: req.user, action: 'UPDATE_PROMOTION', resource: promo.id, before, after: promo });
  res.json(promo);
});

router.delete('/:promoId', requirePermission('PROMOTION_MANAGE'), (req, res) => {
  const idx = db.promotions.findIndex((p) => p.id === req.params.promoId);
  if (idx === -1) return res.status(404).json({ error: 'Promotion not found' });
  const [removed] = db.promotions.splice(idx, 1);
  db.logAudit({ user: req.user, action: 'DELETE_PROMOTION', resource: removed.id, before: removed });
  res.status(204).end();
});

module.exports = router;
