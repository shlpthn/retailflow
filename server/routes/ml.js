const express = require('express');
const router = express.Router();
const db = require('../db');
const { requirePermission } = require('../permissions');
const { resolveStoreScope, assertStoreAccess, effectiveStoreId } = require('../middleware/storeScope');
const { loadOnlineRetailCsv } = require('../ml/uci-online-retail');
const { createModel, recommend } = require('../ml/knn');
const {
  DEFAULT_MODEL_DIR,
  loadModel,
  loadCandidate,
  saveCandidate,
  saveModel,
  deployCandidate,
} = require('../ml/model-store');

function positiveInteger(value, fallback, maximum) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'number' && !(typeof value === 'string' && /^[0-9]+$/.test(value))) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= maximum ? parsed : null;
}

function customerId(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(value.trim())) return null;
  return value.trim();
}

function publicModel(model) {
  if (!model) return null;
  return {
    modelVersion: model.modelVersion,
    algorithm: model.algorithm,
    dataset: model.dataset,
    split: model.split,
    stats: model.stats,
    metrics: model.metrics,
    trainedAt: model.trainedAt,
    deployedAt: model.deployedAt || null,
  };
}

function sanitizeMapping(raw) {
  if (raw === undefined) return {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const mapping = {};
  for (const [stockCode, productId] of Object.entries(raw)) {
    if (!/^[A-Za-z0-9_.-]{1,80}$/.test(stockCode) || typeof productId !== 'string') return null;
    if (!db.getProduct(productId)) return null;
    mapping[stockCode] = productId;
  }
  return mapping;
}

function mappedRecommendations(result, model, storeId) {
  return result.recommendations.flatMap((row) => {
    const productId = model.catalogMapping && model.catalogMapping[row.stockCode];
    if (!productId) return [];
    const product = db.getProduct(productId);
    const inventory = storeId ? db.getInventoryRow(storeId, productId) : null;
    if (!product || !inventory || inventory.quantity <= 0) return [];
    return [{
      productId,
      name: product.name,
      price: product.price,
      image: product.image,
      available: inventory.quantity,
    }];
  });
}

function sendError(res, error) {
  const status = Number.isInteger(error.statusCode) ? error.statusCode : 500;
  if (status >= 500) console.error('ML request failed:', error);
  res.status(status).json({ error: status >= 500 ? 'ML operation failed' : error.message });
}

router.get('/status', requirePermission('ML_CONSOLE_VIEW'), (req, res) => {
  const deployed = loadModel(DEFAULT_MODEL_DIR);
  const candidate = loadCandidate(DEFAULT_MODEL_DIR);
  res.json({
    deployed: publicModel(deployed),
    candidate: publicModel(candidate),
    hasDeployedModel: !!deployed,
  });
});

router.post('/train', requirePermission('ML_DATASET_IMPORT'), requirePermission('ML_MODEL_TRAIN'), (req, res) => {
  try {
    const body = req.body || {};
    if (typeof body.fileName !== 'string') {
      return res.status(400).json({ error: 'fileName is required' });
    }
    const k = positiveInteger(body.k, 20, 100);
    const topN = positiveInteger(body.topN, 5, 50);
    if (!k || !topN) return res.status(400).json({ error: 'k and topN must be positive integers within limits' });
    const mapping = sanitizeMapping(body.catalogMapping);
    if (mapping === null) return res.status(400).json({ error: 'catalogMapping must map valid external codes to existing products' });

    const imported = loadOnlineRetailCsv(body.fileName);
    const model = createModel(imported.transactions, {
      k,
      topN,
      dataset: {
        ...imported.dataset,
        fileName: imported.fileName,
        sha256: imported.sha256,
        sourceRowCount: imported.sourceRowCount,
        usableRowCount: imported.usableRowCount,
        filteredRowCount: imported.filteredRowCount,
        filtered: imported.filtered,
      },
    });
    model.catalogMapping = mapping;
    saveCandidate(model, DEFAULT_MODEL_DIR);
    db.logAudit({ user: req.user, action: 'ML_MODEL_TRAIN', resource: model.modelVersion, after: publicModel(model) });
    res.status(201).json({ model: publicModel(model), import: imported.dataset });
  } catch (error) {
    return sendError(res, error);
  }
});

router.post('/deploy', requirePermission('ML_MODEL_DEPLOY'), (req, res) => {
  try {
    const model = deployCandidate(DEFAULT_MODEL_DIR);
    model.deployedAt = new Date().toISOString();
    // Save again so the deployed timestamp is part of the promoted artifact.
    saveModel(model, DEFAULT_MODEL_DIR);
    db.logAudit({ user: req.user, action: 'ML_MODEL_DEPLOY', resource: model.modelVersion, after: publicModel(model) });
    res.json({ model: publicModel(model) });
  } catch (error) {
    return sendError(res, error);
  }
});

router.get('/recommendations', requirePermission('ML_RECOMMENDATION_VIEW'), resolveStoreScope, (req, res) => {
  try {
    const id = customerId(req.query.customerId);
    if (!id) return res.status(400).json({ error: 'customerId must be a non-empty identifier' });
    const limit = positiveInteger(req.query.limit, 5, 50);
    const k = positiveInteger(req.query.k, undefined, 100);
    if (!limit || req.query.k !== undefined && !k) return res.status(400).json({ error: 'limit and k must be positive integers within limits' });
    const model = loadModel(DEFAULT_MODEL_DIR);
    if (!model) return res.status(503).json({ error: 'No deployed recommendation model is available' });
    const requestedStoreId = req.query.storeId || null;
    if (requestedStoreId && !assertStoreAccess(req, res, requestedStoreId)) return;
    const result = recommend(id, model, { limit, k });
    const storeId = effectiveStoreId(req);
    const mapped = mappedRecommendations(result, model, storeId);
    db.logAudit({ user: req.user, action: 'ML_RECOMMENDATION_VIEW', resource: id, storeId, after: { modelVersion: result.modelVersion, strategy: result.strategy, fallback: result.fallback } });
    res.json({
      customerId: result.customerId,
      strategy: result.strategy,
      fallback: result.fallback,
      fallbackReason: result.fallbackReason,
      modelVersion: result.modelVersion,
      recommendations: mapped,
      mappedOnly: true,
      storeId,
    });
  } catch (error) {
    return sendError(res, error);
  }
});

module.exports = router;
