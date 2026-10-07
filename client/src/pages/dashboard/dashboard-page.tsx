import React, { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { fmtMoney } from '@/lib/utils'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { RequestStockDialog } from '@/pages/inventory/request-stock-dialog'

interface SalesSummary {
  todaysSales: number
  transactions: number
  itemsSold: number
  revenue: number
  trend: Array<{ day: string; total: number }>
}

interface InventoryData {
  rows: Array<{ productId: string; name: string; quantity: number }>
  activityPanel: {
    lowStockAlerts: Array<{ productId: string; name: string; quantity: number; status: string }>
  }
}

interface StockRequest {
  id: string
  productName: string
  quantity: number
  status: string
}

export const DashboardPage: React.FC = () => {
  const { user, selectedStoreId, has, hasAny } = useAuth()
  const { storeId: paramStoreId } = useParams<{ storeId?: string }>()

  const targetStoreId = paramStoreId || user?.storeId || selectedStoreId

  const [salesSummary, setSalesSummary] = useState<SalesSummary | null>(null)
  const [lowStock, setLowStock] = useState<InventoryData['activityPanel']['lowStockAlerts']>([])
  const [pendingRequests, setPendingRequests] = useState<StockRequest[]>([])
  const [inventoryRows, setInventoryRows] = useState<InventoryData['rows']>([])
  const [loading, setLoading] = useState(true)
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false)

  const loadDashboardData = useCallback(async () => {
    if (!targetStoreId) return
    setLoading(true)
    try {
      const [salesRes, invRes, requestsRes] = await Promise.all([
        api<{ summary: SalesSummary }>(`/sales?storeId=${encodeURIComponent(targetStoreId)}`),
        api<InventoryData>(`/inventory?storeId=${encodeURIComponent(targetStoreId)}`),
        hasAny('STOCK_REQUEST_CREATE', 'STOCK_REQUEST_APPROVE')
          ? api<StockRequest[]>(`/stock-requests?storeId=${encodeURIComponent(targetStoreId)}`).catch(() => [])
          : Promise.resolve([]),
      ])

      setSalesSummary(salesRes.summary)
      setLowStock(invRes.activityPanel.lowStockAlerts || [])
      setInventoryRows(invRes.rows || [])
      setPendingRequests(
        (requestsRes || []).filter((r) => !['COMPLETED', 'REJECTED'].includes(r.status))
      )
    } catch (err: any) {
      toast.error(err.message || 'Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }, [targetStoreId, hasAny])

  useEffect(() => {
    loadDashboardData()
  }, [loadDashboardData])

  const statusPill = (status: string) => {
    const map: Record<string, string> = {
      REQUESTED: 'pill-neutral',
      UNDER_REVIEW: 'pill-neutral',
      APPROVED: 'pill-accent',
      FULFILLMENT_PENDING: 'pill-warn',
      DISPATCHED: 'pill-warn',
      IN_TRANSIT: 'pill-warn',
      RECEIVED: 'pill-ok',
      COMPLETED: 'pill-ok',
      REJECTED: 'pill-bad',
    }
    return (
      <span className={`pill ${map[status] || 'pill-neutral'}`}>
        {status.replace(/_/g, ' ').toLowerCase()}
      </span>
    )
  }

  const renderTrend = (trend: Array<{ day: string; total: number }>) => {
    if (!trend || !trend.length) {
      return <div className="empty">No sales recorded yet.</div>
    }
    const max = Math.max(...trend.map((t) => t.total), 1)
    const recent = trend.slice(-14)

    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '120px' }}>
          {recent.map((t, idx) => (
            <div
              key={idx}
              title={`${t.day}: ${fmtMoney(t.total)}`}
              style={{
                flex: 1,
                background: 'var(--accent)',
                opacity: 0.85,
                borderRadius: '3px 3px 0 0',
                height: `${Math.max(4, (t.total / max) * 100)}%`,
              }}
            />
          ))}
        </div>
        <div className="spread muted" style={{ fontSize: '11px', marginTop: '6px' }}>
          <span>{recent[0]?.day}</span>
          <span>{recent[recent.length - 1]?.day}</span>
        </div>
      </div>
    )
  }

  if (loading && !salesSummary) {
    return <div className="empty">Loading dashboard…</div>
  }

  if (!salesSummary) {
    return <div className="empty">No store dashboard data available.</div>
  }

  return (
    <div>
      <div className="grid-4 mb-4">
        <div className="custom-card stat">
          <div className="num text-2xl font-bold">{fmtMoney(salesSummary.todaysSales)}</div>
          <div className="label">Today's sales</div>
        </div>
        <div className="custom-card stat">
          <div className="num text-2xl font-bold">{salesSummary.transactions}</div>
          <div className="label">Transactions (all time)</div>
        </div>
        <div className="custom-card stat">
          <div className="num text-2xl font-bold">{salesSummary.itemsSold}</div>
          <div className="label">Items sold</div>
        </div>
        <div className="custom-card stat">
          <div className="num text-2xl font-bold">{fmtMoney(salesSummary.revenue)}</div>
          <div className="label">Total revenue</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="custom-card">
          <div className="card-title">Sales trend</div>
          {renderTrend(salesSummary.trend)}
        </div>

        <div className="stack">
          <div className="custom-card">
            <div className="section-head">
              <h3 className="font-bold">Low stock</h3>
              {(has('INVENTORY_REQUEST') || has('STOCK_REQUEST_CREATE')) && (
                <Button
                  size="sm"
                  onClick={() => setIsRequestModalOpen(true)}
                  className="bg-[#E2542A] hover:bg-[#c9431c] text-white"
                >
                  Request Stock
                </Button>
              )}
            </div>
            {lowStock.length > 0 ? (
              <div className="divide-y divide-[#E4E7EA]">
                {lowStock.map((r) => (
                  <div key={r.productId} className="notif-item spread">
                    <span className="font-medium text-sm">{r.name}</span>
                    <span
                      className={`pill ${
                        r.status === 'OUT_OF_STOCK' ? 'pill-bad' : 'pill-warn'
                      }`}
                    >
                      {r.quantity} left
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty">Stock levels look healthy.</div>
            )}
          </div>

          <div className="custom-card">
            <div className="card-title">Pending stock requests</div>
            {pendingRequests.length > 0 ? (
              <div className="divide-y divide-[#E4E7EA]">
                {pendingRequests.map((r) => (
                  <div key={r.id} className="notif-item spread">
                    <span className="text-sm font-medium">
                      {r.quantity}x {r.productName}
                    </span>
                    {statusPill(r.status)}
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty">Nothing pending.</div>
            )}
          </div>
        </div>
      </div>

      <RequestStockDialog
        open={isRequestModalOpen}
        rows={inventoryRows}
        onClose={() => setIsRequestModalOpen(false)}
        onSuccess={loadDashboardData}
      />
    </div>
  )
}
