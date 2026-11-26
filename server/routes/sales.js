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

function getLatestTransactions(salesList, limit = 20) {
  return [...salesList]
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    .slice(0, limit);
}

/**
 * GET /api/sales/transactions (alias: /api/sales/history) — completed sales history (BA US-07.1).
 * Query: storeId (HO only; store-level roles may only name their own store), from / to (yyyy-MM-dd,
 * default today), receiptNo, cashier (user id), paymentMethod, page (1-based), limit (default 20, max 100).
 * Scope (BR-09): Cashier / Store Manager — their store; HO Manager — the whole chain or one store.
 */
const handleTransactions = (req, res) => {
  const q = req.query;
  let storeIds;
  if (hasPermission(req.user, 'SALES_VIEW_ALL_STORES')) {
    if (q.storeId) {
      if (!assertStoreAccess(req, res, q.storeId)) return;
      storeIds = [q.storeId];
    } else {
      storeIds = db.getAllStores().map((s) => s.id);
    }
  } else {
    const own = effectiveStoreId(req);
    if (q.storeId && q.storeId !== own) {
      db.logAudit({ user: req.user, action: 'ACCESS_DENIED', resource: `sales-history:${q.storeId}`, storeId: own, result: 'DENIED', after: { requestedStoreId: q.storeId } });
      return res.status(403).json({ error: `Forbidden: no access to store ${q.storeId}` });
    }
    if (!assertStoreAccess(req, res, own)) return;
    storeIds = [own];
  }

  const today = new Date().toISOString().slice(0, 10);
  const from = q.from || today;
  const to = q.to || (q.from ? '9999-12-31' : today);
  const limit = Math.min(100, Math.max(1, parseInt(q.limit, 10) || 20));
  const page = Math.max(1, parseInt(q.page, 10) || 1);

  const matching = db.sales.filter((s) => {
    if (!storeIds.includes(s.storeId)) return false;
    const day = (s.createdAt || '').slice(0, 10);
    if (day < from || day > to) return false;
    if (q.receiptNo && s.receiptNo !== q.receiptNo && s.id !== q.receiptNo) return false;
    if (q.cashier && s.cashierId !== q.cashier) return false;
    if (q.paymentMethod && s.paymentMethod !== q.paymentMethod) return false;
    return true;
  });
  const sorted = [...matching].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const transactions = sorted.slice((page - 1) * limit, page * limit)
    .map((s) => ({ ...s, itemCount: s.items.reduce((a, i) => a + i.quantity, 0) }));
  const storeId = storeIds.length === 1 ? storeIds[0] : null;

  res.json({
    storeId,
    storeName: storeId ? (db.getStore(storeId)?.name || storeId) : 'All stores',
    from, to, page, limit,
    totalCount: matching.length,
    transactions,
    sales: transactions,
  });
};

router.get(
  '/transactions',
  requireAnyPermission('SALES_VIEW_OWN_STORE', 'SALES_VIEW_ALL_STORES'),
  resolveStoreScope,
  handleTransactions
);

router.get(
  '/history',
  requireAnyPermission('SALES_VIEW_OWN_STORE', 'SALES_VIEW_ALL_STORES'),
  resolveStoreScope,
  handleTransactions
);

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
      return res.json({
        scope: 'OWN_TRANSACTIONS',
        sales: own,
        recentTransactions: getLatestTransactions(own, 20),
        summary: summarize(own),
      });
    }

    if (hasPermission(req.user, 'SALES_VIEW_ALL_STORES')) {
      const storeId = req.query.storeId
        ? (assertStoreAccess(req, res, req.query.storeId) ? req.query.storeId : null)
        : effectiveStoreId(req);
      if (storeId === null && res.headersSent) return;
      const scoped = db.sales.filter((s) => s.storeId === storeId);
      return res.json({
        scope: 'STORE',
        storeId,
        storeName: db.getStore(storeId)?.name,
        recentTransactions: getLatestTransactions(scoped, 20),
        summary: summarize(scoped),
      });
    }

    // SALES_VIEW_OWN_STORE without CASHIER role => Store Manager: fixed own store.
    const storeId = effectiveStoreId(req);
    if (!assertStoreAccess(req, res, storeId)) return;
    const scoped = db.sales.filter((s) => s.storeId === storeId);
    res.json({
      scope: 'STORE',
      storeId,
      storeName: db.getStore(storeId)?.name,
      recentTransactions: getLatestTransactions(scoped, 20),
      summary: summarize(scoped),
    });
  }
);

module.exports = router;
