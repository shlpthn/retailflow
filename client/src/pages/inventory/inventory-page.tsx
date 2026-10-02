import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { toast } from 'sonner'
import { isImg } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AddStockDialog } from './add-stock-dialog'
import { RequestStockDialog } from './request-stock-dialog'
import { StockHistoryDialog } from './stock-history-dialog'
import { History, Search, ArrowDownLeft } from 'lucide-react'
import { PageIcon } from '@/lib/page-icons'

interface InventoryRow {
  productId: string
  name: string
  barcode: string
  quantity: number
  status: 'OUT_OF_STOCK' | 'LOW_STOCK' | 'OK'
  image?: string
}

interface InventoryData {
  storeId: string
  storeName: string
  rows: InventoryRow[]
  activityPanel: {
    lowStockAlerts: Array<{ productId: string; name: string; quantity: number }>
    pendingRequests: Array<{ id: string; productId: string; quantity: number; status: string }>
  }
}

interface Transfer {
  id: string
  sourceStoreId: string
  sourceStoreName: string
  destinationStoreId: string
  destinationStoreName: string
  productId: string
  productName: string
  quantity: number
  status: 'PENDING_DISPATCH' | 'IN_TRANSIT' | 'COMPLETED'
}

interface FactoryOrder {
  id: string
  destinationStoreId: string
  destinationStoreName: string
  productName: string
  quantity: number
  status: 'ORDERED' | 'RECEIVED'
}

interface RecentMovement {
  id: string
  storeId: string
  productId: string
  type: string
  quantity: number
  createdAt: string
}

export const InventoryPage: React.FC = () => {
  const { user, selectedStoreId, has, hasAny } = useAuth()
  const currentStoreId = user?.storeId || selectedStoreId

  const [inventory, setInventory] = useState<InventoryData | null>(null)
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [factoryOrders, setFactoryOrders] = useState<FactoryOrder[]>([])
  const [recentMovements, setRecentMovements] = useState<RecentMovement[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  // Dialog states
  const [stockModalMode, setStockModalMode] = useState<'add-stock' | 'dispatch-stock' | null>(null)
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false)
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false)
  const [historyModalTab, setHistoryModalTab] = useState<'movements' | 'restocks'>('movements')

  const loadData = useCallback(async () => {
    if (!currentStoreId) return
    setLoading(true)
    try {
      const [invData, transfersData, movementsData] = await Promise.all([
        api<InventoryData>(`/inventory?storeId=${encodeURIComponent(currentStoreId)}`),
        hasAny('INVENTORY_VIEW', 'STOCK_REQUEST_APPROVE')
          ? api<Transfer[]>('/transfers').catch(() => [])
          : Promise.resolve([]),
        has('INVENTORY_VIEW')
          ? api<RecentMovement[]>('/inventory/movements').catch(() => [])
          : Promise.resolve([]),
      ])

      setInventory(invData)
      setTransfers(transfersData || [])
      setRecentMovements((movementsData || []).slice(0, 8))

      if (has('INVENTORY_RECEIVE')) {
        try {
          const orders = await api<FactoryOrder[]>('/transfers/factory-orders')
          setFactoryOrders(orders?.filter((o) => o.status === 'ORDERED') || [])
        } catch {
          setFactoryOrders([])
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to load inventory')
    } finally {
      setLoading(false)
    }
  }, [currentStoreId, has, hasAny])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleTransferAction = async (id: string, action: 'dispatch' | 'receive') => {
    try {
      await api(`/transfers/${id}/${action}`, { method: 'POST' })
      toast.success('Transfer updated')
      loadData()
    } catch (err: any) {
      toast.error(err.message || 'Failed to update transfer')
    }
  }

  const handleFactoryReceive = async (id: string) => {
    try {
      await api(`/transfers/factory-orders/${id}/receive`, { method: 'POST' })
      toast.success('Received into inventory')
      loadData()
    } catch (err: any) {
      toast.error(err.message || 'Failed to receive order')
    }
  }

  const statusPill = (status: string) => {
    if (status === 'OUT_OF_STOCK') return <span className="pill pill-bad">Out of stock</span>
    if (status === 'LOW_STOCK') return <span className="pill pill-warn">Low stock</span>
    return <span className="pill pill-ok">OK</span>
  }

  const filteredRows = useMemo(() => {
    if (!inventory?.rows) return []
    if (!searchQuery.trim()) return inventory.rows
    const q = searchQuery.toLowerCase()
    return inventory.rows.filter(
      (r) => r.name.toLowerCase().includes(q) || r.barcode.toLowerCase().includes(q)
    )
  }, [inventory?.rows, searchQuery])

  if (loading && !inventory) {
    return <div className="empty">Loading inventory…</div>
  }

  if (!inventory) {
    return <div className="empty">No inventory data available.</div>
  }

  const outgoing = transfers.filter(
    (t) => t.sourceStoreId === currentStoreId && t.status === 'PENDING_DISPATCH'
  )
  const incoming = transfers.filter(
    (t) => t.destinationStoreId === currentStoreId && t.status === 'IN_TRANSIT'
  )

  const alertItems: Array<{
    id: string
    text: string
    action?: { label: string; fn: () => void }
  }> = []

  inventory.activityPanel.lowStockAlerts.forEach((r) =>
    alertItems.push({ id: `low-${r.productId}`, text: `Low stock: ${r.name} (${r.quantity} left)` })
  )

  inventory.activityPanel.pendingRequests.forEach((r) =>
    alertItems.push({
      id: `req-${r.id}`,
      text: `Stock request ${r.id.slice(-4)} for ${r.quantity}x is ${r.status
        .replace(/_/g, ' ')
        .toLowerCase()}`,
    })
  )

  outgoing.forEach((t) =>
    alertItems.push({
      id: `out-${t.id}`,
      text: `Dispatch ${t.quantity}x ${t.productName} → ${t.destinationStoreName}`,
      action: has('TRANSFER_DISPATCH')
        ? { label: 'Dispatch', fn: () => handleTransferAction(t.id, 'dispatch') }
        : undefined,
    })
  )

  incoming.forEach((t) =>
    alertItems.push({
      id: `in-${t.id}`,
      text: `Incoming ${t.quantity}x ${t.productName} from ${t.sourceStoreName}`,
      action: has('TRANSFER_RECEIVE')
        ? { label: 'Receive', fn: () => handleTransferAction(t.id, 'receive') }
        : undefined,
    })
  )

  factoryOrders.forEach((o) =>
    alertItems.push({
      id: `fo-${o.id}`,
      text: `Factory order: ${o.quantity}x ${o.productName} arriving`,
      action: has('INVENTORY_RECEIVE')
        ? { label: 'Mark received', fn: () => handleFactoryReceive(o.id) }
        : undefined,
    })
  )

  return (
    <div className="grid-2">
      <div className="custom-card shadow-sm">
        <div className="section-head flex flex-wrap gap-2 items-center justify-between pb-2 border-b border-line mb-3">
          <div className="flex items-center gap-2.5">
            <PageIcon name="inventory" className="w-5 h-5 text-neutral-800" />
            <div>
              <h3 className="font-bold text-base">{inventory.storeName} — stock on hand</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Manage branch stock levels, dispatches, and inventory movements
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setHistoryModalTab('movements')
                setIsHistoryModalOpen(true)
              }}
              className="gap-1.5 text-xs h-8 text-neutral-700 hover:text-black font-medium"
            >
              <History size={14} className="text-[#E2542A]" />
              Movements
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setHistoryModalTab('restocks')
                setIsHistoryModalOpen(true)
              }}
              className="gap-1.5 text-xs h-8 text-neutral-700 hover:text-black font-medium"
            >
              <ArrowDownLeft size={14} className="text-[#2F8F5B]" />
              Restocks
            </Button>
            {has('INVENTORY_RECEIVE') && (
              <Button
                size="sm"
                className="bg-[#15181D] hover:bg-[#23272F] text-white text-xs h-8"
                onClick={() => setStockModalMode('add-stock')}
              >
                + Add Stock
              </Button>
            )}
            {has('INVENTORY_DISPATCH') && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-8"
                onClick={() => setStockModalMode('dispatch-stock')}
              >
                Dispatch Stock
              </Button>
            )}
            {(has('INVENTORY_REQUEST') || has('STOCK_REQUEST_CREATE')) && (
              <Button
                size="sm"
                className="bg-[#E2542A] hover:bg-[#c9431c] text-white text-xs h-8 font-semibold"
                onClick={() => setIsRequestModalOpen(true)}
              >
                Request Stock
              </Button>
            )}
          </div>
        </div>

        {/* Live Search Input */}
        <div className="relative mb-3">
          <Search size={14} className="absolute left-3 top-2.5 text-muted-foreground" />
          <Input
            placeholder="Quick search by product name or barcode…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 text-xs h-8 bg-neutral-50/50"
          />
        </div>

        <div className="overflow-x-auto border border-line rounded-md">
          <table className="w-full text-xs sm:text-sm">
            <thead className="bg-neutral-50 border-b border-line text-muted-foreground font-semibold">
              <tr>
                <th className="py-2.5 px-3 text-center w-12">#</th>
                <th className="py-2.5 px-3 text-left">Product</th>
                <th className="py-2.5 px-3 text-left font-mono w-32">Barcode</th>
                <th className="py-2.5 px-3 text-right font-mono w-24">Quantity</th>
                <th className="py-2.5 px-3 text-center w-28">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E7EA]">
              {filteredRows.length > 0 ? (
                filteredRows.map((r) => (
                  <tr key={r.productId} className="row-hover">
                    <td className="py-2 px-3 text-center text-xl">
                      {isImg(r.image) ? (
                        <img alt={r.name} className="w-8 h-8 object-contain mx-auto rounded" src={r.image} />
                      ) : (
                        <span>{r.image || '📦'}</span>
                      )}
                    </td>
                    <td className="py-2 px-3 font-medium text-left">{r.name}</td>
                    <td className="py-2 px-3 font-mono text-muted-foreground text-xs text-left">
                      {r.barcode}
                    </td>
                    <td className="py-2 px-3 text-right mono font-bold text-sm">{r.quantity}</td>
                    <td className="py-2 px-3 text-center">{statusPill(r.status)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="empty py-10 text-center text-muted-foreground">
                    No inventory items found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="stack">
        <div className="custom-card shadow-sm">
          <div className="card-title pb-1 border-b border-line">Activity &amp; alerts</div>
          {alertItems.length > 0 && (
            <div className="divide-y divide-[#E4E7EA] mb-4">
              {alertItems.map((item) => (
                <div key={item.id} className="notif-item spread py-2">
                  <span className="text-xs sm:text-sm">{item.text}</span>
                  {item.action && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={item.action.fn}
                      className="ml-2 h-7 text-xs px-2.5 font-medium hover:bg-neutral-100"
                    >
                      {item.action.label}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Recent Activity: Product, Barcode, Change */}
          <div className={alertItems.length > 0 ? 'pt-3 border-t border-line' : ''}>
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Recent Activity
            </div>
            {recentMovements.length > 0 ? (
              <div className="overflow-x-auto border border-line rounded-md">
                <table className="w-full text-xs">
                  <thead className="bg-neutral-50 border-b border-line text-muted-foreground font-semibold">
                    <tr>
                      <th className="py-2 px-2.5 text-left">Product</th>
                      <th className="py-2 px-2.5 text-left font-mono w-24">Barcode</th>
                      <th className="py-2 px-2.5 text-right font-mono w-20">Change</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E4E7EA]">
                    {recentMovements.map((m) => {
                      const prod = inventory.rows.find((r) => r.productId === m.productId)
                      const isPositive = m.type === 'RECEIVE'
                      return (
                        <tr key={m.id} className="row-hover">
                          <td className="py-2 px-2.5 font-medium text-left truncate max-w-[130px]">
                            {isImg(prod?.image) ? (
                              <img alt={prod?.name} className="w-5 h-5 object-contain inline-block mr-1 rounded align-middle" src={prod?.image} />
                            ) : (
                              <span className="mr-1">{prod?.image || '📦'}</span>
                            )}
                            {prod?.name || m.productId}
                          </td>
                          <td className="py-2 px-2.5 font-mono text-muted-foreground text-xs text-left">
                            {prod?.barcode || '—'}
                          </td>
                          <td className="py-2 px-2.5 text-right font-mono font-bold">
                            <span
                              className={
                                isPositive
                                  ? 'text-[#2F8F5B]'
                                  : m.type === 'DISPATCH'
                                  ? 'text-[#C98A1E]'
                                  : 'text-[#E2542A]'
                              }
                            >
                              {isPositive ? `+${m.quantity}` : `-${m.quantity}`}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : alertItems.length === 0 ? (
              <div className="empty py-8 text-center text-muted-foreground text-xs">
                No recent activity or alerts.
              </div>
            ) : (
              <div className="text-xs text-muted-foreground py-2 text-center">
                No recent movements recorded.
              </div>
            )}
          </div>
        </div>
      </div>

      {stockModalMode && (
        <AddStockDialog
          open={Boolean(stockModalMode)}
          mode={stockModalMode}
          rows={inventory.rows}
          onClose={() => setStockModalMode(null)}
          onSuccess={loadData}
        />
      )}

      <RequestStockDialog
        open={isRequestModalOpen}
        rows={inventory.rows}
        onClose={() => setIsRequestModalOpen(false)}
        onSuccess={loadData}
      />

      <StockHistoryDialog
        open={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        storeId={inventory.storeId}
        storeName={inventory.storeName}
        initialTab={historyModalTab}
      />
    </div>
  )
}
