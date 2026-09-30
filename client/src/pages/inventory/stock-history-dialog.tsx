import React, { useState, useEffect, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import { fmtDate, isImg } from '@/lib/utils'
import { toast } from 'sonner'
import { History, Search, ArrowUpRight, ArrowDownLeft, ShoppingCart, RefreshCw } from 'lucide-react'

interface StockMovement {
  id: string
  storeId: string
  productId: string
  type: 'RECEIVE' | 'DISPATCH' | 'SALE' | 'TRANSFER_IN' | 'TRANSFER_OUT'
  quantity: number
  actorId: string
  note?: string | null
  createdAt: string
}

interface ProductInfo {
  id: string
  name: string
  barcode: string
  image?: string
}

interface StockHistoryDialogProps {
  open: boolean
  onClose: () => void
  storeName?: string
}

export const StockHistoryDialog: React.FC<StockHistoryDialogProps> = ({
  open,
  onClose,
  storeName,
}) => {
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [products, setProducts] = useState<ProductInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState<'ALL' | 'SALE' | 'DISPATCH' | 'RECEIVE'>('ALL')
  const [searchQuery, setSearchQuery] = useState('')

  const loadData = async () => {
    setLoading(true)
    try {
      const [movData, prodData] = await Promise.all([
        api<StockMovement[]>('/inventory/movements').catch(() => []),
        api<ProductInfo[]>('/products').catch(() => []),
      ])
      setMovements(movData || [])
      setProducts(prodData || [])
    } catch (err: any) {
      toast.error(err.message || 'Failed to load stock movements')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) {
      loadData()
    }
  }, [open])

  const productMap = useMemo(() => {
    const map = new Map<string, ProductInfo>()
    products.forEach((p) => map.set(p.id, p))
    return map
  }, [products])

  const filteredMovements = useMemo(() => {
    return movements.filter((m) => {
      // Type filter
      if (filterType !== 'ALL' && m.type !== filterType) return false

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const prod = productMap.get(m.productId)
        const matchName = prod?.name?.toLowerCase().includes(q)
        const matchBarcode = prod?.barcode?.toLowerCase().includes(q)
        const matchNote = m.note?.toLowerCase().includes(q)
        const matchId = m.id.toLowerCase().includes(q)
        if (!matchName && !matchBarcode && !matchNote && !matchId) return false
      }

      return true
    })
  }, [movements, filterType, searchQuery, productMap])

  const getTypeBadge = (type: StockMovement['type']) => {
    switch (type) {
      case 'RECEIVE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#E4F3EA] text-[#2F8F5B]">
            <ArrowDownLeft size={13} />
            Receive / Order
          </span>
        )
      case 'DISPATCH':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FBF0DC] text-[#C98A1E]">
            <ArrowUpRight size={13} />
            Stock Dispatch
          </span>
        )
      case 'SALE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FCE7DE] text-[#E2542A]">
            <ShoppingCart size={13} />
            Retail Sale
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#EAEBED] text-neutral-600">
            {type}
          </span>
        )
    }
  }

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="sm:max-w-5xl md:max-w-6xl w-[95vw] max-w-6xl max-h-[88vh] flex flex-col bg-white p-6 rounded-lg shadow-xl">
        <DialogHeader className="pb-3 border-b border-line">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="text-[#E2542A]" size={22} />
              <div>
                <DialogTitle className="text-lg font-bold">
                  Stock Movement History
                </DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {storeName ? `${storeName} · ` : ''}Audit trail of sales, dispatches, and incoming replenishment
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              disabled={loading}
              className="text-xs h-8 gap-1.5"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              Refresh
            </Button>
          </div>
        </DialogHeader>

        {/* Filter Bar */}
        <div className="flex flex-col sm:flex-row gap-3 py-3 items-center justify-between">
          <div className="flex items-center gap-1.5 p-1 bg-neutral-100 rounded-lg w-full sm:w-auto text-xs font-medium">
            <button
              onClick={() => setFilterType('ALL')}
              className={`px-3 py-1.5 rounded-md transition-all ${
                filterType === 'ALL'
                  ? 'bg-white text-black font-bold shadow-sm'
                  : 'text-muted-foreground hover:text-black'
              }`}
            >
              All ({movements.length})
            </button>
            <button
              onClick={() => setFilterType('SALE')}
              className={`px-3 py-1.5 rounded-md transition-all ${
                filterType === 'SALE'
                  ? 'bg-white text-[#E2542A] font-bold shadow-sm'
                  : 'text-muted-foreground hover:text-black'
              }`}
            >
              🛒 Sales ({movements.filter((m) => m.type === 'SALE').length})
            </button>
            <button
              onClick={() => setFilterType('DISPATCH')}
              className={`px-3 py-1.5 rounded-md transition-all ${
                filterType === 'DISPATCH'
                  ? 'bg-white text-[#C98A1E] font-bold shadow-sm'
                  : 'text-muted-foreground hover:text-black'
              }`}
            >
              📦 Dispatches ({movements.filter((m) => m.type === 'DISPATCH').length})
            </button>
            <button
              onClick={() => setFilterType('RECEIVE')}
              className={`px-3 py-1.5 rounded-md transition-all ${
                filterType === 'RECEIVE'
                  ? 'bg-white text-[#2F8F5B] font-bold shadow-sm'
                  : 'text-muted-foreground hover:text-black'
              }`}
            >
              📥 Received ({movements.filter((m) => m.type === 'RECEIVE').length})
            </button>
          </div>

          <div className="relative w-full sm:w-64">
            <Search size={14} className="absolute left-3 top-2.5 text-muted-foreground" />
            <Input
              placeholder="Search by name or barcode…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 text-xs h-8"
            />
          </div>
        </div>

        {/* Movements Table */}
        <div className="flex-1 overflow-y-auto border border-line rounded-md">
          {loading ? (
            <div className="empty">Loading stock movements…</div>
          ) : (
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-neutral-50 sticky top-0 border-b border-line text-muted-foreground font-semibold">
                <tr>
                  <th className="py-2.5 px-3 text-left w-36">Timestamp</th>
                  <th className="py-2.5 px-3 text-center w-44">Type</th>
                  <th className="py-2.5 px-3 text-left">Product</th>
                  <th className="py-2.5 px-3 text-left font-mono w-28">Barcode</th>
                  <th className="py-2.5 px-3 text-right font-mono w-24">Change</th>
                  <th className="py-2.5 px-3 text-left w-48">Note / Destination</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E7EA]">
                {filteredMovements.length > 0 ? (
                  filteredMovements.map((m) => {
                    const prod = productMap.get(m.productId)
                    const isPositive = m.type === 'RECEIVE'
                    return (
                      <tr key={m.id} className="row-hover">
                        <td className="py-2.5 px-3 font-mono text-muted-foreground text-xs whitespace-nowrap">
                          {fmtDate(m.createdAt)}
                        </td>
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          {getTypeBadge(m.type)}
                        </td>
                        <td className="py-2.5 px-3 font-medium">
                          {isImg(prod?.image) ? (
                            <img alt={prod?.name} className="w-5 h-5 object-contain inline-block mr-1.5 rounded align-middle" src={prod?.image} />
                          ) : (
                            <span className="mr-1.5 text-base">{prod?.image || '📦'}</span>
                          )}
                          {prod?.name || m.productId}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-muted-foreground text-xs">
                          {prod?.barcode || '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold">
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
                        <td className="py-2.5 px-3 text-muted-foreground text-xs truncate max-w-xs">
                          {m.note || '—'}
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="empty py-12 text-center text-muted-foreground">
                      No stock movements found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        <div className="pt-3 border-t border-line flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
