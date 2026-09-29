import React from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/hooks/use-auth'
import { defaultRoute } from '@/lib/constants'

// Layout & Guards
import { AppShell } from '@/components/layout/app-shell'
import { ProtectedRoute } from '@/components/layout/protected-route'

// Pages
import { LoginPage } from '@/pages/login/login-page'
import { CheckoutPage } from '@/pages/checkout/checkout-page'
import { InventoryPage } from '@/pages/inventory/inventory-page'
import { ProductsPage } from '@/pages/products/products-page'
import { DashboardPage } from '@/pages/dashboard/dashboard-page'
import { SalesPage } from '@/pages/sales/sales-page'
import { HomePage } from '@/pages/home/home-page'
import { StoresPage } from '@/pages/stores/stores-page'
import { PromotionsPage } from '@/pages/promotions/promotions-page'
import { StockRequestsPage } from '@/pages/stock-requests/stock-requests-page'
import { AuditPage } from '@/pages/audit/audit-page'
import { UsersPage } from '@/pages/users/users-page'
import { RolesPage } from '@/pages/roles/roles-page'
import manUtdLogo from '@/assets/Man_Utd_FC_.svg'

const AppRoutes: React.FC = () => {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#15181D] text-white">
        <div className="text-center animate-pulse flex flex-col items-center">
          <img src={manUtdLogo} alt="RetailFlow" className="w-14 h-14 object-contain mb-3" />
          <div className="text-2xl font-bold font-['Space_Grotesk'] mb-2">RetailFlow</div>
          <div className="text-sm text-neutral-400">Loading console…</div>
        </div>
      </div>
    )
  }

  if (!user) {
    return <LoginPage />
  }

  const initialRoute = defaultRoute(user.role)

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route
          path="/checkout"
          element={
            <ProtectedRoute requiredPermissions={['CHECKOUT_VIEW', 'CHECKOUT_CREATE']}>
              <CheckoutPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/inventory"
          element={
            <ProtectedRoute
              requiredPermissions={[
                'INVENTORY_VIEW',
                'INVENTORY_RECEIVE',
                'INVENTORY_DISPATCH',
                'STOCK_REQUEST_CREATE',
              ]}
            >
              <InventoryPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/products"
          element={
            <ProtectedRoute requiredPermissions={['PRODUCT_VIEW', 'PRODUCT_MANAGE']}>
              <ProductsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute
              allowedRoles={['STORE_MANAGER', 'HEAD_OFFICE_MANAGER']}
              requiredPermissions={['SALES_VIEW_OWN_STORE', 'SALES_VIEW_ALL_STORES']}
            >
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/store-detail/:storeId"
          element={
            <ProtectedRoute requiredPermissions={['SALES_VIEW_ALL_STORES', 'STORE_VIEW']}>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/sales"
          element={
            <ProtectedRoute
              allowedRoles={['STORE_MANAGER', 'HEAD_OFFICE_MANAGER', 'CASHIER']}
              requiredPermissions={[
                'SALES_VIEW_OWN_STORE',
                'SALES_VIEW_ALL_STORES',
                'CHECKOUT_VIEW',
              ]}
            >
              <SalesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/home"
          element={
            <ProtectedRoute requiredPermissions={['SALES_VIEW_ALL_STORES']}>
              <HomePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/stores"
          element={
            <ProtectedRoute requiredPermissions={['STORE_VIEW', 'STORE_MANAGE']}>
              <StoresPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/promotions"
          element={
            <ProtectedRoute requiredPermissions={['PROMOTION_MANAGE']}>
              <PromotionsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/stock-requests"
          element={
            <ProtectedRoute
              requiredPermissions={[
                'STOCK_REQUEST_VIEW',
                'STOCK_REQUEST_APPROVE',
                'STOCK_REQUEST_CREATE',
              ]}
            >
              <StockRequestsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/audit"
          element={
            <ProtectedRoute requiredPermissions={['AUDIT_VIEW']}>
              <AuditPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/users"
          element={
            <ProtectedRoute requiredPermissions={['USER_VIEW', 'USER_MANAGE']}>
              <UsersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/roles"
          element={
            <ProtectedRoute requiredPermissions={['ROLE_MANAGE']}>
              <RolesPage />
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<Navigate to={initialRoute} replace />} />
        <Route path="*" element={<Navigate to={initialRoute} replace />} />
      </Route>
    </Routes>
  )
}

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    </AuthProvider>
  )
}

export default App
