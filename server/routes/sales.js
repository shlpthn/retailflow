const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAnyPermission, hasPermission } = require('../permissions');
const { resolveStoreScope, assertStoreAccess, effectiveStoreId } = require('../middleware/storeScope');

function summarize(salesForScope) {
  const today = new Date().toISOString().slice(0, 10);
  const todaySales = salesForScope.filter((s) => s.createdAt.slice(0, 10) === today);
  const itemsSold = salesForScope.reduce((sum, s) => sum + s.items.reduce((a, i) => a + i.quantity, 0), 0);
  const revenue = salesForScope.reduce((sum, s) => sum + s.total, 0);

  const byProduct = {};
  for (const s of salesForScope) {
    for (const i of s.items) {
      byProduct[i.name] = (byProduct[i.name] || 0) + i.quantity;
    }
  }
  const bestSellers = Object.entries(byProduct).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([name, qty]) => ({ name, qty }));

  const byDay = {};
  for (const s of salesForScope) {
    const day = s.createdAt.slice(0, 10);
    byDay[day] = (byDay[day] || 0) + s.total;
  }
  const trend = Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b)).map(([day, total]) => ({ day, total }));

  return {
    todaysSales: todaySales.reduce((sum, s) => sum + s.total, 0),
    transactions: salesForScope.length,
    itemsSold,
    revenue,
    bestSellers,
    trend,
    projection: trend.length ? Math.round((revenue / Math.max(1, trend.length)) * 30) : 0, // naive 30-day projection
  };
}

router.get(
  '/',
  requireAnyPermission('SALES_VIEW_OWN_STORE', 'SALES_VIEW_ALL_STORES'),
  resolveStoreScope,
  (req, res) => {
    // Cashiers hold SALES_VIEW_OWN_STORE but Section 2 scopes them to only
    // their OWN permitted sales history, not the whole store's dashboard —
    // that distinction is enforced here, not by a role check.
    if (req.user.role === 'CASHIER') {
      const own = db.sales.filter((s) => s.cashierId === req.user.id);
      return res.json({ scope: 'OWN_TRANSACTIONS', sales: own, summary: summarize(own) });
    }

    if (hasPermission(req.user, 'SALES_VIEW_ALL_STORES')) {
      const storeId = req.query.storeId
        ? (assertStoreAccess(req, res, req.query.storeId) ? req.query.storeId : null)
        : effectiveStoreId(req);
      if (storeId === null && res.headersSent) return;
      const scoped = db.sales.filter((s) => s.storeId === storeId);
      return res.json({ scope: 'STORE', storeId, storeName: db.getStore(storeId)?.name, summary: summarize(scoped) });
    }

    // SALES_VIEW_OWN_STORE without CASHIER role => Store Manager: fixed own store.
    const storeId = effectiveStoreId(req);
    if (!assertStoreAccess(req, res, storeId)) return;
    const scoped = db.sales.filter((s) => s.storeId === storeId);
    res.json({ scope: 'STORE', storeId, storeName: db.getStore(storeId)?.name, summary: summarize(scoped) });
  }
);

module.exports = router;
