const bcrypt = require('bcryptjs');

// ============================================================================
// DATA LAYER
// ----------------------------------------------------------------------------
// In-memory for this reference implementation, but modeled exactly like the
// relational schema from Section 34 Step 3, so swapping in Postgres/SQLite
// later is a mechanical change, not an architectural one.
// ============================================================================

let nextId = 1000;
const id = (prefix) => `${prefix}${nextId++}`;

const stores = [
  { id: 'STORE_001', name: 'Downtown Store', address: '12 Market St' },
  { id: 'STORE_002', name: 'Uptown Store', address: '88 Fifth Ave' },
];

const users = [
  { id: 'U001', name: 'Cara Chen', username: 'cashier1', role: 'CASHIER', storeId: 'STORE_001', disabled: false },
  { id: 'U002', name: 'Ivan Ruiz', username: 'inventory1', role: 'INVENTORY_STAFF', storeId: 'STORE_001', disabled: false },
  { id: 'U003', name: 'Priya Nair', username: 'inventory2', role: 'INVENTORY_STAFF', storeId: 'STORE_002', disabled: false },
  { id: 'U004', name: 'Sam Okafor', username: 'manager1', role: 'STORE_MANAGER', storeId: 'STORE_001', disabled: false },
  { id: 'U005', name: 'Lena Kim', username: 'manager2', role: 'STORE_MANAGER', storeId: 'STORE_002', disabled: false },
  { id: 'U006', name: 'Grace Adeyemi', username: 'ho1', role: 'HEAD_OFFICE_MANAGER', storeId: null, disabled: false },
  { id: 'U007', name: 'Tom Becker', username: 'admin1', role: 'SYSTEM_ADMIN', storeId: null, disabled: false },
];
// demo password for every seed user: "password123"
const passwordHash = bcrypt.hashSync('password123', 8);
users.forEach((u) => { u.passwordHash = passwordHash; });

const products = [
  { id: 'P001', name: 'Classic T-Shirt', barcode: '0001', price: 15.0, image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT4So_yg7ieKf3fkLdNMDtMnMP7czD-cIzfsLvR3Ndxug&s=10' },
  { id: 'P002', name: 'Denim Jeans', barcode: '0002', price: 45.0, image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTjfelHHXu5UrqET7srYK7PEOCmAjx8n8XjLkVwoTUhuw&s=10' },
  { id: 'P003', name: 'Running Sneakers', barcode: '0003', price: 65.0, image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR8JqARu8g08JfSro--RtaeRSYn6A2rswM04AkTOJoQ4Q&s=10' },
  { id: 'P004', name: 'Rain Jacket', barcode: '0004', price: 80.0, image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRQ0oNOBrfJAY-A6ovqMuFGY4ituaThQa_lPTdG68iTfg&s=10' },
  { id: 'P005', name: 'Baseball Cap', barcode: '0005', price: 12.0, image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSORiNRvXwy8Oh_yHzdwpRobQTr7Sj2DvyF6ApRhnQn7A&s=10' },
];

// inventory: one row per (storeId, productId)
const inventory = [
  { storeId: 'STORE_001', productId: 'P001', quantity: 40, threshold: 15 },
  { storeId: 'STORE_001', productId: 'P002', quantity: 8, threshold: 10 },
  { storeId: 'STORE_001', productId: 'P003', quantity: 22, threshold: 10 },
  { storeId: 'STORE_001', productId: 'P004', quantity: 3, threshold: 5 },
  { storeId: 'STORE_001', productId: 'P005', quantity: 50, threshold: 10 },
  { storeId: 'STORE_002', productId: 'P001', quantity: 30, threshold: 15 },
  { storeId: 'STORE_002', productId: 'P002', quantity: 25, threshold: 10 },
  { storeId: 'STORE_002', productId: 'P003', quantity: 5, threshold: 10 },
  { storeId: 'STORE_002', productId: 'P004', quantity: 18, threshold: 5 },
  { storeId: 'STORE_002', productId: 'P005', quantity: 40, threshold: 10 },
];

const promotions = [
  {
    id: 'PROMO001', name: 'Autumn 10% Off', code: 'SAVE10', type: 'PERCENT', value: 10,
    active: true, applicableProductIds: null, applicableStoreIds: null,
    validFrom: '2026-01-01', validTo: '2026-12-31',
  },
];

const sales = [];          // { id, storeId, cashierId, items:[{productId,qty,unitPrice}], subtotal, discount, total, promotionCode, paymentMethod, createdAt }
const stockMovements = []; // { id, storeId, productId, type: RECEIVE|DISPATCH|SALE|TRANSFER_IN|TRANSFER_OUT, quantity, actorId, note, createdAt }
const stockRequests = [];  // { id, storeId, productId, quantity, status, requestedBy, createdAt, history:[], fulfillment:{type, sourceStoreId?, transferId?, factoryOrderId?} }
const transfers = [];      // { id, stockRequestId, productId, quantity, sourceStoreId, destinationStoreId, status, createdAt }
const factoryOrders = [];  // { id, stockRequestId, productId, quantity, destinationStoreId, status, createdAt }
const auditLogs = [];      // { id, userId, userName, role, action, resource, storeId, before, after, createdAt }
const notifications = [];  // { id, storeId, type, message, createdAt, read }

function logAudit({ user, action, resource, storeId, before, after }) {
  auditLogs.push({
    id: id('LOG'),
    userId: user ? user.id : null,
    userName: user ? user.name : 'system',
    role: user ? user.role : 'SYSTEM',
    action,
    resource,
    storeId: storeId || null,
    before: before ?? null,
    after: after ?? null,
    createdAt: new Date().toISOString(),
  });
}

function notify(storeId, type, message) {
  notifications.push({ id: id('NOTIF'), storeId, type, message, createdAt: new Date().toISOString(), read: false });
}

// ---- accessors -------------------------------------------------------------
const getStore = (storeId) => stores.find((s) => s.id === storeId);
const getAllStores = () => stores;
const getUserByUsername = (username) => users.find((u) => u.username === username);
const getUserById = (uid) => users.find((u) => u.id === uid);
const getProduct = (pid) => products.find((p) => p.id === pid);
const getAllProducts = () => products;
const getInventoryRow = (storeId, productId) =>
  inventory.find((r) => r.storeId === storeId && r.productId === productId);
const getInventoryForStore = (storeId) => inventory.filter((r) => r.storeId === storeId);

module.exports = {
  id,
  stores, users, products, inventory, promotions, sales,
  stockMovements, stockRequests, transfers, factoryOrders, auditLogs, notifications,
  logAudit, notify,
  getStore, getAllStores, getUserByUsername, getUserById,
  getProduct, getAllProducts, getInventoryRow, getInventoryForStore,
};
