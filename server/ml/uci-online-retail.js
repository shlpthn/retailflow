const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Genuine public dataset loader for UCI Online Retail (CSV export).
// The route validates the filename before this function is called; this module
// additionally returns a SHA-256 fingerprint for report/dataset provenance.
const DATASET_DIR = path.resolve(
  process.env.RETAILFLOW_UCI_DIR || path.join(__dirname, '..', '..', 'data', 'uci'),
);
const REQUIRED_HEADERS = ['InvoiceNo', 'StockCode', 'Description', 'Quantity', 'InvoiceDate', 'UnitPrice', 'CustomerID', 'Country'];
const MAX_ROWS = 200000;

function parseCsv(text) {
  const rows = [];
  let row = []; let field = ''; let inQuotes = false;
  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') pushField();
    else if (ch === '\n') { pushRow(); }
    else if (ch !== '\r') field += ch;
  }
  if (field || row.length) pushRow();
  return rows.filter((r) => r.some((value) => value !== ''));
}

function parseDate(value) {
  const raw = String(value || '').trim();
  const direct = Date.parse(raw);
  if (!Number.isNaN(direct)) return new Date(direct).toISOString();
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (!match) return null;
  let [, day, month, year, hour = '0', minute = '0'] = match;
  if (year.length === 2) year = `20${year}`;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function resolveDatasetFile(fileName) {
  const name = String(fileName || '').trim();
  if (!name || name !== path.basename(name) || !/\.csv$/i.test(name)) {
    throw Object.assign(new Error('fileName must be a CSV file in data/uci'), { statusCode: 400 });
  }
  const resolved = path.resolve(DATASET_DIR, name);
  if (!resolved.startsWith(DATASET_DIR + path.sep)) {
    throw Object.assign(new Error('Invalid dataset path'), { statusCode: 400 });
  }
  if (!fs.existsSync(resolved)) {
    throw Object.assign(new Error(`Dataset not found: data/uci/${name}`), { statusCode: 404 });
  }
  return resolved;
}

function loadOnlineRetailCsv(fileName) {
  const resolved = resolveDatasetFile(fileName);
  const buffer = fs.readFileSync(resolved);
  const table = parseCsv(buffer.toString('utf8').replace(/^﻿/, ''));
  if (!table.length) throw Object.assign(new Error('Dataset is empty'), { statusCode: 400 });
  const headers = table[0].map((h) => String(h).trim());
  const missing = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
  if (missing.length) throw Object.assign(new Error(`Missing required UCI headers: ${missing.join(', ')}`), { statusCode: 400 });
  if (table.length - 1 > MAX_ROWS) throw Object.assign(new Error(`Dataset exceeds ${MAX_ROWS} rows`), { statusCode: 413 });

  const index = Object.fromEntries(headers.map((h, i) => [h, i]));
  const transactions = [];
  const filtered = { missingCustomerId: 0, missingStockCode: 0, cancellationOrReturn: 0, nonPositiveQuantity: 0, nonPositivePrice: 0, invalidDate: 0, malformed: 0 };
  for (const raw of table.slice(1)) {
    const invoiceNo = String(raw[index.InvoiceNo] || '').trim();
    const stockCode = String(raw[index.StockCode] || '').trim();
    const customerId = String(raw[index.CustomerID] || '').trim();
    const quantity = Number(String(raw[index.Quantity] || '').trim());
    const unitPrice = Number(String(raw[index.UnitPrice] || '').trim());
    const invoiceDate = parseDate(raw[index.InvoiceDate]);
    if (!customerId) { filtered.missingCustomerId++; continue; }
    if (!stockCode) { filtered.missingStockCode++; continue; }
    if (/^C/i.test(invoiceNo)) { filtered.cancellationOrReturn++; continue; }
    if (!Number.isFinite(quantity) || quantity <= 0) { filtered.nonPositiveQuantity++; continue; }
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) { filtered.nonPositivePrice++; continue; }
    if (!invoiceDate) { filtered.invalidDate++; continue; }
    transactions.push({
      invoiceNo,
      stockCode,
      description: String(raw[index.Description] || '').trim(),
      quantity,
      invoiceDate,
      unitPrice,
      customerId,
      country: String(raw[index.Country] || '').trim(),
    });
  }
  if (!transactions.length) throw Object.assign(new Error('No usable customer transactions after preprocessing'), { statusCode: 400 });
  return {
    fileName: path.basename(resolved),
    filePath: path.relative(path.resolve(__dirname, '..', '..'), resolved).replace(/\\/g, '/'),
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
    sourceRowCount: table.length - 1,
    usableRowCount: transactions.length,
    filteredRowCount: table.length - 1 - transactions.length,
    filtered,
    transactions,
    dataset: {
      name: 'UCI Online Retail',
      license: 'CC BY 4.0',
      url: 'https://archive.ics.uci.edu/dataset/352/online+retail',
      importedAt: new Date().toISOString(),
    },
  };
}

module.exports = { DATASET_DIR, REQUIRED_HEADERS, parseCsv, parseDate, resolveDatasetFile, loadOnlineRetailCsv };
