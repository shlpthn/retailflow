import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { fmtMoney } from '@/lib/utils'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ArrowRight } from 'lucide-react'
import { PageIcon } from '@/lib/page-icons'

interface StoreSalesData {
  storeId: string
  storeName: string
  summary: {
    revenue: number
    transactions: number
  }
}

export const HomePage: React.FC = () => {
  const { stores, setSelectedStoreId } = useAuth()
  const navigate = useNavigate()

  const [perStoreSales, setPerStoreSales] = useState<StoreSalesData[]>([])
  const [pendingRequestsCount, setPendingRequestsCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadHomeData = async () => {
      setLoading(true)
      try {
        const salesPromises = stores.map((s) =>
          api<StoreSalesData>(`/sales?storeId=${encodeURIComponent(s.id)}`).catch(() => ({
            storeId: s.id,
            storeName: s.name,
            summary: { revenue: 0, transactions: 0 },
          }))
        )
        const [salesResults, reqs] = await Promise.all([
          Promise.all(salesPromises),
          api<any[]>('/stock-requests').catch(() => []),
        ])

        setPerStoreSales(salesResults)
        const pending = reqs.filter((r) => !['COMPLETED', 'REJECTED'].includes(r.status)).length
        setPendingRequestsCount(pending)
      } catch (err: any) {
        toast.error(err.message || 'Failed to load organization overview')
      } finally {
        setLoading(false)
      }
    }

    if (stores.length > 0) {
      loadHomeData()
    } else {
      setLoading(false)
    }
  }, [stores])

  const totalRevenue = perStoreSales.reduce((sum, r) => sum + (r.summary?.revenue || 0), 0)
  const totalTx = perStoreSales.reduce((sum, r) => sum + (r.summary?.transactions || 0), 0)

  const handleOpenStore = (storeId: string) => {
    setSelectedStoreId(storeId)
    navigate(`/store-detail/${storeId}`)
  }

  return (
    <div>
      <div className="custom-card shadow-sm mb-4">
        <div className="flex items-center gap-2.5 mb-1.5">
          <PageIcon name="home" className="w-5 h-5 text-neutral-800" />
          <h3 className="font-bold text-base">Running the network, store by store</h3>
        </div>
        <p className="text-muted-foreground text-xs sm:text-sm max-w-2xl leading-relaxed">
          RetailFlow keeps every store's inventory, sales and stock requests visible from one
          place, so fulfillment decisions are made with full visibility instead of a phone call
          to each store.
        </p>
      </div>

      <div className="grid-4 mb-4">
        <div className="custom-card stat shadow-sm hover:-translate-y-1 hover:shadow-md transition-all duration-200">
          <div className="num text-2xl font-bold">{stores.length}</div>
          <div className="label text-xs text-muted-foreground">Stores</div>
        </div>
        <div className="custom-card stat shadow-sm hover:-translate-y-1 hover:shadow-md transition-all duration-200">
          <div className="num text-2xl font-bold text-[#E2542A]">{fmtMoney(totalRevenue)}</div>
          <div className="label text-xs text-muted-foreground">Network revenue</div>
        </div>
        <div className="custom-card stat shadow-sm hover:-translate-y-1 hover:shadow-md transition-all duration-200">
          <div className="num text-2xl font-bold">{totalTx}</div>
          <div className="label text-xs text-muted-foreground">Total transactions</div>
        </div>
        <div className="custom-card stat shadow-sm hover:-translate-y-1 hover:shadow-md transition-all duration-200">
          <div className="num text-2xl font-bold text-[#3B82C4]">
            {pendingRequestsCount !== null ? pendingRequestsCount : '…'}
          </div>
          <div className="label text-xs text-muted-foreground">Pending stock requests</div>
        </div>
      </div>

      <div className="custom-card shadow-sm">
        <div className="card-title pb-1 border-b border-line mb-3">Stores at a glance</div>
        {loading ? (
          <div className="empty py-12">Loading network statistics…</div>
        ) : (
          <div className="overflow-x-auto border border-line rounded-md">
            <table className="w-full text-xs sm:text-sm">
              <thead className="bg-neutral-50 border-b border-line text-muted-foreground font-semibold">
                <tr>
                  <th className="py-2.5 px-3 text-left">Store Name</th>
                  <th className="py-2.5 px-3 text-right font-mono w-40">Revenue</th>
                  <th className="py-2.5 px-3 text-right font-mono w-36">Transactions</th>
                  <th className="py-2.5 px-3 text-right w-44">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E7EA]">
                {stores.length > 0 ? (
                  stores.map((s, idx) => {
                    const sale = perStoreSales[idx]?.summary || { revenue: 0, transactions: 0 }
                    return (
                      <tr key={s.id} className="row-hover">
                        <td className="py-2.5 px-3 font-medium text-left">{s.name}</td>
                        <td className="py-2.5 px-3 text-right mono font-bold text-sm text-[#E2542A]">
                          {fmtMoney(sale.revenue)}
                        </td>
                        <td className="py-2.5 px-3 text-right mono font-medium">
                          {sale.transactions}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenStore(s.id)}
                            className="text-xs h-7 text-muted-foreground hover:text-black gap-1"
                          >
                            Open dashboard
                            <ArrowRight size={13} />
                          </Button>
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={4} className="empty py-10 text-center text-muted-foreground">
                      No stores available.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
