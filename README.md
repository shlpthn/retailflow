# RetailFlow

A multi-store retail management platform with Role-Based Access Control (RBAC) enforced at the API layer. Supports POS checkout, multi-branch inventory tracking, inter-store transfers, promotions, and immutable audit logs across five core roles: Cashier, Inventory Staff, Store Manager, Head Office Manager, and System Admin.

---

## Requirements

- **Node.js**: `v18.x` or higher (tested with Node 20 / 24)
- **npm**: `v9.x` or higher
- **OS**: Windows, macOS, or Linux
- **No external database required**: Ships with SQLite (`better-sqlite3`) and creates `data/retailflow.db` automatically on first run.

---

## Quick Start

### 1. Install Dependencies

Install root dependencies (backend) and client dependencies (frontend):

```bash
# Install backend dependencies
npm install

# Install frontend dependencies
npm --prefix client install
```

### 2. Build Frontend (Production Mode)

Build the React frontend into `client/dist`. The Express backend automatically serves these static files:

```bash
npm run build:client
npm start
```

Open **http://localhost:3000** in your browser.

---

## Development Mode

Run backend and frontend concurrently for hot-reloading:

```bash
# Terminal 1: Backend server (runs on http://localhost:3000)
npm run dev

# Terminal 2: Vite React client (runs on http://localhost:5173 with proxy)
npm run dev:client
```

Open **http://localhost:5173** to access the live Vite dev server.

---

## Default Demo Accounts

All accounts use the password: `password123`

| Username | Role | Scope / Assigned Store | Access Capabilities |
|---|---|---|---|
| `cashier1` | Cashier | Downtown Store (`STORE_001`) | Fast POS checkout, barcode scanning, split payments, personal sales history |
| `inventory1` | Inventory Staff | Downtown Store (`STORE_001`) | Stock intake, adjustment, transfer dispatch & receive |
| `inventory2` | Inventory Staff | Uptown Store (`STORE_002`) | Stock operations for Uptown branch |
| `manager1` | Store Manager | Downtown Store (`STORE_001`) | Branch sales dashboard, stock request creation, local inventory view |
| `manager2` | Store Manager | Uptown Store (`STORE_002`) | Store management for Uptown branch |
| `ho1` | Head Office Manager | All Stores (Organization) | Multi-branch overview, approve/reject stock requests, inter-store transfers, manage catalog & promotions, user management (store-level staff) |
| `admin1` | System Admin | System-wide | User provisioning, store creation, audit inspection, role & permissions configuration |

---

## Database Management

- **Storage Location**: `data/retailflow.db` (SQLite with WAL mode).
- **In-Memory Cache**: Active state is served from memory and automatically flushed to SQLite on each request.
- **Reset Database**: Stop the server and delete `data/retailflow.db` (and any `-wal`/`-shm` files). The server will recreate and seed a clean database from `server/db.js` on the next startup.

---

## Running Automated Tests

Run API integration and regression tests:

```bash
node test/api.smoke.js
node test/db.flush.smoke.js
```
