// ============================================================================
// RetailFlow frontend — a plain SPA (no build step). Its ONLY job is to make
// the right things reachable for a role; it does not enforce anything.
// Every mutation and every data fetch is re-checked by the API. If you edit
// this file to expose a hidden button, the server will still 403 the call —
// that split is intentional (see server/permissions.js).
// ============================================================================

const state = {
  token: null,
  user: null,       // { id, name, role, storeId, scope, permissions[] }
  selectedStoreId: null, // Head Office Manager's store-selector choice
  stores: [],
  cart: [],         // checkout in-progress cart
  selectedPayment: null,
  selectedPromoCode: null,
};

const app = document.getElementById('app');

// ---------------------------------------------------------------------------
// API helper
// ---------------------------------------------------------------------------
async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const res = await fetch(`/api${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null;
  try { data = await res.json(); } catch (e) { /* no body */ }
  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

function has(perm) { return !!(state.user && state.user.permissions.includes(perm)); }
function hasAny(...perms) { return perms.some(has); }

function toast(message, kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function fmtMoney(n) { return `$${Number(n || 0).toFixed(2)}`; }
function fmtDate(iso) { return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// ---------------------------------------------------------------------------
// Auth boot
// ---------------------------------------------------------------------------
async function boot() {
  state.token = sessionStorage.getItem('rf_token');
  if (state.token) {
    try {
      state.user = await api('/auth/me');
    } catch (e) {
      state.token = null;
      sessionStorage.removeItem('rf_token');
    }
  }
  if (!state.token) {
    window.onhashchange = () => {
      if (location.hash === '#/signup') renderSignup();
      else renderLogin();
    };
    if (location.hash === '#/signup') return renderSignup();
    return renderLogin();
  }
  if (hasAny('STORE_VIEW')) {
    try { state.stores = await api('/stores'); } catch (e) { /* ignore */ }
  }
  if (state.user.storeId) state.selectedStoreId = state.user.storeId;
  else if (state.stores.length) state.selectedStoreId = state.stores[0].id;

  if (!location.hash || location.hash === '#/login' || location.hash === '#/signup') location.hash = defaultRoute();
  window.onhashchange = renderShell;
  renderShell();
}

function defaultRoute() {
  const r = state.user.role;
  if (r === 'CASHIER') return '#/checkout';
  if (r === 'INVENTORY_STAFF') return '#/inventory';
  if (r === 'STORE_MANAGER') return '#/dashboard';
  if (r === 'HEAD_OFFICE_MANAGER') return '#/home';
  if (r === 'SYSTEM_ADMIN') return '#/users';
  return '#/';
}

const ROLE_LABEL = {
  CASHIER: 'Cashier',
  INVENTORY_STAFF: 'Inventory Staff',
  STORE_MANAGER: 'Store Manager',
  HEAD_OFFICE_MANAGER: 'Head Office Manager',
  SYSTEM_ADMIN: 'System Admin',
};

const DEMO_ACCOUNTS = [
  ['cashier1', 'Cashier · Downtown'],
  ['inventory1', 'Inventory Staff · Downtown'],
  ['manager1', 'Store Manager · Downtown'],
  ['manager2', 'Store Manager · Uptown'],
  ['ho1', 'Head Office Manager'],
  ['admin1', 'System Admin'],
];

function navToLogin() {
  if (location.hash === '#/login' || !location.hash) renderLogin();
  else location.hash = '#/login';
}

function navToSignup() {
  if (location.hash === '#/signup') renderSignup();
  else location.hash = '#/signup';
}

function renderLogin() {
  app.innerHTML = `
    <div class="login-screen">
      <div class="login-card">
        <div class="login-brand"><span class="mark"></span><h1>RetailFlow</h1></div>
        <p class="login-sub">Sign in to your store console.</p>
        <div id="login-error"></div>
        <form id="login-form">
          <div class="field"><label>Username</label><input name="username" autocomplete="username" required /></div>
          <div class="field"><label>Password</label><input name="password" type="password" autocomplete="current-password" required /></div>
          <button class="btn btn-primary" type="submit">Sign in</button>
          <button class="btn btn-ghost" id="to-signup-btn" type="button" style="width:100%;margin-top:10px;">Sign up</button>
        </form>
        <div class="demo-accounts">
          <p>Demo accounts — password123</p>
          <div class="demo-list">
            ${DEMO_ACCOUNTS.map(([u, label]) => `<button type="button" data-user="${u}"><b>${u}</b> — ${label}</button>`).join('')}
          </div>
        </div>
      </div>
    </div>`;

  document.getElementById('to-signup-btn').addEventListener('click', navToSignup);

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    await doLogin(fd.get('username'), fd.get('password'));
  });
  document.querySelectorAll('.demo-list button').forEach((b) => {
    b.addEventListener('click', () => doLogin(b.dataset.user, 'password123'));
  });
}

async function renderSignup() {
  let stores = [];
  try {
    stores = await api('/auth/stores');
  } catch (e) {
    stores = [];
  }
  const roles = Object.keys(ROLE_LABEL);

  app.innerHTML = `
    <div class="login-screen">
      <div class="login-card">
        <div class="login-brand"><span class="mark"></span><h1>RetailFlow</h1></div>
        <p class="login-sub">Create your account to get started.</p>
        <div id="signup-error"></div>
        <form id="signup-form">
          <div class="field"><label>Full Name</label><input name="name" id="s-name" placeholder="Cara Chen" required /></div>
          <div class="field"><label>Username</label><input name="username" id="s-username" placeholder="cashier2" autocomplete="username" required /></div>
          <div class="field"><label>Role</label><select name="role" id="s-role">${roles.map((r) => `<option value="${r}">${ROLE_LABEL[r]}</option>`).join('')}</select></div>
          <div class="field" id="s-store-field"><label>Store</label><select name="storeId" id="s-store">${stores.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></div>
          <div class="field"><label>Password</label><input name="password" id="s-password" type="password" autocomplete="new-password" placeholder="Password" required /></div>
          <button class="btn btn-primary" type="submit">Sign up</button>
          <button class="btn btn-ghost" id="to-login-btn" type="button" style="width:100%;margin-top:10px;">Back to Sign in</button>
        </form>
      </div>
    </div>`;

  const roleSel = document.getElementById('s-role');
  const storeField = document.getElementById('s-store-field');
  function syncStoreField() {
    storeField.style.display = ['CASHIER', 'INVENTORY_STAFF', 'STORE_MANAGER'].includes(roleSel.value) ? '' : 'none';
  }
  roleSel.addEventListener('change', syncStoreField);
  syncStoreField();

  document.getElementById('to-login-btn').addEventListener('click', navToLogin);

  document.getElementById('signup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('s-name').value;
    const username = document.getElementById('s-username').value;
    const role = roleSel.value;
    const isStoreLevel = ['CASHIER', 'INVENTORY_STAFF', 'STORE_MANAGER'].includes(role);
    const storeId = isStoreLevel ? document.getElementById('s-store').value : undefined;
    const password = document.getElementById('s-password').value;

    try {
      await api('/auth/signup', {
        method: 'POST',
        body: { name, username, role, storeId, password },
      });
      toast('Account created successfully! Please sign in.', 'ok');
      navToLogin();
    } catch (err) {
      const box = document.getElementById('signup-error');
      if (box) box.innerHTML = `<div class="error-banner">${esc(err.message)}</div>`;
    }
  });
}

async function doLogin(username, password) {
  try {
    const { token, user } = await api('/auth/login', { method: 'POST', body: { username, password } });
    state.token = token; state.user = user;
    sessionStorage.setItem('rf_token', token);
    document.getElementById('login-error') && (document.getElementById('login-error').innerHTML = '');
    boot();
  } catch (e) {
    const box = document.getElementById('login-error');
    if (box) box.innerHTML = `<div class="error-banner">${esc(e.message)}</div>`;
  }
}

function logout() {
  state.token = null; state.user = null;
  sessionStorage.removeItem('rf_token');
  location.hash = '';
  boot();
}

// ---------------------------------------------------------------------------
// Shell: sidebar (per Section 24) + topbar + routed page content
// ---------------------------------------------------------------------------
const NAV_BY_ROLE = {
  CASHIER: [{ key: 'checkout', label: 'Checkout', icon: '🧾' }],
  INVENTORY_STAFF: [
    { key: 'inventory', label: 'Inventory', icon: '📦' },
    { key: 'products', label: 'Products', icon: '🏷️' },
  ],
  STORE_MANAGER: [
    { key: 'dashboard', label: 'Dashboard', icon: '📊' },
    { key: 'sales', label: 'Sales', icon: '💵' },
    { key: 'inventory', label: 'Inventory', icon: '📦' },
    { key: 'products', label: 'Products', icon: '🏷️' },
  ],
  HEAD_OFFICE_MANAGER: [
    { key: 'home', label: 'Home', icon: '🏢' },
    { key: 'stores', label: 'Stores', icon: '🏬' },
    { key: 'sales', label: 'Sales', icon: '💵' },
    { key: 'inventory', label: 'Inventory', icon: '📦' },
    { key: 'products', label: 'Products', icon: '🏷️' },
    { key: 'promotions', label: 'Promotions', icon: '🎟️' },
    { key: 'stock-requests', label: 'Stock Requests', icon: '🔄' },
    { key: 'audit', label: 'Audit Log', icon: '🗂️' },
  ],
  SYSTEM_ADMIN: [
    { key: 'users', label: 'Users', icon: '👤' },
    { key: 'roles', label: 'Roles & Permissions', icon: '🔐' },
    { key: 'stores', label: 'Stores', icon: '🏬' },
    { key: 'audit', label: 'Audit Log', icon: '🗂️' },
  ],
};

const PAGE_TITLES = {
  checkout: 'Checkout', inventory: 'Inventory', products: 'Products', dashboard: 'Store Dashboard',
  sales: 'Sales', home: 'Organization Overview', stores: 'Stores', promotions: 'Promotions',
  'stock-requests': 'Stock Requests', audit: 'Audit Log', users: 'Users', roles: 'Roles & Permissions',
  'store-detail': 'Store',
};

function currentRoute() {
  const hash = (location.hash || '').replace(/^#\//, '');
  const [key, ...rest] = hash.split('/');
  return { key: key || '', param: rest.join('/') || null };
}

function renderShell() {
  const nav = NAV_BY_ROLE[state.user.role] || [];
  const { key, param } = currentRoute();
  const activeKey = key || defaultRoute().replace('#/', '').split('/')[0];

  const showStoreSelector = state.user.role === 'HEAD_OFFICE_MANAGER' &&
    ['sales', 'inventory', 'products', 'store-detail'].includes(activeKey);

  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="sidebar-brand"><span class="mark"></span><span>RetailFlow</span></div>
        <nav>${nav.map((n) => `
          <button class="nav-item ${n.key === activeKey ? 'active' : ''}" data-nav="${n.key}">
            <span class="ico">${n.icon}</span>${n.label}
          </button>`).join('')}
        </nav>
        <div class="sidebar-foot">
          <div class="role-chip">${ROLE_LABEL[state.user.role]}</div>
          <div class="who">${esc(state.user.name)}</div>
          <div class="who-sub">${state.user.storeId ? esc(storeName(state.user.storeId)) : (state.user.scope === 'ALL_STORES' ? 'All stores' : 'System-wide')}</div>
          <button class="btn btn-ghost btn-sm" id="logout-btn" style="width:100%;color:#EDEFF2;border-color:#2B303A;">Sign out</button>
        </div>
      </aside>
      <div class="main">
        <div class="topbar">
          <h2>${activeKey === 'store-detail' ? esc(storeName(state.selectedStoreId)) + ' — Dashboard' : (PAGE_TITLES[activeKey] || '')}</h2>
          ${showStoreSelector ? `
            <div class="store-selector">
              <span>Store:</span>
              <select id="store-select">
                ${state.stores.map((s) => `<option value="${s.id}" ${s.id === state.selectedStoreId ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
              </select>
            </div>` : ''}
        </div>
        <div class="content" id="content"><div class="empty">Loading…</div></div>
      </div>
    </div>`;

  document.getElementById('logout-btn').addEventListener('click', logout);
  document.querySelectorAll('[data-nav]').forEach((b) => b.addEventListener('click', () => { location.hash = `#/${b.dataset.nav}`; }));
  const sel = document.getElementById('store-select');
  if (sel) sel.addEventListener('change', () => { state.selectedStoreId = sel.value; renderPage(); });

  renderPage();
}

function storeName(id) { return (state.stores.find((s) => s.id === id) || {}).name || id; }

async function renderPage() {
  const content = document.getElementById('content');
  const { key, param } = currentRoute();
  const page = key || defaultRoute().replace('#/', '').split('/')[0];
  const pages = {
    checkout: PageCheckout, inventory: PageInventory, products: PageProducts,
    dashboard: (r) => PageDashboard(state.user.storeId, r), sales: PageSales,
    home: PageHome, stores: PageStores, 'store-detail': (r) => PageDashboard(state.selectedStoreId || param, r),
    promotions: PagePromotions, 'stock-requests': PageStockRequests,
    audit: PageAudit, users: PageUsers, roles: PageRoles,
  };
  const renderer = pages[page];
  if (!renderer) { content.innerHTML = `<div class="empty">Page not found.</div>`; return; }
  try {
    await renderer(content);
  } catch (e) {
    if (e.status === 403) {
      content.innerHTML = `<div class="forbidden"><h2>Not permitted</h2><p>Your role doesn't have access to this. (${esc(e.message)})</p></div>`;
    } else {
      content.innerHTML = `<div class="forbidden"><h2>Something went wrong</h2><p>${esc(e.message)}</p></div>`;
    }
  }
}

boot();

// ============================================================================
// PAGE: Checkout — exclusive to Cashier (CHECKOUT_VIEW/CHECKOUT_CREATE)
// ============================================================================
async function PageCheckout(root) {
  const [products, promos] = await Promise.all([api('/checkout/products'), api('/checkout/promotions')]);
  state.cart = state.cart || [];

  function cartLine(productId) { return state.cart.find((l) => l.productId === productId); }
  function subtotal() { return state.cart.reduce((s, l) => s + l.price * l.qty, 0); }
  function activePromo() { return state.selectedPromoCode ? promos.find((p) => p.code === state.selectedPromoCode) : null; }
  function discount() {
    const p = activePromo(); if (!p) return 0;
    return p.type === 'PERCENT' ? subtotal() * (p.value / 100) : p.value;
  }

  function draw() {
    root.innerHTML = `
      <div class="checkout-layout">
        <div class="stack" style="min-height:0;">
          <div class="scanner-box">
            <input id="scan-input" placeholder="Scan or type a barcode, then press Enter" autofocus />
          </div>
          <div class="product-grid" id="product-grid">
            ${products.map((p) => `
              <div class="product-tile" data-add="${p.productId}">
                <div class="emoji">${p.image}</div>
                <div class="name">${esc(p.name)}</div>
                <div class="price mono">${fmtMoney(p.price)}</div>
                <div class="avail">${p.available} in stock</div>
              </div>`).join('') || `<div class="empty">No products in stock at this store.</div>`}
          </div>
        </div>
        <div class="cart-panel">
          <div class="section-head" style="padding:14px 14px 0;">
            <h3>Order summary</h3>
            ${state.cart.length ? `<button class="btn btn-ghost btn-sm" id="clear-cart">Clear</button>` : ''}
          </div>
          <div class="cart-items">
            ${state.cart.length ? state.cart.map((l) => `
              <div class="cart-line">
                <div><div>${esc(l.name)}</div><div class="mono muted">${fmtMoney(l.price)} ea</div></div>
                <div class="qty-ctl">
                  <button data-dec="${l.productId}">−</button>
                  <span class="mono">${l.qty}</span>
                  <button data-inc="${l.productId}">+</button>
                </div>
              </div>`).join('') : `<div class="empty">Cart is empty — scan or tap a product.</div>`}
          </div>
          <div style="padding:0 14px;">
            <div class="field" style="margin-bottom:10px;">
              <label>Promotion code</label>
              <input id="promo-input" placeholder="e.g. SAVE10" value="${esc(state.selectedPromoCode || '')}" />
            </div>
          </div>
          <div class="cart-totals">
            <div class="line"><span>Subtotal</span><span class="mono">${fmtMoney(subtotal())}</span></div>
            <div class="line"><span>Discount ${activePromo() ? `(${activePromo().code})` : ''}</span><span class="mono">−${fmtMoney(discount())}</span></div>
            <div class="line grand"><span>Total</span><span class="mono">${fmtMoney(Math.max(0, subtotal() - discount()))}</span></div>
          </div>
          <div class="payment-methods">
            ${['Card', 'Cash', 'Mobile Wallet'].map((m) => `<button data-pay="${m}" class="${state.selectedPayment === m ? 'selected' : ''}">${m}</button>`).join('')}
          </div>
          <div style="padding:0 14px 14px;">
            <button class="btn btn-primary" id="checkout-btn" style="width:100%;" ${!state.cart.length || !state.selectedPayment ? 'disabled' : ''}>
              Complete checkout · ${fmtMoney(Math.max(0, subtotal() - discount()))}
            </button>
          </div>
        </div>
      </div>`;
    wire();
  }

  function wire() {
    root.querySelectorAll('[data-add]').forEach((el) => el.addEventListener('click', () => {
      const p = products.find((x) => x.productId === el.dataset.add);
      addToCart(p);
    }));
    document.getElementById('scan-input').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const val = e.target.value.trim(); e.target.value = '';
      const p = products.find((x) => x.barcode === val || x.productId === val);
      if (p) addToCart(p); else toast(`No product matches barcode "${val}"`, 'bad');
    });
    root.querySelectorAll('[data-inc]').forEach((el) => el.addEventListener('click', () => changeQty(el.dataset.inc, 1)));
    root.querySelectorAll('[data-dec]').forEach((el) => el.addEventListener('click', () => changeQty(el.dataset.dec, -1)));
    const clearBtn = document.getElementById('clear-cart');
    if (clearBtn) clearBtn.addEventListener('click', () => { state.cart = []; draw(); });
    document.getElementById('promo-input').addEventListener('change', (e) => { state.selectedPromoCode = e.target.value.trim().toUpperCase() || null; draw(); });
    root.querySelectorAll('[data-pay]').forEach((el) => el.addEventListener('click', () => { state.selectedPayment = el.dataset.pay; draw(); }));
    const goBtn = document.getElementById('checkout-btn');
    if (goBtn) goBtn.addEventListener('click', doCheckout);
  }

  function addToCart(p) {
    const line = cartLine(p.productId);
    if (line) { if (line.qty < p.available) line.qty += 1; else toast('No more stock available', 'bad'); }
    else state.cart.push({ productId: p.productId, name: p.name, price: p.price, qty: 1 });
    draw();
  }
  function changeQty(productId, delta) {
    const line = cartLine(productId);
    line.qty += delta;
    if (line.qty <= 0) state.cart = state.cart.filter((l) => l.productId !== productId);
    draw();
  }

  async function doCheckout() {
    try {
      const { receipt } = await api('/checkout', {
        method: 'POST',
        body: {
          items: state.cart.map((l) => ({ productId: l.productId, quantity: l.qty })),
          promotionCode: state.selectedPromoCode,
          paymentMethod: state.selectedPayment,
        },
      });
      showReceipt(receipt);
      state.cart = []; state.selectedPromoCode = null; state.selectedPayment = null;
    } catch (e) { toast(e.message, 'bad'); }
  }

  function showReceipt(sale) {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal">
        <h3>Sale complete</h3>
        <div class="receipt">RetailFlow — ${esc(storeName(sale.storeId))}
Receipt ${sale.id}
Cashier: ${esc(sale.cashierName)}
${new Date(sale.createdAt).toLocaleString()}
------------------------------
${sale.items.map((i) => `${i.quantity} x ${i.name.padEnd(18)} ${fmtMoney(i.unitPrice * i.quantity)}`).join('\n')}
------------------------------
Subtotal        ${fmtMoney(sale.subtotal)}
Discount        -${fmtMoney(sale.discount)}${sale.promotionCode ? ` (${sale.promotionCode})` : ''}
TOTAL           ${fmtMoney(sale.total)}
Paid via ${sale.paymentMethod}
Thank you!</div>
        <div class="modal-actions"><button class="btn btn-primary" id="close-receipt">New sale</button></div>
      </div>`;
    document.body.appendChild(backdrop);
    document.getElementById('close-receipt').addEventListener('click', () => { backdrop.remove(); renderPage(); });
  }

  draw();
}

// ============================================================================
// PAGE: Inventory — ONE shared page (Inventory Staff / Store Manager / HO).
// Same structure for everyone; only the action buttons differ, driven by
// req.user.permissions from /auth/me. Every button's action is independently
// re-checked by the backend.
// ============================================================================
async function PageInventory(root) {
  const storeId = state.user.storeId || state.selectedStoreId;
  const [inv, transfers] = await Promise.all([
    api(`/inventory?storeId=${encodeURIComponent(storeId)}`),
    hasAny('INVENTORY_VIEW', 'STOCK_REQUEST_APPROVE') ? api('/transfers') : Promise.resolve([]),
  ]);

  const outgoing = transfers.filter((t) => t.sourceStoreId === storeId && t.status === 'PENDING_DISPATCH');
  const incoming = transfers.filter((t) => t.destinationStoreId === storeId && t.status === 'IN_TRANSIT');
  let factoryOrders = [];
  if (has('INVENTORY_RECEIVE')) {
    try { factoryOrders = (await api('/transfers/factory-orders')).filter((o) => o.status === 'ORDERED'); } catch (e) {}
  }

  let activityItems = []; // must be declared before the template below calls renderActivityList()

  root.innerHTML = `
    <div class="grid-2">
      <div class="card">
        <div class="section-head">
          <h3>${esc(inv.storeName)} — stock on hand</h3>
          <div class="row">
            ${has('INVENTORY_RECEIVE') ? `<button class="btn btn-dark btn-sm" id="add-stock-btn">+ Add Stock</button>` : ''}
            ${has('INVENTORY_DISPATCH') ? `<button class="btn btn-ghost btn-sm" id="dispatch-stock-btn">Dispatch Stock</button>` : ''}
            ${has('INVENTORY_REQUEST') || has('STOCK_REQUEST_CREATE') ? `<button class="btn btn-primary btn-sm" id="request-stock-btn">Request Stock</button>` : ''}
          </div>
        </div>
        <table>
          <thead><tr><th></th><th>Product</th><th>Barcode</th><th class="right">Qty</th><th>Status</th></tr></thead>
          <tbody>
            ${inv.rows.map((r) => `
              <tr class="row-hover">
                <td style="font-size:20px;">${r.image || ''}</td>
                <td>${esc(r.name)}</td>
                <td class="mono muted">${esc(r.barcode)}</td>
                <td class="right mono">${r.quantity}</td>
                <td>${statusPill(r.status)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div class="stack">
        <div class="card">
          <div class="card-title">Activity &amp; alerts</div>
          ${renderActivityList(inv.activityPanel, outgoing, incoming, factoryOrders)}
        </div>
      </div>
    </div>`;

  function statusPill(s) {
    if (s === 'OUT_OF_STOCK') return `<span class="pill pill-bad">Out of stock</span>`;
    if (s === 'LOW_STOCK') return `<span class="pill pill-warn">Low stock</span>`;
    return `<span class="pill pill-ok">OK</span>`;
  }

  function renderActivityList(panel, outgoing, incoming, factoryOrders) {
    const items = [];
    panel.lowStockAlerts.forEach((r) => items.push({ text: `Low stock: ${r.name} (${r.quantity} left)` }));
    panel.pendingRequests.forEach((r) => items.push({ text: `Stock request ${r.id.slice(-4)} for ${r.quantity}x is ${r.status.replace(/_/g, ' ').toLowerCase()}` }));
    outgoing.forEach((t) => items.push({ text: `Dispatch ${t.quantity}x ${t.productName} → ${t.destinationStoreName}`, action: has('TRANSFER_DISPATCH') ? { label: 'Dispatch', fn: () => doTransferAction(t.id, 'dispatch') } : null }));
    incoming.forEach((t) => items.push({ text: `Incoming ${t.quantity}x ${t.productName} from ${t.sourceStoreName}`, action: has('TRANSFER_RECEIVE') ? { label: 'Receive', fn: () => doTransferAction(t.id, 'receive') } : null }));
    factoryOrders.forEach((o) => items.push({ text: `Factory order: ${o.quantity}x ${o.productName} arriving`, action: has('INVENTORY_RECEIVE') ? { label: 'Mark received', fn: () => doFactoryReceive(o.id) } : null }));
    activityItems = items;
    if (!items.length) return `<div class="empty">No alerts right now.</div>`;
    return items.map((it, i) => `
      <div class="notif-item spread">
        <span>${esc(it.text)}</span>
        ${it.action ? `<button class="btn btn-ghost btn-sm" data-act="${i}">${it.action.label}</button>` : ''}
      </div>`).join('');
  }

  async function doTransferAction(id, action) {
    try { await api(`/transfers/${id}/${action}`, { method: 'POST' }); toast('Updated', 'ok'); renderPage(); }
    catch (e) { toast(e.message, 'bad'); }
  }
  async function doFactoryReceive(id) {
    try { await api(`/transfers/factory-orders/${id}/receive`, { method: 'POST' }); toast('Received into inventory', 'ok'); renderPage(); }
    catch (e) { toast(e.message, 'bad'); }
  }

  root.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => activityItems[b.dataset.act].action.fn()));

  const addBtn = document.getElementById('add-stock-btn');
  if (addBtn) addBtn.addEventListener('click', () => openStockModal('add-stock', 'Add Stock', inv.rows));
  const dispatchBtn = document.getElementById('dispatch-stock-btn');
  if (dispatchBtn) dispatchBtn.addEventListener('click', () => openStockModal('dispatch-stock', 'Dispatch Stock', inv.rows));
  const reqBtn = document.getElementById('request-stock-btn');
  if (reqBtn) reqBtn.addEventListener('click', () => openRequestModal(inv.rows));

  function openStockModal(endpoint, title, rows) {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal">
        <h3>${title}</h3>
        <div class="scanner-box"><input id="barcode-in" placeholder="Scan barcode…" /></div>
        <div class="field"><label>Product</label>
          <select id="product-sel">${rows.map((r) => `<option value="${r.productId}" data-barcode="${r.barcode}">${esc(r.name)} (${esc(r.barcode)})</option>`).join('')}</select>
        </div>
        <div class="field"><label>Quantity</label><input id="qty-in" type="number" min="1" value="1" /></div>
        <div class="modal-actions">
          <button class="btn btn-ghost" id="cancel">Cancel</button>
          <button class="btn btn-primary" id="confirm">Confirm</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);
    document.getElementById('barcode-in').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const val = e.target.value.trim();
      const opt = [...backdrop.querySelectorAll('option')].find((o) => o.dataset.barcode === val);
      if (opt) document.getElementById('product-sel').value = opt.value; else toast('Barcode not found', 'bad');
    });
    document.getElementById('cancel').addEventListener('click', () => backdrop.remove());
    document.getElementById('confirm').addEventListener('click', async () => {
      try {
        await api(`/inventory/${endpoint}`, { method: 'POST', body: { productId: document.getElementById('product-sel').value, quantity: Number(document.getElementById('qty-in').value) } });
        toast(`${title} recorded`, 'ok'); backdrop.remove(); renderPage();
      } catch (e) { toast(e.message, 'bad'); }
    });
  }

  function openRequestModal(rows) {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal">
        <h3>Request Stock</h3>
        <div class="field"><label>Product</label>
          <select id="product-sel">${rows.map((r) => `<option value="${r.productId}">${esc(r.name)} — currently ${r.quantity}</option>`).join('')}</select>
        </div>
        <div class="field"><label>Quantity requested</label><input id="qty-in" type="number" min="1" value="20" /></div>
        <div class="field"><label>Note (optional)</label><input id="note-in" /></div>
        <div class="modal-actions">
          <button class="btn btn-ghost" id="cancel">Cancel</button>
          <button class="btn btn-primary" id="confirm">Send request</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);
    document.getElementById('cancel').addEventListener('click', () => backdrop.remove());
    document.getElementById('confirm').addEventListener('click', async () => {
      try {
        await api('/stock-requests', { method: 'POST', body: { productId: document.getElementById('product-sel').value, quantity: Number(document.getElementById('qty-in').value), note: document.getElementById('note-in').value || null } });
        toast('Stock request sent to Head Office', 'ok'); backdrop.remove(); renderPage();
      } catch (e) { toast(e.message, 'bad'); }
    });
  }
}

// ============================================================================
// PAGE: Products — shared reference page; management gated on PRODUCT_MANAGE
// ============================================================================
async function PageProducts(root) {
  const products = await api('/products');
  const canManage = has('PRODUCT_MANAGE');

  root.innerHTML = `
    <div class="card">
      <div class="section-head">
        <h3>Product catalog</h3>
        ${canManage ? `<button class="btn btn-primary btn-sm" id="new-product">+ New product</button>` : ''}
      </div>
      <table>
        <thead><tr><th></th><th>Name</th><th>Barcode</th><th class="right">Price</th>${canManage ? '<th></th>' : ''}</tr></thead>
        <tbody>
          ${products.map((p) => `
            <tr class="row-hover">
              <td style="font-size:22px;">${p.image}</td>
              <td>${esc(p.name)}</td>
              <td class="mono muted">${esc(p.barcode)}</td>
              <td class="right mono">${fmtMoney(p.price)}</td>
              ${canManage ? `<td class="right"><button class="btn btn-ghost btn-sm" data-del="${p.id}">Delete</button></td>` : ''}
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  if (canManage) {
    document.getElementById('new-product').addEventListener('click', () => {
      const backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop';
      backdrop.innerHTML = `
        <div class="modal"><h3>New product</h3>
          <div class="field"><label>Name</label><input id="p-name" /></div>
          <div class="field"><label>Barcode</label><input id="p-barcode" /></div>
          <div class="field"><label>Price</label><input id="p-price" type="number" step="0.01" /></div>
          <div class="field"><label>Icon (emoji, optional)</label><input id="p-image" placeholder="📦" /></div>
          <div class="modal-actions"><button class="btn btn-ghost" id="cancel">Cancel</button><button class="btn btn-primary" id="confirm">Create</button></div>
        </div>`;
      document.body.appendChild(backdrop);
      document.getElementById('cancel').addEventListener('click', () => backdrop.remove());
      document.getElementById('confirm').addEventListener('click', async () => {
        try {
          await api('/products', { method: 'POST', body: { name: document.getElementById('p-name').value, barcode: document.getElementById('p-barcode').value, price: Number(document.getElementById('p-price').value), image: document.getElementById('p-image').value || undefined } });
          toast('Product created', 'ok'); backdrop.remove(); renderPage();
        } catch (e) { toast(e.message, 'bad'); }
      });
    });
    root.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      try { await api(`/products/${b.dataset.del}`, { method: 'DELETE' }); toast('Product deleted', 'ok'); renderPage(); }
      catch (e) { toast(e.message, 'bad'); }
    }));
  }
}

// ============================================================================
// PAGE: Dashboard — Store Manager's landing page, or an HO drill-in via Stores
// ============================================================================
async function PageDashboard(storeId, root) {
  {
    const [salesRes, inv, requests] = await Promise.all([
      api(`/sales?storeId=${encodeURIComponent(storeId)}`),
      api(`/inventory?storeId=${encodeURIComponent(storeId)}`),
      hasAny('STOCK_REQUEST_CREATE', 'STOCK_REQUEST_APPROVE') ? api(`/stock-requests?storeId=${encodeURIComponent(storeId)}`) : Promise.resolve([]),
    ]);
    const s = salesRes.summary;
    const lowStock = inv.activityPanel.lowStockAlerts;
    const pending = requests.filter((r) => !['COMPLETED', 'REJECTED'].includes(r.status));

    root.innerHTML = `
      <div class="grid-4" style="margin-bottom:16px;">
        <div class="card stat"><div class="num">${fmtMoney(s.todaysSales)}</div><div class="label">Today's sales</div></div>
        <div class="card stat"><div class="num">${s.transactions}</div><div class="label">Transactions (all time)</div></div>
        <div class="card stat"><div class="num">${s.itemsSold}</div><div class="label">Items sold</div></div>
        <div class="card stat"><div class="num">${fmtMoney(s.revenue)}</div><div class="label">Total revenue</div></div>
      </div>
      <div class="grid-2">
        <div class="card">
          <div class="card-title">Sales trend</div>
          ${renderTrend(s.trend)}
        </div>
        <div class="stack">
          <div class="card">
            <div class="section-head"><h3>Low stock</h3>${has('INVENTORY_REQUEST') || has('STOCK_REQUEST_CREATE') ? `<button class="btn btn-primary btn-sm" id="req-stock">Request Stock</button>` : ''}</div>
            ${lowStock.length ? lowStock.map((r) => `<div class="notif-item spread"><span>${esc(r.name)}</span><span class="pill ${r.status === 'OUT_OF_STOCK' ? 'pill-bad' : 'pill-warn'}">${r.quantity} left</span></div>`).join('') : `<div class="empty">Stock levels look healthy.</div>`}
          </div>
          <div class="card">
            <div class="card-title">Pending stock requests</div>
            ${pending.length ? pending.map((r) => `<div class="notif-item spread"><span>${r.quantity}x ${esc(r.productName)}</span>${statusPill(r.status)}</div>`).join('') : `<div class="empty">Nothing pending.</div>`}
          </div>
        </div>
      </div>`;

    const reqBtn = document.getElementById('req-stock');
    if (reqBtn) reqBtn.addEventListener('click', async () => {
      const rows = (await api(`/inventory?storeId=${encodeURIComponent(storeId)}`)).rows;
      openQuickRequestModal(rows, storeId);
    });
  }
}

function renderTrend(trend) {
  if (!trend.length) return `<div class="empty">No sales recorded yet.</div>`;
  const max = Math.max(...trend.map((t) => t.total), 1);
  return `<div style="display:flex;align-items:flex-end;gap:6px;height:120px;">
    ${trend.slice(-14).map((t) => `<div title="${t.day}: ${fmtMoney(t.total)}" style="flex:1;background:var(--accent);opacity:.85;border-radius:3px 3px 0 0;height:${Math.max(4, (t.total / max) * 100)}%;"></div>`).join('')}
  </div>
  <div class="spread muted" style="font-size:11px;margin-top:6px;"><span>${trend[Math.max(0, trend.length - 14)].day}</span><span>${trend[trend.length - 1].day}</span></div>`;
}

function statusPill(status) {
  const map = {
    REQUESTED: 'pill-neutral', UNDER_REVIEW: 'pill-neutral', APPROVED: 'pill-accent',
    FULFILLMENT_PENDING: 'pill-warn', DISPATCHED: 'pill-warn', IN_TRANSIT: 'pill-warn',
    RECEIVED: 'pill-ok', COMPLETED: 'pill-ok', REJECTED: 'pill-bad',
  };
  return `<span class="pill ${map[status] || 'pill-neutral'}">${status.replace(/_/g, ' ').toLowerCase()}</span>`;
}

function openQuickRequestModal(rows, storeId) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal"><h3>Request Stock</h3>
      <div class="field"><label>Product</label><select id="product-sel">${rows.map((r) => `<option value="${r.productId}">${esc(r.name)} — currently ${r.quantity}</option>`).join('')}</select></div>
      <div class="field"><label>Quantity</label><input id="qty-in" type="number" min="1" value="20" /></div>
      <div class="modal-actions"><button class="btn btn-ghost" id="cancel">Cancel</button><button class="btn btn-primary" id="confirm">Send request</button></div>
    </div>`;
  document.body.appendChild(backdrop);
  document.getElementById('cancel').addEventListener('click', () => backdrop.remove());
  document.getElementById('confirm').addEventListener('click', async () => {
    try {
      await api('/stock-requests', { method: 'POST', body: { productId: document.getElementById('product-sel').value, quantity: Number(document.getElementById('qty-in').value) } });
      toast('Stock request sent', 'ok'); backdrop.remove(); renderPage();
    } catch (e) { toast(e.message, 'bad'); }
  });
}

// ============================================================================
// PAGE: Sales — Cashier sees own transactions; Store Manager own store;
// Head Office Manager any store via the topbar store selector.
// ============================================================================
async function PageSales(root) {
  const storeId = state.user.storeId || state.selectedStoreId;
  const data = await api(`/sales?storeId=${encodeURIComponent(storeId)}`);

  if (data.scope === 'OWN_TRANSACTIONS') {
    root.innerHTML = `
      <div class="grid-3" style="margin-bottom:16px;">
        <div class="card stat"><div class="num">${data.summary.transactions}</div><div class="label">Your transactions</div></div>
        <div class="card stat"><div class="num">${data.summary.itemsSold}</div><div class="label">Items sold</div></div>
        <div class="card stat"><div class="num">${fmtMoney(data.summary.revenue)}</div><div class="label">Total processed</div></div>
      </div>
      <div class="card">
        <div class="card-title">Your recent sales</div>
        <table><thead><tr><th>Receipt</th><th>Items</th><th class="right">Total</th><th>When</th></tr></thead>
        <tbody>${data.sales.slice(-25).reverse().map((s) => `<tr class="row-hover"><td class="mono">${s.id}</td><td>${s.items.length}</td><td class="right mono">${fmtMoney(s.total)}</td><td class="muted">${fmtDate(s.createdAt)}</td></tr>`).join('') || `<tr><td colspan="4" class="empty">No sales yet.</td></tr>`}</tbody></table>
      </div>`;
    return;
  }

  const s = data.summary;
  root.innerHTML = `
    <div class="grid-4" style="margin-bottom:16px;">
      <div class="card stat"><div class="num">${fmtMoney(s.todaysSales)}</div><div class="label">Today's sales</div></div>
      <div class="card stat"><div class="num">${s.transactions}</div><div class="label">Transactions</div></div>
      <div class="card stat"><div class="num">${s.itemsSold}</div><div class="label">Items sold</div></div>
      <div class="card stat"><div class="num">${fmtMoney(s.revenue)}</div><div class="label">Revenue</div></div>
    </div>
    <div class="grid-2">
      <div class="card"><div class="card-title">Sales trend — ${esc(data.storeName)}</div>${renderTrend(s.trend)}</div>
      <div class="card">
        <div class="card-title">Best sellers</div>
        ${s.bestSellers.length ? s.bestSellers.map((b) => `<div class="notif-item spread"><span>${esc(b.name)}</span><span class="mono">${b.qty}</span></div>`).join('') : `<div class="empty">No sales yet.</div>`}
        <div class="card-title" style="margin-top:16px;">30-day projection</div>
        <div class="stat" style="padding:0;"><div class="num">${fmtMoney(s.projection)}</div><div class="label">Based on current trend</div></div>
      </div>
    </div>`;
}

// ============================================================================
// PAGE: Home — Head Office Manager's org-wide landing page (Section 12).
// Deliberately NOT the same as a store dashboard: no single store's numbers,
// an overview across all of them instead.
// ============================================================================
async function PageHome(root) {
  const stores = state.stores;
  const perStore = await Promise.all(stores.map((s) => api(`/sales?storeId=${encodeURIComponent(s.id)}`)));
  const totalRevenue = perStore.reduce((sum, r) => sum + r.summary.revenue, 0);
  const totalTx = perStore.reduce((sum, r) => sum + r.summary.transactions, 0);

  root.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <h3 style="margin-bottom:6px;">Running the network, store by store</h3>
      <p class="muted" style="max-width:640px;font-size:13.8px;">
        RetailFlow keeps every store's inventory, sales and stock requests visible from one place,
        so fulfillment decisions are made with full visibility instead of a phone call to each store.
      </p>
    </div>
    <div class="grid-4" style="margin-bottom:16px;">
      <div class="card stat"><div class="num">${stores.length}</div><div class="label">Stores</div></div>
      <div class="card stat"><div class="num">${fmtMoney(totalRevenue)}</div><div class="label">Network revenue</div></div>
      <div class="card stat"><div class="num">${totalTx}</div><div class="label">Total transactions</div></div>
      <div class="card stat"><div class="num" id="pending-count">…</div><div class="label">Pending stock requests</div></div>
    </div>
    <div class="card">
      <div class="card-title">Stores at a glance</div>
      <table>
        <thead><tr><th>Store</th><th class="right">Revenue</th><th class="right">Transactions</th><th></th></tr></thead>
        <tbody>
          ${stores.map((s, i) => `
            <tr class="row-hover">
              <td>${esc(s.name)}</td>
              <td class="right mono">${fmtMoney(perStore[i].summary.revenue)}</td>
              <td class="right mono">${perStore[i].summary.transactions}</td>
              <td class="right"><button class="btn btn-ghost btn-sm" data-open="${s.id}">Open dashboard →</button></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  root.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => { state.selectedStoreId = b.dataset.open; location.hash = `#/store-detail/${b.dataset.open}`; }));

  api('/stock-requests').then((reqs) => {
    const pending = reqs.filter((r) => !['COMPLETED', 'REJECTED'].includes(r.status)).length;
    const el = document.getElementById('pending-count'); if (el) el.textContent = pending;
  }).catch(() => {});
}

// ============================================================================
// PAGE: Stores — HO browses/selects a store; Admin manages the store list.
// ============================================================================
async function PageStores(root) {
  const stores = await api('/stores');
  const canManage = has('STORE_MANAGE');

  root.innerHTML = `
    <div class="card">
      <div class="section-head">
        <h3>All stores</h3>
        ${canManage ? `<button class="btn btn-primary btn-sm" id="new-store">+ New store</button>` : ''}
      </div>
      <table>
        <thead><tr><th>Name</th><th>Address</th><th></th></tr></thead>
        <tbody>${stores.map((s) => `
          <tr class="row-hover">
            <td>${esc(s.name)}</td><td class="muted">${esc(s.address || '')}</td>
            <td class="right">${hasAny('SALES_VIEW_ALL_STORES', 'INVENTORY_VIEW') && state.user.role === 'HEAD_OFFICE_MANAGER' ? `<button class="btn btn-ghost btn-sm" data-open="${s.id}">Open dashboard →</button>` : ''}</td>
          </tr>`).join('')}</tbody>
      </table>
    </div>`;

  root.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => { state.selectedStoreId = b.dataset.open; location.hash = `#/store-detail/${b.dataset.open}`; }));

  if (canManage) {
    document.getElementById('new-store').addEventListener('click', () => {
      const backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop';
      backdrop.innerHTML = `<div class="modal"><h3>New store</h3>
        <div class="field"><label>Name</label><input id="s-name" /></div>
        <div class="field"><label>Address</label><input id="s-address" /></div>
        <div class="modal-actions"><button class="btn btn-ghost" id="cancel">Cancel</button><button class="btn btn-primary" id="confirm">Create</button></div></div>`;
      document.body.appendChild(backdrop);
      document.getElementById('cancel').addEventListener('click', () => backdrop.remove());
      document.getElementById('confirm').addEventListener('click', async () => {
        try {
          await api('/stores', { method: 'POST', body: { name: document.getElementById('s-name').value, address: document.getElementById('s-address').value } });
          toast('Store created', 'ok'); backdrop.remove(); state.stores = await api('/stores'); renderPage();
        } catch (e) { toast(e.message, 'bad'); }
      });
    });
  }
}

// ============================================================================
// PAGE: Promotions — Head Office Manager manages; Cashiers only ever consume
// these at checkout (this page isn't even in the Cashier's sidebar).
// ============================================================================
async function PagePromotions(root) {
  const promos = await api('/promotions');
  const canManage = has('PROMOTION_MANAGE');
  root.innerHTML = `
    <div class="card">
      <div class="section-head"><h3>Promotions</h3>${canManage ? `<button class="btn btn-primary btn-sm" id="new-promo">+ New promotion</button>` : ''}</div>
      <table>
        <thead><tr><th>Name</th><th>Code</th><th>Discount</th><th>Valid</th><th>Status</th>${canManage ? '<th></th>' : ''}</tr></thead>
        <tbody>${promos.map((p) => `
          <tr class="row-hover">
            <td>${esc(p.name)}</td><td class="mono">${esc(p.code)}</td>
            <td>${p.type === 'PERCENT' ? p.value + '%' : fmtMoney(p.value)}</td>
            <td class="muted">${p.validFrom} → ${p.validTo}</td>
            <td>${p.active ? '<span class="pill pill-ok">Active</span>' : '<span class="pill pill-neutral">Inactive</span>'}</td>
            ${canManage ? `<td class="right"><button class="btn btn-ghost btn-sm" data-toggle="${p.id}">${p.active ? 'Deactivate' : 'Activate'}</button></td>` : ''}
          </tr>`).join('') || `<tr><td colspan="6" class="empty">No promotions yet.</td></tr>`}</tbody>
      </table>
    </div>`;

  if (canManage) {
    root.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', async () => {
      const p = promos.find((x) => x.id === b.dataset.toggle);
      try { await api(`/promotions/${p.id}`, { method: 'PUT', body: { active: !p.active } }); renderPage(); } catch (e) { toast(e.message, 'bad'); }
    }));
    document.getElementById('new-promo').addEventListener('click', () => {
      const backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop';
      backdrop.innerHTML = `<div class="modal"><h3>New promotion</h3>
        <div class="field"><label>Name</label><input id="pr-name" /></div>
        <div class="field"><label>Code</label><input id="pr-code" placeholder="SAVE10" /></div>
        <div class="field"><label>Type</label><select id="pr-type"><option value="PERCENT">Percent off</option><option value="FIXED">Fixed amount off</option></select></div>
        <div class="field"><label>Value</label><input id="pr-value" type="number" /></div>
        <div class="field"><label>Valid from</label><input id="pr-from" type="date" value="2026-01-01" /></div>
        <div class="field"><label>Valid to</label><input id="pr-to" type="date" value="2026-12-31" /></div>
        <div class="modal-actions"><button class="btn btn-ghost" id="cancel">Cancel</button><button class="btn btn-primary" id="confirm">Create</button></div></div>`;
      document.body.appendChild(backdrop);
      document.getElementById('cancel').addEventListener('click', () => backdrop.remove());
      document.getElementById('confirm').addEventListener('click', async () => {
        try {
          await api('/promotions', { method: 'POST', body: {
            name: document.getElementById('pr-name').value, code: document.getElementById('pr-code').value.toUpperCase(),
            type: document.getElementById('pr-type').value, value: Number(document.getElementById('pr-value').value),
            validFrom: document.getElementById('pr-from').value, validTo: document.getElementById('pr-to').value,
          } });
          toast('Promotion created', 'ok'); backdrop.remove(); renderPage();
        } catch (e) { toast(e.message, 'bad'); }
      });
    });
  }
}

// ============================================================================
// PAGE: Stock Requests — Head Office Manager reviews/approves/rejects and
// chooses the fulfillment source (Section 17).
// ============================================================================
async function PageStockRequests(root) {
  const [requests, transfers, factoryOrders] = await Promise.all([
    api('/stock-requests'),
    api('/transfers').catch(() => []),
    api('/transfers/factory-orders').catch(() => []),
  ]);
  const canApprove = has('STOCK_REQUEST_APPROVE');

  // Where is this request in fulfillment, and WHO has to act next?
  function nextStep(r) {
    if (r.status === 'REJECTED') return `<span class="muted">Rejected</span>`;
    if (r.status === 'COMPLETED') return `<span class="muted">Stock received — done</span>`;
    if (!r.fulfillment) return `<span class="muted">Awaiting your review</span>`;
    if (r.fulfillment.type === 'TRANSFER') {
      const t = transfers.find((x) => x.id === r.fulfillment.transferId);
      if (!t) return '';
      if (t.status === 'PENDING_DISPATCH') return `Waiting for <b>${esc(t.sourceStoreName)}</b> inventory staff to dispatch`;
      if (t.status === 'IN_TRANSIT') return `In transit — waiting for <b>${esc(t.destinationStoreName)}</b> inventory staff to receive`;
    } else {
      const o = factoryOrders.find((x) => x.id === r.fulfillment.factoryOrderId);
      if (o && o.status === 'ORDERED') return `Factory order placed — waiting for <b>${esc(o.destinationStoreName)}</b> inventory staff to mark it received`;
    }
    return '';
  }
  const otherStores = state.stores;

  root.innerHTML = `
    <div class="card">
      <div class="card-title">All stock requests</div>
      <table>
        <thead><tr><th>Request</th><th>Store</th><th>Product</th><th class="right">Qty</th><th>Status</th><th>Next step</th>${canApprove ? '<th></th>' : ''}</tr></thead>
        <tbody>${requests.map((r) => `
          <tr class="row-hover">
            <td class="mono muted">${r.id.slice(-6)}</td>
            <td>${esc(r.storeName)}</td>
            <td>${esc(r.productName)}</td>
            <td class="right mono">${r.quantity}</td>
            <td>${statusPill(r.status)}</td>
            <td style="font-size:12.5px;">${nextStep(r)}</td>
            ${canApprove ? `<td class="right">${['REQUESTED', 'UNDER_REVIEW'].includes(r.status) ? `
              <button class="btn btn-primary btn-sm" data-approve="${r.id}">Approve</button>
              <button class="btn btn-danger btn-sm" data-reject="${r.id}">Reject</button>` : (r.fulfillment ? `<span class="badge-source">${r.fulfillment.type === 'TRANSFER' ? 'via transfer' : 'via factory order'}</span>` : '')}</td>` : ''}
          </tr>`).join('') || `<tr><td colspan="7" class="empty">No stock requests yet.</td></tr>`}</tbody>
      </table>
    </div>`;

  if (!canApprove) return;

  root.querySelectorAll('[data-reject]').forEach((b) => b.addEventListener('click', async () => {
    const reason = prompt('Reason for rejecting this request (optional):') || null;
    try { await api(`/stock-requests/${b.dataset.reject}/reject`, { method: 'POST', body: { reason } }); toast('Request rejected', 'ok'); renderPage(); }
    catch (e) { toast(e.message, 'bad'); }
  }));

  root.querySelectorAll('[data-approve]').forEach((b) => b.addEventListener('click', () => {
    const request = requests.find((r) => r.id === b.dataset.approve);
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal">
        <h3>Approve — ${request.quantity}x ${esc(request.productName)}</h3>
        <p class="muted" style="font-size:13px;margin-bottom:14px;">for ${esc(request.storeName)}</p>
        <div class="field">
          <label>Fulfillment source</label>
          <select id="ff-type">
            <option value="TRANSFER">Transfer from another store</option>
            <option value="FACTORY">Order from factory/supplier</option>
          </select>
        </div>
        <div class="field" id="source-store-field">
          <label>Source store</label>
          <select id="source-store">${otherStores.filter((s) => s.id !== request.storeId).map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>
        </div>
        <div class="modal-actions"><button class="btn btn-ghost" id="cancel">Cancel</button><button class="btn btn-primary" id="confirm">Approve</button></div>
      </div>`;
    document.body.appendChild(backdrop);
    document.getElementById('ff-type').addEventListener('change', (e) => {
      document.getElementById('source-store-field').style.display = e.target.value === 'TRANSFER' ? '' : 'none';
    });
    document.getElementById('cancel').addEventListener('click', () => backdrop.remove());
    document.getElementById('confirm').addEventListener('click', async () => {
      const fulfillmentType = document.getElementById('ff-type').value;
      try {
        await api(`/stock-requests/${request.id}/approve`, { method: 'POST', body: { fulfillmentType, sourceStoreId: fulfillmentType === 'TRANSFER' ? document.getElementById('source-store').value : undefined } });
        toast('Request approved', 'ok'); backdrop.remove(); renderPage();
      } catch (e) { toast(e.message, 'bad'); }
    });
  }));
}

// ============================================================================
// PAGE: Audit Log
// ============================================================================
async function PageAudit(root) {
  const logs = await api('/audit-logs');
  root.innerHTML = `
    <div class="card">
      <div class="card-title">Recent activity (last 200 events)</div>
      <table>
        <thead><tr><th>When</th><th>User</th><th>Role</th><th>Action</th><th>Resource</th></tr></thead>
        <tbody>${logs.map((l) => `
          <tr class="row-hover">
            <td class="muted">${fmtDate(l.createdAt)}</td>
            <td>${esc(l.userName)}</td>
            <td class="muted">${ROLE_LABEL[l.role] || l.role}</td>
            <td>${l.action.replace(/_/g, ' ').toLowerCase()}</td>
            <td class="mono muted">${esc(l.resource || '')}</td>
          </tr>`).join('') || `<tr><td colspan="5" class="empty">No activity recorded yet.</td></tr>`}</tbody>
      </table>
    </div>`;
}

// ============================================================================
// PAGE: Users — System Admin
// ============================================================================
async function PageUsers(root) {
  const [users, storesResp] = await Promise.all([
    api('/users'),
    hasAny('STORE_VIEW') ? api('/stores').catch(() => state.stores || []) : Promise.resolve(state.stores || []),
  ]);
  if (Array.isArray(storesResp) && storesResp.length) state.stores = storesResp;
  const roles = Object.keys(ROLE_LABEL);
  root.innerHTML = `
    <div class="card">
      <div class="section-head"><h3>Users</h3><button class="btn btn-primary btn-sm" id="new-user">+ New user</button></div>
      <table>
        <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Store</th><th>Status</th><th></th></tr></thead>
        <tbody>${users.map((u) => `
          <tr class="row-hover">
            <td>${esc(u.name)}</td><td class="mono muted">${esc(u.username)}</td>
            <td>${ROLE_LABEL[u.role]}</td><td class="muted">${u.storeId ? esc(storeName(u.storeId)) : '—'}</td>
            <td>${u.disabled ? '<span class="pill pill-bad">Disabled</span>' : '<span class="pill pill-ok">Active</span>'}</td>
            <td class="right"><button class="btn btn-ghost btn-sm" data-toggle="${u.id}">${u.disabled ? 'Enable' : 'Disable'}</button></td>
          </tr>`).join('')}</tbody>
      </table>
    </div>`;

  root.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', async () => {
    const u = users.find((x) => x.id === b.dataset.toggle);
    try { await api(`/users/${u.id}`, { method: 'PUT', body: { disabled: !u.disabled } }); renderPage(); } catch (e) { toast(e.message, 'bad'); }
  }));

  document.getElementById('new-user').addEventListener('click', () => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `<div class="modal"><h3>New user</h3>
      <div class="field"><label>Name</label><input id="u-name" /></div>
      <div class="field"><label>Username</label><input id="u-username" /></div>
      <div class="field"><label>Password</label><input id="u-password" type="password" value="password123" /></div>
      <div class="field"><label>Role</label><select id="u-role">${roles.map((r) => `<option value="${r}">${ROLE_LABEL[r]}</option>`).join('')}</select></div>
      <div class="field" id="u-store-field"><label>Store</label><select id="u-store">${storesResp.length ? storesResp.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('') : '<option value="">(No stores available)</option>'}</select></div>
      <div class="modal-actions"><button class="btn btn-ghost" id="cancel">Cancel</button><button class="btn btn-primary" id="confirm">Create</button></div></div>`;
    document.body.appendChild(backdrop);
    const roleSel = document.getElementById('u-role');
    const storeField = document.getElementById('u-store-field');
    function syncStoreField() { storeField.style.display = ['CASHIER', 'INVENTORY_STAFF', 'STORE_MANAGER'].includes(roleSel.value) ? '' : 'none'; }
    roleSel.addEventListener('change', syncStoreField); syncStoreField();
    document.getElementById('cancel').addEventListener('click', () => backdrop.remove());
    document.getElementById('confirm').addEventListener('click', async () => {
      try {
        await api('/users', { method: 'POST', body: {
          name: document.getElementById('u-name').value, username: document.getElementById('u-username').value,
          password: document.getElementById('u-password').value, role: roleSel.value,
          storeId: storeField.style.display !== 'none' ? document.getElementById('u-store').value : undefined,
        } });
        toast('User created', 'ok'); backdrop.remove(); renderPage();
      } catch (e) { toast(e.message, 'bad'); }
    });
  });
}

// ============================================================================
// PAGE: Roles & Permissions — the live demonstration of Section 23: toggling
// a checkbox here calls PUT /api/roles/:role/permissions, and every route in
// the app re-evaluates against the new mapping on its very next request.
// No redeploy, no code change.
// ============================================================================
async function PageRoles(root) {
  const { roles, permissions, matrix } = await api('/roles');
  root.innerHTML = `
    <div class="card">
      <div class="card-title">Role → permission matrix</div>
      <p class="muted" style="font-size:13px;margin-bottom:14px;">
        Toggling a box here changes what that role can do across the entire app immediately —
        permissions are checked centrally, never hardcoded per role in route code.
      </p>
      <div style="overflow-x:auto;">
        <table>
          <thead><tr><th>Permission</th>${roles.map((r) => `<th>${ROLE_LABEL[r]}</th>`).join('')}</tr></thead>
          <tbody>${permissions.map((p) => `
            <tr class="row-hover">
              <td class="mono" style="font-size:12px;">${p}</td>
              ${roles.map((r) => `<td style="text-align:center;"><input type="checkbox" data-role="${r}" data-perm="${p}" ${matrix[r].includes(p) ? 'checked' : ''} /></td>`).join('')}
            </tr>`).join('')}</tbody>
        </table>
      </div>
    </div>`;

  root.querySelectorAll('input[type=checkbox]').forEach((cb) => cb.addEventListener('change', async () => {
    try {
      await api(`/roles/${cb.dataset.role}/permissions`, { method: 'PUT', body: { permission: cb.dataset.perm, enabled: cb.checked } });
      toast(`${cb.dataset.perm} ${cb.checked ? 'granted to' : 'removed from'} ${ROLE_LABEL[cb.dataset.role]}`, 'ok');
      if (state.user && cb.dataset.role === state.user.role) {
        state.user = await api('/auth/me');
      }
    } catch (e) { cb.checked = !cb.checked; toast(e.message, 'bad'); }
  }));
}
