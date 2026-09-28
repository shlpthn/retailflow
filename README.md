# RetailFlow

A role-based retail store management system for five operational roles —
Cashier, Inventory Staff, Store Manager, Head Office Manager, System Admin —
with RBAC enforced at the API layer, not just hidden in the UI.

## Running it

```bash
npm install
npm start
```

Then open **http://localhost:3000**. Log in with any of the demo accounts
below (the login screen also has one-click buttons for each).

| Username     | Role                 | Store            |
|--------------|----------------------|------------------|
| `cashier1`   | Cashier              | Downtown (001)   |
| `inventory1` | Inventory Staff      | Downtown (001)   |
| `inventory2` | Inventory Staff      | Uptown (002)     |
| `manager1`   | Store Manager        | Downtown (001)   |
| `manager2`   | Store Manager        | Uptown (002)     |
| `ho1`        | Head Office Manager  | all stores       |
| `admin1`     | System Admin         | system-wide      |

Password for every account: `password123`

Data is stored **in-memory** and resets whenever the server restarts. The
data layer (`server/db.js`) is written so it maps directly onto real tables
if you later swap it for Postgres/SQLite — nothing above it needs to change.

## How the RBAC actually works

The one rule this whole codebase is built around: **routes never check a
role name.** Every protected route calls `requirePermission('SOME_PERM')`
(see `server/permissions.js`). Roles are just a named bundle of permissions,
and System Admin can move a permission from one role to another at runtime
via the **Roles & Permissions** screen (`PUT /api/roles/:role/permissions`) —
no code change, no redeploy. Try it: log in as `admin1`, uncheck
`CHECKOUT_CREATE` on Cashier, then try to check out as `cashier1` — it 403s
immediately, because the very next request re-evaluates against the live
mapping.

### Three layers, each independently enforced

1. **Authentication** (`server/auth.js`) — a JWT identifies *who* the request
   is from. It's re-verified against the live user record on every request,
   so disabling a user or changing their role takes effect on their very
   next call, not just their next login.
2. **Authorization** (`server/permissions.js`) — `requirePermission(...)`
   middleware decides *what* that identity is allowed to do.
3. **Store scope** (`server/middleware/storeScope.js`) — decides *which
   store's data* the request may touch. For store-level roles (Cashier,
   Inventory Staff, Store Manager) this **always** comes from the
   authenticated user record and silently ignores any `storeId` sent in the
   query string or body. That's what stops the classic attack this spec
   calls out explicitly: a Store Manager assigned to `STORE_001` calling
   `GET /api/inventory?storeId=STORE_002` gets their own store's data back,
   not an error that leaks the other store exists — the parameter is simply
   overridden.

The frontend (`public/app.js`) reads `permissions` from `/api/auth/me` to
decide which sidebar links and action buttons to show. That's a convenience,
not a security boundary — every one of those actions is re-checked server
side, so editing the frontend to reveal a hidden button doesn't get you
anything the API won't already refuse.

### Shared pages, not duplicated pages

Per the spec, several roles share the same page with different available
actions rather than forking the page:

- **Inventory** (`server/routes/inventory.js`, `PageInventory` in `app.js`) —
  one page for Inventory Staff / Store Manager / Head Office Manager. The
  view is identical; `INVENTORY_RECEIVE` unlocks "Add Stock",
  `INVENTORY_DISPATCH` unlocks "Dispatch Stock", `INVENTORY_REQUEST` /
  `STOCK_REQUEST_CREATE` unlocks "Request Stock".
- **Sales** (`server/routes/sales.js`) — Cashiers see only the transactions
  they personally processed; Store Managers see their one store; Head Office
  Managers can select any store via the store selector in the top bar.
- **Dashboard** (`PageDashboard` in `app.js`) — same component renders a
  Store Manager's fixed store or whichever store a Head Office Manager
  drilled into from **Stores**.

### The stock request → fulfillment lifecycle

`REQUESTED → APPROVED → FULFILLMENT_PENDING → (DISPATCHED → IN_TRANSIT) →
RECEIVED → COMPLETED`, or `REJECTED` at the review step. A Store Manager
raises a request from the Inventory page; a Head Office Manager approves it
and picks the fulfillment source — either an inter-store **transfer**
(decrement source / increment destination, both recorded as stock
movements) or a **factory order** (single receiving step). Inventory Staff
at the source store dispatch a transfer; Inventory Staff at the destination
store receive it. Every transition is recorded on the request's `history`
array and in the audit log — inventory quantities never change without a
corresponding movement record.

### Audit trail

Every mutating action (checkout, add/dispatch stock, approve/reject a
request, dispatch/receive a transfer, create a user, flip a permission...)
writes an entry to `db.auditLogs` via `db.logAudit()`, visible to System
Admin and Head Office Manager on the **Audit Log** page.

## Project layout

```
server/
  index.js            Express app wiring
  auth.js             JWT issuing/verification (authentication)
  permissions.js       Central permission catalogue + role mapping (authorization)
  db.js               In-memory data + seed data
  middleware/
    storeScope.js     Store-level data isolation
  routes/
    auth.js products.js inventory.js checkout.js sales.js
    stockRequests.js transfers.js stores.js promotions.js
    users.js roles.js auditLogs.js
public/
  index.html style.css app.js     Vanilla-JS SPA, no build step
```

## Testing authorization yourself

A few things worth trying directly against the API to see the enforcement
(not just the hidden UI) in action:

```bash
# Log in as manager1 (Store Manager, assigned to STORE_001)
TOKEN=$(curl -s -X POST localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"manager1","password":"password123"}' | jq -r .token)

# Try to read another store's inventory by editing the query string —
# the backend substitutes their own store instead of erroring or leaking data.
curl -s "localhost:3000/api/inventory?storeId=STORE_002" \
  -H "Authorization: Bearer $TOKEN" | jq .storeId
# => "STORE_001"

# Try to dispatch stock directly — Store Managers don't hold INVENTORY_DISPATCH.
curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:3000/api/inventory/dispatch-stock \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"productId":"P001","quantity":1}'
# => 403
```
