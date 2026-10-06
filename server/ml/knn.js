// ============================================================================
// USER-BASED KNN RECOMMENDER — dependency-free, deterministic core
// ----------------------------------------------------------------------------
// Every model function consumes only the interactions passed to it. Routes are
// responsible for supplying the training partition, so test/validation data can
// never leak into similarity vectors or popularity rankings.
// ============================================================================

const EPSILON = 1e-12;

function compareText(a, b) {
  return String(a).localeCompare(String(b), 'en', { numeric: true, sensitivity: 'base' });
}

function validInteraction(row) {
  return row && typeof row.customerId === 'string' && row.customerId &&
    typeof row.stockCode === 'string' && row.stockCode &&
    Number.isFinite(row.quantity) && row.quantity > 0 &&
    typeof row.invoiceDate === 'string' && !Number.isNaN(Date.parse(row.invoiceDate));
}

/** Aggregate raw purchase lines into sparse, log-scaled customer-item vectors. */
function buildInteractionMatrix(rows) {
  const matrix = {};
  for (const row of rows || []) {
    if (!validInteraction(row)) continue;
    if (!matrix[row.customerId]) matrix[row.customerId] = {};
    matrix[row.customerId][row.stockCode] = (matrix[row.customerId][row.stockCode] || 0) + row.quantity;
  }
  for (const vector of Object.values(matrix)) {
    for (const item of Object.keys(vector)) vector[item] = Math.log1p(vector[item]);
  }
  return matrix;
}

function cosineSimilarity(left, right) {
  if (!left || !right) return 0;
  const [smaller, larger] = Object.keys(left).length <= Object.keys(right).length ? [left, right] : [right, left];
  let dot = 0;
  for (const item of Object.keys(smaller)) dot += smaller[item] * (larger[item] || 0);
  const leftNorm = Math.sqrt(Object.values(left).reduce((sum, value) => sum + value * value, 0));
  const rightNorm = Math.sqrt(Object.values(right).reduce((sum, value) => sum + value * value, 0));
  return leftNorm > EPSILON && rightNorm > EPSILON ? dot / (leftNorm * rightNorm) : 0;
}

function buildPopularity(matrix) {
  const totals = {};
  const support = {};
  for (const vector of Object.values(matrix)) {
    for (const [item, weight] of Object.entries(vector)) {
      totals[item] = (totals[item] || 0) + weight;
      support[item] = (support[item] || 0) + 1;
    }
  }
  return Object.keys(totals).map((stockCode) => ({ stockCode, score: totals[stockCode], support: support[stockCode] }))
    .sort((a, b) => b.score - a.score || b.support - a.support || compareText(a.stockCode, b.stockCode));
}

function nearestNeighbors(customerId, matrix, k) {
  const target = matrix[customerId];
  if (!target) return [];
  return Object.keys(matrix)
    .filter((id) => id !== customerId)
    .map((id) => ({ customerId: id, similarity: cosineSimilarity(target, matrix[id]) }))
    .filter((neighbor) => neighbor.similarity > EPSILON)
    .sort((a, b) => b.similarity - a.similarity || compareText(a.customerId, b.customerId))
    .slice(0, k);
}

function attachDescriptions(rows) {
  const byCode = {};
  for (const row of rows || []) {
    if (row.stockCode && row.description && !byCode[row.stockCode]) byCode[row.stockCode] = row.description;
  }
  return byCode;
}

function recommend(customerId, model, options = {}) {
  const limit = Math.max(1, Math.min(50, Number(options.limit) || model.algorithm.topN || 5));
  const k = Math.max(1, Math.min(100, Number(options.k) || model.algorithm.k || 20));
  const includePurchased = options.includePurchased === true;
  const matrix = model.interactions || {};
  const target = matrix[customerId];
  const descriptions = model.itemDescriptions || {};
  const fallback = (reason) => ({
    customerId,
    strategy: 'popularity',
    fallback: true,
    fallbackReason: reason,
    modelVersion: model.modelVersion,
    neighbors: [],
    recommendations: (model.popularity || [])
      .filter((row) => includePurchased || !target || !target[row.stockCode])
      .slice(0, limit)
      .map((row) => ({ ...row, description: descriptions[row.stockCode] || null, reason: 'Popular with eligible customers' })),
  });
  if (!target) return fallback('UNKNOWN_CUSTOMER');

  const neighbors = nearestNeighbors(customerId, matrix, k);
  if (!neighbors.length) return fallback('NO_SIMILAR_CUSTOMERS');

  const scores = {};
  for (const neighbor of neighbors) {
    for (const [stockCode, value] of Object.entries(matrix[neighbor.customerId])) {
      if (!includePurchased && target[stockCode]) continue;
      if (!scores[stockCode]) scores[stockCode] = { score: 0, support: 0 };
      scores[stockCode].score += neighbor.similarity * value;
      scores[stockCode].support += 1;
    }
  }
  const ranked = Object.keys(scores).map((stockCode) => ({ stockCode, ...scores[stockCode] }))
    .sort((a, b) => b.score - a.score || b.support - a.support || compareText(a.stockCode, b.stockCode));
  if (!ranked.length) return fallback('NO_UNSEEN_NEIGHBOR_ITEMS');

  return {
    customerId,
    strategy: 'user-based-knn',
    fallback: false,
    fallbackReason: null,
    modelVersion: model.modelVersion,
    neighbors,
    recommendations: ranked.slice(0, limit).map((row) => ({
      ...row,
      description: descriptions[row.stockCode] || null,
      reason: 'Purchased by similar customers',
    })),
  };
}

/**
 * Chronological split at basket/invoice granularity. Holding out individual
 * lines from a multi-item invoice would leak products from the same purchase
 * into training, so each customer's last basket is test and the prior basket
 * is validation. Customers with fewer than three baskets remain train-only.
 */
function temporalSplit(rows) {
  const byCustomer = new Map();
  for (const row of rows || []) {
    if (!validInteraction(row)) continue;
    if (!byCustomer.has(row.customerId)) byCustomer.set(row.customerId, new Map());
    const basketId = String(row.invoiceNo || `${row.invoiceDate}|${row.stockCode}`);
    const baskets = byCustomer.get(row.customerId);
    if (!baskets.has(basketId)) {
      baskets.set(basketId, { invoiceNo: basketId, invoiceDate: row.invoiceDate, rows: [] });
    }
    baskets.get(basketId).rows.push(row);
  }

  const train = [];
  const validation = [];
  const test = [];
  for (const baskets of byCustomer.values()) {
    const ordered = Array.from(baskets.values()).sort((a, b) =>
      new Date(a.invoiceDate) - new Date(b.invoiceDate) || compareText(a.invoiceNo, b.invoiceNo)
    );
    if (ordered.length < 3) {
      ordered.forEach((basket) => train.push(...basket.rows));
    } else {
      ordered.slice(0, -2).forEach((basket) => train.push(...basket.rows));
      validation.push(...ordered[ordered.length - 2].rows);
      test.push(...ordered[ordered.length - 1].rows);
    }
  }
  return { train, validation, test };
}

function metricSummary(recommendationLists, truthByCustomer, catalogSize) {
  let precision = 0; let recall = 0; let hitRate = 0; let ndcg = 0; let eligible = 0;
  const recommendedItems = new Set();
  for (const [customerId, rows] of Object.entries(recommendationLists)) {
    const truth = truthByCustomer[customerId];
    if (!truth || !truth.size) continue;
    eligible += 1;
    const ids = rows.map((row) => row.stockCode);
    ids.forEach((id) => recommendedItems.add(id));
    const hits = ids.reduce((sum, id, index) => sum + (truth.has(id) ? 1 : 0), 0);
    precision += hits / Math.max(ids.length, 1);
    recall += hits / truth.size;
    if (hits) hitRate += 1;
    let dcg = 0;
    ids.forEach((id, index) => { if (truth.has(id)) dcg += 1 / Math.log2(index + 2); });
    const ideal = Array.from({ length: Math.min(truth.size, ids.length) }, (_, index) => 1 / Math.log2(index + 2)).reduce((a, b) => a + b, 0);
    ndcg += ideal ? dcg / ideal : 0;
  }
  return {
    evaluatedCustomers: eligible,
    precisionAtN: eligible ? precision / eligible : 0,
    recallAtN: eligible ? recall / eligible : 0,
    hitRateAtN: eligible ? hitRate / eligible : 0,
    ndcgAtN: eligible ? ndcg / eligible : 0,
    coverage: catalogSize ? recommendedItems.size / catalogSize : 0,
  };
}

function evaluate(model, heldOutRows, options = {}) {
  const truthByCustomer = {};
  for (const row of heldOutRows || []) {
    if (!validInteraction(row)) continue;
    if (!truthByCustomer[row.customerId]) truthByCustomer[row.customerId] = new Set();
    truthByCustomer[row.customerId].add(row.stockCode);
  }
  const lists = {};
  let coldStarts = 0;
  const started = process.hrtime.bigint();
  for (const customerId of Object.keys(truthByCustomer)) {
    const result = recommend(customerId, model, { ...options, includePurchased: false });
    lists[customerId] = result.recommendations;
    if (result.fallback) coldStarts += 1;
  }
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  const count = Object.keys(truthByCustomer).length;
  return {
    ...metricSummary(lists, truthByCustomer, Object.keys(model.itemDescriptions || {}).length),
    coldStartRate: count ? coldStarts / count : 0,
    averageInferenceMs: count ? elapsedMs / count : 0,
  };
}

function evaluatePopularity(model, heldOutRows, options = {}) {
  const truthByCustomer = {};
  for (const row of heldOutRows || []) {
    if (!validInteraction(row)) continue;
    if (!truthByCustomer[row.customerId]) truthByCustomer[row.customerId] = new Set();
    truthByCustomer[row.customerId].add(row.stockCode);
  }
  const limit = Math.max(1, Math.min(50, Number(options.limit) || model.algorithm.topN || 5));
  const lists = {};
  for (const customerId of Object.keys(truthByCustomer)) {
    const target = (model.interactions || {})[customerId] || {};
    lists[customerId] = (model.popularity || []).filter((row) => !target[row.stockCode]).slice(0, limit);
  }
  return metricSummary(lists, truthByCustomer, Object.keys(model.itemDescriptions || {}).length);
}

function createModel(rows, { k = 20, topN = 5, dataset = {} } = {}) {
  const split = temporalSplit(rows);
  const trainRows = split.train.length ? split.train : rows.filter(validInteraction);
  const interactions = buildInteractionMatrix(trainRows);
  const itemDescriptions = attachDescriptions(trainRows);
  const model = {
    schemaVersion: 1,
    modelVersion: `knn-${new Date().toISOString().replace(/[-:.TZ]/g, '')}`,
    algorithm: { type: 'user-based-knn', similarity: 'cosine', k, topN, transform: 'log1p_quantity' },
    dataset,
    split: { strategy: 'per-customer-chronological-last-two-baskets', trainRows: trainRows.length, validationRows: split.validation.length, testRows: split.test.length },
    stats: { customerCount: Object.keys(interactions).length, itemCount: Object.keys(itemDescriptions).length, interactionCount: trainRows.length },
    interactions,
    itemDescriptions,
    popularity: buildPopularity(interactions),
    trainedAt: new Date().toISOString(),
  };
  model.metrics = {
    knn: evaluate(model, split.test, { limit: topN, k }),
    popularity: evaluatePopularity(model, split.test, { limit: topN }),
    note: 'Metrics use a chronological per-customer holdout. No holdout row is included in the training interaction matrix.',
  };
  return model;
}

module.exports = { validInteraction, buildInteractionMatrix, cosineSimilarity, buildPopularity, nearestNeighbors, temporalSplit, recommend, metricSummary, evaluate, evaluatePopularity, createModel };
