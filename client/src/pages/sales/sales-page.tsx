import React, { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { fmtMoney, fmtDate } from '@/lib/utils'
import { toast } from 'sonner'
import { DollarSign, ShoppingBag, Receipt, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ReceiptDialog, type SaleReceipt } from '@/pages/checkout/receipt-dialog'

interface SalesData {
  scope: string
  storeName: string
  sales?: SaleReceipt[]
  recentTransactions?: SaleReceipt[]
  summary: {
    todaysSales: number
    transactions: number
    itemsSold: number
    revenue: number
    trend: Array<{ day: string; total: number }>
    bestSellers: Array<{ name: string; qty: number }>
    projection: number
  }
}

export const SalesPage: React.FC = () => {
  const { user, selectedStoreId } = useAuth()
  const targetStoreId = user?.storeId || selectedStoreId

  const [data, setData] = useState<SalesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedReceipt, setSelectedReceipt] = useState<SaleReceipt | null>(null)
  const [isReceiptOpen, setIsReceiptOpen] = useState(false)

  const handleOpenReceipt = (receipt: SaleReceipt) => {
    setSelectedReceipt(receipt)
    setIsReceiptOpen(true)
  }

  const loadSales = useCallback(async () => {
    if (!targetStoreId && user?.role !== 'CASHIER') return
    setLoading(true)
    try {
      const res = await api<SalesData>(
        `/sales?storeId=${encodeURIComponent(targetStoreId || '')}`
      )
      setData(res)
    } catch (err: any) {
      toast.error(err.message || 'Failed to load sales data')
    } finally {
      setLoading(false)
    }
  }, [targetStoreId, user?.role])

  useEffect(() => {
    loadSales()
  }, [loadSales])

  const renderTrend = (trend: Array<{ day: string; total: number }>) => {
    if (!trend || !trend.length) {
      return <div className="empty py-12">No sales recorded yet.</div>
    }
    const max = Math.max(...trend.map((t) => t.total), 1)
    const recent = trend.slice(-14)

    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '130px' }}>
          {recent.map((t, idx) => (
            <div
              key={idx}
              title={`${t.day}: ${fmtMoney(t.total)}`}
              className="group relative cursor-pointer"
              style={{
                flex: 1,
                background: 'var(--accent)',
                opacity: 0.85,
                borderRadius: '3px 3px 0 0',
                height: `${Math.max(4, (t.total / max) * 100)}%`,
                transition: 'all 0.15s ease',
              }}
            />
          ))}
        </div>
        <div className="spread muted text-xs mt-2 font-mono">
          <span>{recent[0]?.day}</span>
          <span>{recent[recent.length - 1]?.day}</span>
        </div>
      </div>
    )
  }

  if (loading && !data) {
    return <div className="empty py-16">Loading sales…</div>
  }

  if (!data) {
    return <div className="empty py-16">No sales data available.</div>
  }

  if (data.scope === 'OWN_TRANSACTIONS') {
    const s = data.summary
    const recentSales = (data.sales || []).slice(-25).reverse()

    return (
      <div>
        <div className="grid-3 mb-4">
          <div className="custom-card stat shadow-sm hover:-translate-y-1 hover:shadow-md transition-all duration-200">
            <div className="flex items-center justify-between text-muted-foreground mb-1">
              <span className="text-xs font-semibold uppercase tracking-wider">Your Sales</span>
              <Receipt size={18} className="text-[#E2542A]" />
            </div>
            <div className="num text-2xl font-bold">{s.transactions}</div>
            <div className="label text-xs text-muted-foreground">Processed transactions</div>
          </div>
          <div className="custom-card stat shadow-sm hover:-translate-y-1 hover:shadow-md transition-all duration-200">
            <div className="flex items-center justify-between text-muted-foreground mb-1">
              <span className="text-xs font-semibold uppercase tracking-wider">Items Sold</span>
              <ShoppingBag size={18} className="text-[#2F8F5B]" />
            </div>
            <div className="num text-2xl font-bold">{s.itemsSold}</div>
            <div className="label text-xs text-muted-foreground">Scanned items count</div>
          </div>
          <div className="custom-card stat shadow-sm hover:-translate-y-1 hover:shadow-md transition-all duration-200">
            <div className="flex items-center justify-between text-muted-foreground mb-1">
              <span className="text-xs font-semibold uppercase tracking-wider">Cashier Revenue</span>
              <DollarSign size={18} className="text-[#3B82C4]" />
            </div>
            <div className="num text-2xl font-bold text-[#E2542A]">{fmtMoney(s.revenue)}</div>
            <div className="label text-xs text-muted-foreground">Total payment received</div>
          </div>
        </div>

        <div className="custom-card shadow-sm">
          <div className="card-title pb-1 border-b border-line mb-3">Your Recent Sales</div>
          <div className="overflow-x-auto border border-line rounded-md">
            <table className="w-full text-xs sm:text-sm">
              <thead className="bg-neutral-50 border-b border-line text-muted-foreground font-semibold">
                <tr>
                  <th className="py-2.5 px-3 text-left w-36 font-mono">Receipt ID</th>
                  <th className="py-2.5 px-3 text-center w-28">Items Count</th>
                  <th className="py-2.5 px-3 text-right font-mono w-36">Total</th>
                  <th className="py-2.5 px-3 text-right font-mono w-40">Timestamp</th>
                  <th className="py-2.5 px-3 text-right w-24" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E7EA]">
                {recentSales.length > 0 ? (
                  recentSales.map((item) => (
                    <tr key={item.id} className="row-hover">
                      <td className="py-2 px-3 mono text-xs font-bold text-left">{item.id}</td>
                      <td className="py-2 px-3 text-center">
                        <span className="px-2 py-0.5 rounded-full bg-neutral-100 text-xs font-semibold">
                          {item.items?.length || 0} items
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right mono font-bold text-sm text-[#E2542A]">
                        {fmtMoney(item.total)}
                      </td>
                      <td className="py-2 px-3 text-right muted font-mono text-xs">
                        {fmtDate(item.createdAt)}
                      </td>
                      <td className="py-2 px-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenReceipt(item)}
                          className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-black"
                        >
                          <Receipt size={13} />
                          Receipt
                        </Button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="empty py-10 text-center text-muted-foreground">
                      No sales recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <ReceiptDialog
          open={isReceiptOpen}
          sale={selectedReceipt}
          onClose={() => setIsReceiptOpen(false)}
        />
      </div>
    )
  }

  const s = data.summary

  return (
    <div>
      <div className="grid-4 mb-4">
        <div className="custom-card stat shadow-sm hover:-translate-y-1 hover:shadow-md transition-all duration-200">
          <div className="num text-2xl font-bold">{fmtMoney(s.todaysSales)}</div>
          <div className="label text-xs text-muted-foreground">Today's Revenue</div>
        </div>
        <div className="custom-card stat shadow-sm hover:-translate-y-1 hover:shadow-md transition-all duration-200">
          <div className="num text-2xl font-bold">{s.transactions}</div>
          <div className="label text-xs text-muted-foreground">Total Transactions</div>
        </div>
        <div className="custom-card stat shadow-sm hover:-translate-y-1 hover:shadow-md transition-all duration-200">
          <div className="num text-2xl font-bold">{s.itemsSold}</div>
          <div className="label text-xs text-muted-foreground">Items Sold</div>
        </div>
        <div className="custom-card stat shadow-sm hover:-translate-y-1 hover:shadow-md transition-all duration-200">
          <div className="num text-2xl font-bold text-[#E2542A]">{fmtMoney(s.revenue)}</div>
          <div className="label text-xs text-muted-foreground">Cumulative Revenue</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="custom-card shadow-sm">
          <div className="card-title flex items-center justify-between pb-1 border-b border-line mb-3">
            <span>Sales trend — {data.storeName}</span>
            <TrendingUp size={16} className="text-[#E2542A]" />
          </div>
          {renderTrend(s.trend)}
        </div>

        <div className="custom-card shadow-sm">
          <div className="card-title pb-1 border-b border-line mb-3">Top Selling Products</div>
          {s.bestSellers.length > 0 ? (
            <div className="divide-y divide-[#E4E7EA]">
              {s.bestSellers.map((b, idx) => (
                <div key={idx} className="notif-item spread py-2">
                  <span className="font-medium text-xs sm:text-sm">{b.name}</span>
                  <span className="mono font-bold text-xs bg-neutral-100 px-2 py-0.5 rounded">
                    {b.qty} sold
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty py-8">No products sold yet.</div>
          )}

          <div className="card-title mt-4 pb-1 border-b border-line">30-Day Projection</div>
          <div className="stat p-2 mt-1">
            <div className="num text-xl font-bold text-[#2F8F5B]">{fmtMoney(s.projection)}</div>
            <div className="label text-xs text-muted-foreground">Estimated based on the past 14-day cycle</div>
          </div>
        </div>
      </div>

      {data.recentTransactions && data.recentTransactions.length > 0 && (
        <div className="custom-card shadow-sm mt-4">
          <div className="card-title pb-1 border-b border-line mb-3">Recent Transactions</div>
          <div className="overflow-x-auto border border-line rounded-md">
            <table className="w-full text-xs sm:text-sm">
              <thead className="bg-neutral-50 border-b border-line text-muted-foreground font-semibold">
                <tr>
                  <th className="py-2.5 px-3 text-left w-36 font-mono">Receipt ID</th>
                  <th className="py-2.5 px-3 text-center w-28">Items</th>
                  <th className="py-2.5 px-3 text-right font-mono w-36">Total</th>
                  <th className="py-2.5 px-3 text-right font-mono w-40">Timestamp</th>
                  <th className="py-2.5 px-3 text-right w-24" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E7EA]">
                {data.recentTransactions.map((item) => (
                  <tr key={item.id} className="row-hover">
                    <td className="py-2 px-3 mono text-xs font-bold text-left">{item.id}</td>
                    <td className="py-2 px-3 text-center">
                      <span className="px-2 py-0.5 rounded-full bg-neutral-100 text-xs font-semibold">
                        {item.items?.length || 0} items
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right mono font-bold text-sm text-[#E2542A]">
                      {fmtMoney(item.total)}
                    </td>
                    <td className="py-2 px-3 text-right muted font-mono text-xs">
                      {fmtDate(item.createdAt)}
                    </td>
                    <td className="py-2 px-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenReceipt(item)}
                        className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-black"
                      >
                        <Receipt size={13} />
                        Receipt
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ReceiptDialog
        open={isReceiptOpen}
        sale={selectedReceipt}
        onClose={() => setIsReceiptOpen(false)}
      />
    </div>
  )
}
