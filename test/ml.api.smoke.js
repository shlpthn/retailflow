'use strict';

// Isolated end-to-end smoke tests for the authenticated ML lifecycle.
// Run from repo root: node test/ml.api.smoke.js
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const PORT = 3101;
const TMP_DIR = path.join(ROOT, 'test', '.tmp', 'ml-api');
const DB_FILE = path.join(TMP_DIR, 'retailflow_ml_smoke.db');
const MODEL_DIR = path.join(TMP_DIR, 'models');
const UCI_DIR = path.join(TMP_DIR, 'uci');
const SERVER_ENV = {
  ...process.env,
  PORT: String(PORT),
  RETAILFLOW_DB_PATH: DB_FILE,
  RETAILFLOW_MODEL_DIR: MODEL_DIR,
  RETAILFLOW_UCI_DIR: UCI_DIR,
};

function cleanTestFiles() {
  fs.rmSync(TMP_DIR, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  fs.mkdirSync(UCI_DIR, { recursive: true });
}

function writeFixture() {
  const headers = 'InvoiceNo,StockCode,Description,Quantity,InvoiceDate,UnitPrice,CustomerID,Country';
  const rows = [
    ['10001', 'A', 'Alpha external', '1', '01/01/2025 10:00', '2.50', 'CUST1', 'United Kingdom'],
    ['10002', 'B', 'Beta external', '1', '02/01/2025 10:00', '3.00', 'CUST1', 'United Kingdom'],
    ['10003', 'C', 'Gamma external', '1', '03/01/2025 10:00', '4.00', 'CUST1', 'United Kingdom'],
    ['10004', 'D', 'Delta external', '1', '04/01/2025 10:00', '5.00', 'CUST1', 'United Kingdom'],
    ['20001', 'A', 'Alpha external', '1', '01/01/2025 10:00', '2.50', 'CUST2', 'United Kingdom'],
    ['20002', 'B', 'Beta external', '1', '02/01/2025 10:00', '3.00', 'CUST2', 'United Kingdom'],
    ['20003', 'C', 'Gamma external', '1', '03/01/2025 10:00', '4.00', 'CUST2', 'United Kingdom'],
    ['20004', 'D', 'Delta external', '1', '04/01/2025 10:00', '5.00', 'CUST2', 'United Kingdom'],
    ['30001', 'A', 'Alpha external', '1', '01/01/2025 10:00', '2.50', 'CUST3', 'United Kingdom'],
    ['30002', 'B', 'Beta external', '1', '02/01/2025 10:00', '3.00', 'CUST3', 'United Kingdom'],
    ['30003', 'C', 'Gamma external', '1', '03/01/2025 10:00', '4.00', 'CUST3', 'United Kingdom'],
    ['30004', 'D', 'Delta external', '1', '04/01/2025 10:00', '5.00', 'CUST3', 'United Kingdom'],
    ['40001', 'A', 'Alpha external', '1', '01/01/2025 10:00', '2.50', 'CUST4', 'United Kingdom'],
    ['40002', 'B', 'Beta external', '1', '02/01/2025 10:00', '3.00', 'CUST4', 'United Kingdom'],
    ['40003', 'C', 'Gamma external', '1', '03/01/2025 10:00', '4.00', 'CUST4', 'United Kingdom'],
    ['40004', 'D', 'Delta external', '1', '04/01/2025 10:00', '5.00', 'CUST4', 'United Kingdom'],
    // CUST5 has an unseen E item in the final basket; neighbors can recommend E.
    ['50001', 'A', 'Alpha external', '1', '01/01/2025 10:00', '2.50', 'CUST5', 'United Kingdom'],
    ['50002', 'B', 'Beta external', '1', '02/01/2025 10:00', '3.00', 'CUST5', 'United Kingdom'],
    ['50003', 'C', 'Gamma external', '1', '03/01/2025 10:00', '4.00', 'CUST5', 'United Kingdom'],
    ['50004', 'E', 'Epsilon external', '1', '04/01/2025 10:00', '6.00', 'CUST5', 'United Kingdom'],
    // CUST6 shares A/B with CUST5 and has E in an earlier training basket.
    ['60001', 'A', 'Alpha external', '1', '01/01/2025 10:00', '2.50', 'CUST6', 'United Kingdom'],
    ['60002', 'E', 'Epsilon external', '1', '01/01/2025 10:00', '6.00', 'CUST6', 'United Kingdom'],
    ['60003', 'B', 'Beta external', '1', '02/01/2025 10:00', '3.00', 'CUST6', 'United Kingdom'],
    ['60004', 'C', 'Gamma external', '1', '03/01/2025 10:00', '4.00', 'CUST6', 'United Kingdom'],
  ];
  fs.writeFileSync(path.join(UCI_DIR, 'online-retail-fixture.csv'), [headers, ...rows.map((r) => r.join(','))].join('\n'), 'utf8');
}

function request(method, urlPath, token, body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const options = {
      host: 'localhost', port: PORT, path: urlPath, method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (token) options.headers.Authorization = `Bearer ${token}`;
    const client = http.request(options, (res) => {
      let output = '';
      res.on('data', (chunk) => { output += chunk; });
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(output); } catch (error) { /* empty/non-JSON response */ }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    client.on('error', reject);
    if (payload) client.write(payload);
    client.end();
  });
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await request('GET', '/api/stores');
      if (response.status > 0) return;
    } catch (error) { /* server is still starting */ }
    await sleep(250);
  }
  throw new Error(`Server did not become ready on :${PORT}`);
}

(async () => {
  let pass = 0;
  let fail = 0;
  let server = null;
  const check = (name, condition, extra = '') => {
    if (condition) {
      pass += 1;
      console.log(`PASS ${name}`);
    } else {
      fail += 1;
      console.log(`FAIL ${name} :: ${extra}`);
    }
  };

  cleanTestFiles();
  writeFixture();

  try {
    server = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: SERVER_ENV });
    await waitForServer();

    const login = async (username) => {
      const response = await request('POST', '/api/auth/login', null, { username, password: 'password123' });
      return response.body && response.body.token;
    };
    const tokens = {
      cashier: await login('cashier1'),
      scientist: await login('scientist1'),
      inventory: await login('inventory1'),
    };
    check('seeded Data Scientist can authenticate', !!tokens.scientist);

    let response = await request('GET', '/api/ml/status', tokens.cashier);
    check('cashier cannot view ML console status', response.status === 403, `${response.status} ${JSON.stringify(response.body)}`);

    response = await request('GET', '/api/ml/recommendations?customerId=CUST1', tokens.cashier);
    check('recommendations return 503 before deployment', response.status === 503, `${response.status} ${JSON.stringify(response.body)}`);

    response = await request('POST', '/api/ml/train', tokens.scientist, {
      fileName: '../online-retail-fixture.csv', k: 2, topN: 3, catalogMapping: {},
    });
    check('training rejects path traversal dataset names', response.status === 400, `${response.status} ${JSON.stringify(response.body)}`);

    response = await request('POST', '/api/ml/train', tokens.scientist, {
      fileName: 'missing.csv', k: 2, topN: 3, catalogMapping: {},
    });
    check('training rejects unavailable datasets', response.status === 404, `${response.status} ${JSON.stringify(response.body)}`);

    response = await request('POST', '/api/ml/train', tokens.scientist, {
      fileName: 'online-retail-fixture.csv', k: '0x2', topN: 3, catalogMapping: {},
    });
    check('training rejects non-decimal K values', response.status === 400, `${response.status} ${JSON.stringify(response.body)}`);

    response = await request('POST', '/api/ml/train', tokens.scientist, {
      fileName: 'online-retail-fixture.csv', k: 2, topN: 3, catalogMapping: { A: 'NOT_A_PRODUCT' },
    });
    check('training rejects mappings to unknown products', response.status === 400, `${response.status} ${JSON.stringify(response.body)}`);

    response = await request('POST', '/api/ml/train', tokens.scientist, {
      fileName: 'online-retail-fixture.csv',
      k: 2,
      topN: 3,
      catalogMapping: { A: 'P001', B: 'P002', C: 'P003', D: 'P004', E: 'P005' },
    });
    const candidateVersion = response.body && response.body.model && response.body.model.modelVersion;
    check('Data Scientist trains a candidate from the isolated CSV', response.status === 201 && !!candidateVersion, `${response.status} ${JSON.stringify(response.body)}`);
    check('candidate reports genuine import provenance and split metadata',
      !!(response.body && response.body.model && response.body.model.dataset && response.body.model.dataset.sha256 && response.body.model.split && response.body.model.split.testRows > 0),
      JSON.stringify(response.body));

    response = await request('GET', '/api/ml/status', tokens.scientist);
    check('candidate is visible but not deployed', response.status === 200 && response.body.candidate && !response.body.deployed && !response.body.hasDeployedModel, `${response.status} ${JSON.stringify(response.body)}`);

    response = await request('POST', '/api/ml/deploy', tokens.inventory);
    check('non-Data-Scientist cannot deploy a candidate', response.status === 403, `${response.status} ${JSON.stringify(response.body)}`);

    response = await request('POST', '/api/ml/deploy', tokens.scientist);
    check('Data Scientist explicitly deploys the candidate', response.status === 200 && response.body.model && response.body.model.modelVersion === candidateVersion && !!response.body.model.deployedAt, `${response.status} ${JSON.stringify(response.body)}`);

    response = await request('GET', '/api/ml/recommendations?customerId=CUST5&limit=2', tokens.cashier);
    const recommendations = response.body && response.body.recommendations;
    check('cashier receives deployed mapped in-stock recommendations', response.status === 200 && response.body.mappedOnly === true && Array.isArray(recommendations) && recommendations.length > 0 && recommendations.every((item) => item.productId && item.available > 0), `${response.status} ${JSON.stringify(response.body)}`);
    check('cashier recommendation response omits raw external fields and neighbors',
      !!(response.body && !Object.hasOwn(response.body, 'neighbors') && recommendations && recommendations.every((item) => !Object.hasOwn(item, 'stockCode') && !Object.hasOwn(item, 'description'))),
      JSON.stringify(response.body));

    response = await request('GET', '/api/ml/recommendations?customerId=CUST1&storeId=STORE_002', tokens.cashier);
    check('cashier cannot access a different store via query string', response.status === 403, `${response.status} ${JSON.stringify(response.body)}`);

    response = await request('GET', '/api/ml/recommendations?customerId=CUST1&limit=0x2', tokens.cashier);
    check('recommendations reject non-decimal limits', response.status === 400, `${response.status} ${JSON.stringify(response.body)}`);

    response = await request('GET', '/api/ml/recommendations?customerId=UNKNOWN&limit=2', tokens.cashier);
    check('unknown customer uses deployed popularity fallback', response.status === 200 && response.body.fallback === true && response.body.strategy === 'popularity', `${response.status} ${JSON.stringify(response.body)}`);

    response = await request('POST', '/api/checkout', tokens.cashier, {
      items: [{ productId: 'P001', quantity: 1 }],
      paymentMethod: 'CASH',
      customerId: 'CUST1',
      recommendationContext: {
        modelVersion: candidateVersion,
        strategy: 'user-based-knn',
        fallback: false,
        suggestedProductIds: ['P001', 'P001'],
      },
    });
    check('checkout persists bounded normalized recommendation context', response.status === 201 && response.body.receipt && response.body.receipt.customerId === 'CUST1' && response.body.receipt.recommendationContext && response.body.receipt.recommendationContext.suggestedProductIds.length === 1, `${response.status} ${JSON.stringify(response.body)}`);

    response = await request('POST', '/api/checkout', tokens.cashier, {
      items: [{ productId: 'P001', quantity: 1 }], paymentMethod: 'CASH',
      recommendationContext: { modelVersion: candidateVersion, strategy: 'unsupported', fallback: false, suggestedProductIds: [] },
    });
    check('checkout rejects malformed recommendation context', response.status === 400, `${response.status} ${JSON.stringify(response.body)}`);
  } catch (error) {
    fail += 1;
    console.log(`SCRIPT ERROR: ${error.message}`);
  } finally {
    if (server && !server.killed) {
      await new Promise((resolve) => {
        server.once('exit', resolve);
        try { server.kill(); } catch (error) { resolve(); }
      });
    }
    cleanTestFiles();
    console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
})();
