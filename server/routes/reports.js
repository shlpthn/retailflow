const express = require('express');
const router = express.Router();
const db = require('../db');
const { requirePermission, STORE_LEVEL_ROLES } = require('../permissions');

// ============================================================================
// REPORTS (BA RF-10, US-10.1 … 10.4) — REPORT_VIEW: Store Manager (own store), HO Manager (chain).
// Every report is computed from completed sales / stock / transfer data, so its
// figures reconcile with the sales history and the stock card.
// ============================================================================

const DAY = 86400000;
const isoDay = (t) => new Date(t).toISOString().slice(0, 10);

/** Stores the caller may report on; null + response sent when the request is out of scope. */
function scopeStores(req, res) {
  const asked = req.query.storeId || null;
  if (STORE_LEVEL_ROLES.has(req.user.role)) {
    if (asked && asked !== req.user.storeId) {
      db.logAudit({ user: req.user, action: 'ACCESS_DENIED', resource: `${req.method} ${req.originalUrl}`, storeId: req.user.storeId, result: 'DENIED', entityType: 'Report', after: { requestedStoreId: asked } });
      res.status(403).json({ error: `Forbidden: no access to store ${asked}` });
      return null;
    }
    return [req.user.storeId];
  }
  if (asked) {
    if (!db.getStore(asked)) { res.status(404).json({ error: `Unknown store ${asked}` }); return null; }
    return [asked];
  }
  return db.getAllStores().map((s) => s.id);
}

/** Date range; default = the last 7 days including today (US-10.1 AC1). */
function range(q) {
  const to = q.to || isoDay(Date.now());
  const from = q.from || isoDay(Date.parse(`${to}T00:00:00Z`) - 6 * DAY);
  return { from, to };
}

function salesIn(storeIds, { from, to }) {
  return db.sales.filter((s) => storeIds.includes(s.storeId) && s.createdAt.slice(0, 10) >= from && s.createdAt.slice(0, 10) <= to);
}

function periodOf(iso, groupBy) {
  if (groupBy === 'month') return iso.slice(0, 7);
  if (groupBy === 'week') {
    const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
    const day = (d.getUTCDay() + 6) % 7; // Monday = 0
    d.setUTCDate(d.getUTCDate() - day + 3); // Thursday of this ISO week
    const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    const week = 1 + Math.round(((d - firstThu) / DAY - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
    return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
  }
  return iso.slice(0, 10);
}

const round2 = (n) => Math.round(n * 100) / 100;

// US-10.1 — sales report: receipt count, gross revenue, total discount, net revenue, average receipt value.
router.get('/sales', requirePermission('REPORT_VIEW'), (req, res) => {
  const storeIds = scopeStores(req, res); if (!storeIds) return;
  const r = range(req.query);
  const groupBy = ['day', 'week', 'month'].includes(req.query.groupBy) ? req.query.groupBy : 'day';
  const sales = salesIn(storeIds, r);
  const sum = (f) => sales.reduce((a, s) => a + f(s), 0);
  const buckets = {};
  for (const s of sales) {
    const k = periodOf(s.createdAt, groupBy);
    const b = buckets[k] || (buckets[k] = { period: k, receiptCount: 0, grossRevenue: 0, totalDiscount: 0, netRevenue: 0 });
    b.receiptCount += 1; b.grossRevenue += s.subtotal; b.totalDiscount += s.discount; b.netRevenue += s.total;
  }
  const net = sum((s) => s.total);
  res.json({
    ...r, groupBy, storeId: storeIds.length === 1 ? storeIds[0] : null, stores: storeIds,
    receiptCount: sales.length,
    grossRevenue: round2(sum((s) => s.subtotal)),
    totalDiscount: round2(sum((s) => s.discount)),
    netRevenue: round2(net),
    averageReceiptValue: sales.length ? round2(net / sales.length) : 0,
    buckets: Object.values(buckets).sort((a, b) => a.period.localeCompare(b.period)),
  });
});

// US-10.2 — top 10 products by quantity (default) or net revenue.
router.get('/best-sellers', requirePermission('REPORT_VIEW'), (req, res) => {
  const storeIds = scopeStores(req, res); if (!storeIds) return;
  const by = req.query.by === 'revenue' ? 'revenue' : 'quantity';
  const rows = {};
  for (const s of salesIn(storeIds, range(req.query))) {
    for (const l of s.items) {
      const r = rows[l.productId] || (rows[l.productId] = { productId: l.productId, name: l.name, qty: 0, revenue: 0 });
      r.qty += l.quantity;
      r.revenue += l.lineTotal ?? l.unitPrice * l.quantity;
    }
  }
  const key = by === 'revenue' ? 'revenue' : 'qty';
  res.json(Object.values(rows).sort((a, b) => b[key] - a[key] || a.name.localeCompare(b.name)).slice(0, 10));
});

// US-10.3 — stock and low-stock report (low = on-hand ≤ minimum level, BR-19).
router.get('/stock', requirePermission('REPORT_VIEW'), (req, res) => {
  const storeIds = scopeStores(req, res); if (!storeIds) return;
  const q = req.query;
  const statusOf = (row) => (row.quantity === 0 ? 'OUT_OF_STOCK' : row.quantity <= row.threshold ? 'LOW_STOCK' : 'OK');
  const keep = (row) => (q.lowStockOnly !== 'true' || statusOf(row) !== 'OK') && (q.zeroStock !== 'true' || row.quantity === 0);
  const rows = [];
  for (const storeId of storeIds) {
    for (const row of db.getInventoryForStore(storeId)) {
      const p = db.getProduct(row.productId);
      if (!p || (q.category && p.category !== q.category)) continue;
      if (!keep(row)) continue;
      rows.push({ storeId, productId: p.id, name: p.name, quantity: row.quantity, minLevel: row.threshold, status: statusOf(row) });
    }
  }
  // HO without a store filter also gets a product × store matrix.
  const matrix = storeIds.length > 1 ? Object.values(rows.reduce((m, r) => {
    const e = m[r.productId] || (m[r.productId] = { productId: r.productId, name: r.name, stores: {} });
    e.stores[r.storeId] = { quantity: r.quantity, minLevel: r.minLevel, status: r.status };
    return m;
  }, {})) : undefined;
  res.json({ stores: storeIds, rows, matrix });
});

// US-10.4 — transfer report: counts by status and store pair; stuck requests / orders.
router.get('/transfers', requirePermission('REPORT_VIEW'), (req, res) => {
  const storeIds = scopeStores(req, res); if (!storeIds) return;
  const now = Date.now();
  const hoursSince = (iso) => (now - Date.parse(iso)) / 3600000;
  const requests = db.stockRequests.filter((r) => storeIds.includes(r.storeId));
  const orders = db.transfers.filter((t) => storeIds.includes(t.sourceStoreId) || storeIds.includes(t.destinationStoreId));
  const requestsByStatus = {};
  for (const r of requests) requestsByStatus[r.status] = (requestsByStatus[r.status] || 0) + 1;
  const pairs = {};
  for (const t of orders) {
    const k = `${t.sourceStoreId}→${t.destinationStoreId}`;
    const p = pairs[k] || (pairs[k] = { sourceStoreId: t.sourceStoreId, destinationStoreId: t.destinationStoreId, byStatus: {} });
    p.byStatus[t.status] = (p.byStatus[t.status] || 0) + 1;
  }
  res.json({
    requestsByStatus,
    ordersByStorePair: Object.values(pairs),
    stuck: {
      requestsSubmittedOver24h: requests.filter((r) => ['REQUESTED', 'UNDER_REVIEW'].includes(r.status) && hoursSince(r.submittedAt || r.createdAt) > 24).map((r) => r.id),
      ordersIssuedOver24h: orders.filter((t) => t.status === 'PENDING_DISPATCH' && hoursSince(t.issuedAt || t.createdAt) > 24).map((t) => t.id),
      ordersInTransitOver48h: orders.filter((t) => t.status === 'IN_TRANSIT' && hoursSince(t.dispatchedAt || t.createdAt) > 48).map((t) => t.id),
    },
  });
});

module.exports = router;
