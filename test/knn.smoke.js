'use strict';

// Deterministic unit smoke tests for the dependency-free KNN core.
const assert = require('assert');
const {
  buildInteractionMatrix,
  cosineSimilarity,
  nearestNeighbors,
  temporalSplit,
  recommend,
  evaluatePopularity,
  createModel,
} = require('../server/ml/knn');

let pass = 0;
function check(name, fn) {
  try {
    fn();
    pass += 1;
    console.log('PASS ' + name);
  } catch (error) {
    console.log('FAIL ' + name + ' :: ' + error.message);
    throw error;
  }
}

const rows = [
  { customerId: 'C1', invoiceNo: 'I1', stockCode: 'A', quantity: 1, invoiceDate: '2025-01-01' },
  { customerId: 'C1', invoiceNo: 'I2', stockCode: 'B', quantity: 2, invoiceDate: '2025-02-01' },
  { customerId: 'C1', invoiceNo: 'I3', stockCode: 'C', quantity: 1, invoiceDate: '2025-03-01' },
  { customerId: 'C1', invoiceNo: 'I4', stockCode: 'D', quantity: 1, invoiceDate: '2025-04-01' },
  // Multiple lines in the same basket must never be split apart.
  { customerId: 'C2', invoiceNo: 'J1', stockCode: 'A', quantity: 1, invoiceDate: '2025-01-01' },
  { customerId: 'C2', invoiceNo: 'J1', stockCode: 'X', quantity: 1, invoiceDate: '2025-01-01' },
  { customerId: 'C2', invoiceNo: 'J2', stockCode: 'B', quantity: 1, invoiceDate: '2025-02-01' },
  { customerId: 'C2', invoiceNo: 'J3', stockCode: 'C', quantity: 1, invoiceDate: '2025-03-01' },
  // Two baskets remain entirely in training.
  { customerId: 'C3', invoiceNo: 'K1', stockCode: 'A', quantity: 1, invoiceDate: '2025-01-01' },
  { customerId: 'C3', invoiceNo: 'K2', stockCode: 'B', quantity: 1, invoiceDate: '2025-02-01' },
];

check('aggregates quantities with log1p weighting', () => {
  const matrix = buildInteractionMatrix([
    { customerId: 'C', stockCode: 'A', quantity: 3, invoiceDate: '2025-01-01' },
    { customerId: 'C', stockCode: 'A', quantity: 1, invoiceDate: '2025-01-02' },
  ]);
  assert.strictEqual(matrix.C.A, Math.log1p(4));
});

check('cosine similarity is normalized and handles zero vectors', () => {
  assert(Math.abs(cosineSimilarity({ A: 1, B: 1 }, { A: 1, B: 1 }) - 1) < 1e-12);
  assert.strictEqual(cosineSimilarity({}, { A: 1 }), 0);
});

check('temporal split holds out complete baskets', () => {
  const split = temporalSplit(rows);
  assert.deepStrictEqual(split.validation.filter((r) => r.customerId === 'C1').map((r) => r.invoiceNo), ['I3']);
  assert.deepStrictEqual(split.test.filter((r) => r.customerId === 'C1').map((r) => r.invoiceNo), ['I4']);
  assert.deepStrictEqual(split.validation.filter((r) => r.customerId === 'C2').map((r) => r.invoiceNo), ['J2']);
  assert.deepStrictEqual(split.test.filter((r) => r.customerId === 'C2').map((r) => r.invoiceNo), ['J3']);
  assert(split.train.some((r) => r.customerId === 'C2' && r.invoiceNo === 'J1' && r.stockCode === 'X'));
  assert(!split.validation.some((r) => r.invoiceNo === 'J1'));
  assert(!split.test.some((r) => r.invoiceNo === 'J1'));
  assert(split.train.every((r) => r.customerId !== 'C1' || r.invoiceNo === 'I1' || r.invoiceNo === 'I2'));
  assert(split.train.filter((r) => r.customerId === 'C3').length === 2);
});

check('nearest neighbors exclude the target and rank by similarity', () => {
  const matrix = {
    C1: { A: 1, B: 1 },
    C2: { A: 1, B: 1, C: 1 },
    C3: { C: 1 },
  };
  const neighbors = nearestNeighbors('C1', matrix, 2);
  assert.deepStrictEqual(neighbors.map((n) => n.customerId), ['C2']);
  assert(neighbors.every((n) => n.customerId !== 'C1'));
  assert(neighbors[0].similarity > 0);
});

check('recommendation excludes purchased items and supports cold start fallback', () => {
  const model = {
    modelVersion: 'test-model',
    algorithm: { k: 2, topN: 3 },
    interactions: {
      C1: { A: 1 },
      C2: { A: 1, B: 2 },
      C3: { A: 1, C: 1 },
    },
    popularity: [
      { stockCode: 'A', score: 3, support: 3 },
      { stockCode: 'B', score: 2, support: 1 },
      { stockCode: 'C', score: 1, support: 1 },
    ],
    itemDescriptions: { A: 'A', B: 'B', C: 'C' },
  };
  const personalized = recommend('C1', model, { limit: 2 });
  assert.strictEqual(personalized.fallback, false);
  assert.deepStrictEqual(personalized.recommendations.map((r) => r.stockCode), ['B', 'C']);
  const cold = recommend('UNKNOWN', model, { limit: 2 });
  assert.strictEqual(cold.fallback, true);
  assert.strictEqual(cold.fallbackReason, 'UNKNOWN_CUSTOMER');
  assert.deepStrictEqual(cold.recommendations.map((r) => r.stockCode), ['A', 'B']);
});

check('createModel records basket-level split and compares popularity baseline', () => {
  const model = createModel(rows, { k: 3, topN: 2, dataset: { source: 'test' } });
  assert.strictEqual(model.split.strategy, 'per-customer-chronological-last-two-baskets');
  assert.strictEqual(model.algorithm.k, 3);
  assert(model.metrics.knn && model.metrics.popularity);
  const baseline = evaluatePopularity(model, rows.slice(-1), { limit: 2 });
  assert(Number.isFinite(baseline.precisionAtN));
});

console.log(`\nRESULT: ${pass} passed, 0 failed`);
