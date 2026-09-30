# RetailFlow — API Reference

> Auto-generated from the codebase (`server/index.js`, `server/routes/*.js`).
> The server is an **Express** app. All routes are JSON-only. The static frontend
> is served at `/` and every unknown non-`/api` path falls through to `index.html`.

## Authentication & conventions

| Item | Detail |
| --- | --- |
| Token | **JWT** (8h TTL), signed with `RETAILFLOW_JWT_SECRET` (defaults to `dev-only-secret-change-me`) |
| Header | `Authorization: Bearer <token>` on **every** request except the public auth routes |
| Global gate | `app.use('/api', authenticate)` — mounts **after** `/api/auth`, so everything under `/api/*` except `/api/auth/*` requires a valid token |
| Auth check | On each request the user is re-fetched from the DB; disabled accounts and role/store changes take effect immediately |

### Store scope rules (`server/middleware/storeScope.js`)

| Role | Scope | `storeId` source |
| --- | --- | --- |
| `CASHIER`, `INVENTORY_STAFF`, `STORE_MANAGER` | `SINGLE` | Always the authenticated user's own store — client-supplied `storeId` is **ignored** |
| `HEAD_OFFICE_MANAGER` | `ORG` | May pass `storeId` as query/body param |
| `SYSTEM_ADMIN` | `ADMIN` | May pass `storeId` as query/body param |

### Error responses

All endpoints return `{ "error": "<message>" }` with the appropriate HTTP status:
`400` bad request, `401` unauthenticated, `403` forbidden (missing permission /
store access), `404` unknown resource, `409` state conflict (bad status transition,
insufficient stock, duplicate username).

---

## Auth — `/api/auth` (public mount)

### POST `/api/auth/login`
Authenticates and issues a JWT.
- Body: `{ "username": string, "password": string }`
- Success (200): `{ "token": "<jwt>", "user": { id, name, username, role, storeId, scope, permissions[] } }`
- Errors: `400` missing credentials, `401` invalid credentials / disabled account

### GET `/api/auth/stores`
Public store dropdown for signup/login.
- Success (200): `[{ "id": "STORE_...", "name": string }]`

### POST `/api/auth/signup`
Self-registration (public).
- Body: `{ "name", "username", "password", "role", "storeId?" }`
  - `role` must be one of the six roles (see Roles section).
  - `storeId` **required** for store-level roles (`CASHIER`, `INVENTORY_STAFF`, `STORE_MANAGER`).
- Success (201): `{ "message": "User registered successfully", "user": { ... } }`
- Errors: `400` missing fields / unknown role / missing storeId, `404` unknown store, `409` username already exists

### GET `/api/auth/me`
Current user (self-authenticates with `Authorization` header despite public mount).
- Success (200): `{ id, name, username, role, storeId, scope, permissions[] }`

---

## Products — `/api/products`

| Method | Path | Permission | Description |
| --- | --- | --- | --- |
| GET | `/` | `PRODUCT_VIEW` | List all products |
| POST | `/` | `PRODUCT_MANAGE` | Create a product |
| PUT | `/:productId` | `PRODUCT_MANAGE` | Update a product |
| DELETE | `/:productId` | `PRODUCT_MANAGE` | Delete a product |

- **POST** body: `{ "name", "barcode", "price", "image?" }` → 201 product (`image` defaults to `📦`)
- **PUT** body: any partial product fields → 200 updated product
- **DELETE** → `204 No Content`

---

## Inventory — `/api/inventory`

| Method | Path | Permission | Description |
| --- | --- | --- | --- |
| GET | `/` | `INVENTORY_VIEW` | Inventory page: rows + activity panel (low-stock alerts, incoming transfers, pending requests) |
| GET | `/restock-history` | `INVENTORY_VIEW` | Restock history (alias of `/restocks`) |
| GET | `/restocks` | `INVENTORY_VIEW` | Restock history (alias) |
| GET | `/movements` | `INVENTORY_VIEW` | All stock movements for the effective store |
| POST | `/add-stock` | `INVENTORY_RECEIVE` | Add stock (barcode workflow, own store only) |
| POST | `/dispatch-stock` | `INVENTORY_DISPATCH` | Dispatch stock (own store only) |

- **GET `/`** query: `storeId` (org-scope roles only). Response: `{ storeId, storeName, rows[], activityPanel: { lowStockAlerts, incomingTransfers, pendingRequests } }`.
  Rows contain: `storeId, productId, name, image, barcode, quantity, threshold, status` (`OK` | `LOW_STOCK` | `OUT_OF_STOCK`).
- **GET `/restock-history` / `/restocks`** query: `storeId`, `limit` (default 20, max 100), `productId`. Filters stock movements of type `RECEIVE` and `TRANSFER_IN`. Response: `{ storeId, storeName, totalCount, limit, restocks[], history[] }`.
- **POST `/add-stock`** body: `{ "productId", "quantity", "note?" }` → 200 `{ storeId, productId, quantity, product }`. Writes a `RECEIVE` stock movement.
- **POST `/dispatch-stock`** body: `{ "productId", "quantity", "destinationStoreId?", "note?" }` → 200 `{ storeId, productId, quantity }`. Writes a `DISPATCH` movement. Errors: `409` insufficient stock.