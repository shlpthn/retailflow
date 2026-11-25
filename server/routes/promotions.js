const express = require('express');
const router = express.Router();
const db = require('../db');
const { requirePermission } = require('../permissions');
const { windowOf, statusOf, withStatus, overlapping } = require('../promotionRules');

// RF-09 (BA US-09.1 … 09.3, D-02, BR-16, BR-17): one percentage discount on all
// active products, chain-wide; at most one promotion effective at any time.

const EDITABLE = ['name', 'code', 'value', 'discountPercent', 'validFrom', 'validTo', 'startAt', 'endAt'];

/** Normalise and validate a promotion payload. Returns { promo } or { error }. */
function validate(input, { now = Date.now() } = {}) {
  const p = { ...input };
  const raw = p.discountPercent ?? p.value;
  const pct = typeof raw === 'string' && /^[0-9]+$/.test(raw.trim()) ? Number(raw.trim()) : raw;
  if (p.type && p.type !== 'PERCENT') return { error: 'Only percentage promotions are supported (D-02)' };
  if ((Array.isArray(p.applicableProductIds) && p.applicableProductIds.length) || (Array.isArray(p.applicableStoreIds) && p.applicableStoreIds.length)) {
    return { error: 'A promotion always applies to all active products in every store (D-02)' };
  }
  if (typeof pct !== 'number' || !Number.isInteger(pct) || pct < 1 || pct > 100) {
    return { error: 'Discount must be a whole percentage between 1 and 100' };
  }
  if (p.startAt && Number.isNaN(Date.parse(p.startAt))) return { error: 'startAt is not a valid date-time' };
  if (p.endAt && Number.isNaN(Date.parse(p.endAt))) return { error: 'endAt is not a valid date-time' };
  if (p.startAt) p.validFrom = p.startAt.slice(0, 10);
  if (p.endAt) p.validTo = p.endAt.slice(0, 10);
  if (!p.validFrom || !p.validTo) return { error: 'Start and end are required' };
  const { start, end } = windowOf(p);
  if (Number.isNaN(start) || Number.isNaN(end)) return { error: 'Start and end must be valid dates' };
  if (start >= end) return { error: 'Start must be before end' };
  if (end <= now) return { error: 'End time is in the past' };
  return {
    promo: {
      name: p.name, code: p.code, type: 'PERCENT', value: pct, discountPercent: pct,
      validFrom: p.validFrom, validTo: p.validTo, startAt: p.startAt || null, endAt: p.endAt || null,
      applicableProductIds: null, applicableStoreIds: null,
    },
  };
}

const usedOnReceipts = (promo) => db.sales.some((s) => s.promotionId === promo.id || (s.promotionCode && s.promotionCode === promo.code));

router.get('/', requirePermission('PROMOTION_VIEW'), (req, res) => {
  res.json(db.promotions.map((p) => withStatus(p)));
});

router.post('/', requirePermission('PROMOTION_MANAGE'), (req, res) => {
  const { name, code } = req.body || {};
  if (!name || !code) return res.status(400).json({ error: 'name and code required' });
  if (db.promotions.some((p) => p.code === code)) return res.status(409).json({ error: `Promotion code ${code} already exists` });
  const v = validate(req.body || {});
  if (v.error) return res.status(400).json({ error: v.error });
  const w = windowOf(v.promo);
  const clash = overlapping(db.promotions, w.start, w.end);
  if (clash) return res.status(409).json({ error: `Overlaps the promotion "${clash.name}" (${clash.validFrom} – ${clash.validTo})` });
  const promo = { id: db.id('PROMO'), ...v.promo, active: true };
  db.promotions.push(promo);
  db.logAudit({ user: req.user, action: 'CREATE_PROMOTION', resource: promo.id, after: promo });
  res.status(201).json(withStatus(promo));
});

router.put('/:promoId', requirePermission('PROMOTION_MANAGE'), (req, res) => {
  const promo = db.promotions.find((p) => p.id === req.params.promoId);
  if (!promo) return res.status(404).json({ error: 'Promotion not found' });
  const body = req.body || {};
  const status = statusOf(promo);
  const before = { ...promo };

  if (status === 'ACTIVE') {
    // Only "End early" is allowed on an active promotion (the percentage must not change).
    const keys = Object.keys(body).filter((k) => k !== 'status');
    if (keys.length === 1 && keys[0] === 'active' && body.active === false) {
      promo.active = false;
      promo.endedAt = new Date().toISOString();
      db.logAudit({ user: req.user, action: 'END_PROMOTION', resource: promo.id, before, after: promo });
      return res.json(withStatus(promo));
    }
    return res.status(409).json({ error: 'An active promotion can only be ended early' });
  }
  if (status !== 'SCHEDULED') return res.status(409).json({ error: `A promotion in status ${status} is read-only` });

  const merged = { ...promo };
  for (const k of EDITABLE) if (body[k] !== undefined) merged[k] = body[k];
  if (body.value !== undefined && body.discountPercent === undefined) merged.discountPercent = body.value;
  if (body.discountPercent !== undefined && body.value === undefined) merged.value = body.discountPercent;
  if (body.validFrom !== undefined && body.startAt === undefined) merged.startAt = null;
  if (body.validTo !== undefined && body.endAt === undefined) merged.endAt = null;
  const v = validate(merged);
  if (v.error) return res.status(400).json({ error: v.error });
  const w = windowOf(v.promo);
  const clash = overlapping(db.promotions, w.start, w.end, promo.id);
  if (clash) return res.status(409).json({ error: `Overlaps the promotion "${clash.name}" (${clash.validFrom} – ${clash.validTo})` });
  Object.assign(promo, v.promo);
  db.logAudit({ user: req.user, action: 'UPDATE_PROMOTION', resource: promo.id, before, after: promo });
  res.json(withStatus(promo));
});

// BA US-09.2 AC2: "End early" — an Active (or not yet started) promotion becomes Inactive.
router.post('/:promoId/end', requirePermission('PROMOTION_MANAGE'), (req, res) => {
  const promo = db.promotions.find((p) => p.id === req.params.promoId);
  if (!promo) return res.status(404).json({ error: 'Promotion not found' });
  const status = statusOf(promo);
  if (!['ACTIVE', 'SCHEDULED'].includes(status)) return res.status(409).json({ error: `A promotion in status ${status} cannot be ended` });
  const before = { ...promo };
  promo.active = false;
  promo.endedAt = new Date().toISOString();
  db.logAudit({ user: req.user, action: 'END_PROMOTION', resource: promo.id, before, after: promo });
  res.json(withStatus(promo));
});

router.delete('/:promoId', requirePermission('PROMOTION_MANAGE'), (req, res) => {
  const idx = db.promotions.findIndex((p) => p.id === req.params.promoId);
  if (idx === -1) return res.status(404).json({ error: 'Promotion not found' });
  if (usedOnReceipts(db.promotions[idx])) return res.status(409).json({ error: 'This promotion is used on receipts and cannot be deleted; end it instead' });
  const [removed] = db.promotions.splice(idx, 1);
  db.logAudit({ user: req.user, action: 'DELETE_PROMOTION', resource: removed.id, before: removed });
  res.status(204).end();
});

module.exports = router;
