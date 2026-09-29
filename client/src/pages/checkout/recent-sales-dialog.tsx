import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { fmtMoney, fmtDate } from '@/lib/utils'
import { toast } from 'sonner'
import { History, Receipt as ReceiptIcon, RefreshCw } from 'lucide-react'
import { ReceiptDialog, type SaleReceipt } from './receipt-dialog'

interface RecentSalesDialogProps {
  open: boolean
  onClose: () => void
  storeId?: string | null
}

export const RecentSalesDialog: React.FC<RecentSalesDialogProps> = ({
  open,
  onClose,
  storeId,
}) => {
  const [sales, setSales] = useState<SaleReceipt[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedReceipt, setSelectedReceipt] = useState<SaleReceipt | null>(null)
  const [isReceiptOpen, setIsReceiptOpen] = useState(false)

  const loadSales = async () => {
    setLoading(true)
    try {
      const data = await api<{ sales: SaleReceipt[] }>(
        `/sales?storeId=${encodeURIComponent(storeId || '')}`
      )
      setSales((data?.sales || []).slice(-30).reverse())
    } catch (err: any) {
      toast.error(err.message || 'Failed to load recent orders')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) {
      loadSales()
    }
  }, [open, storeId])

  const handleOpenReceipt = (receipt: SaleReceipt) => {
    setSelectedReceipt(receipt)
    setIsReceiptOpen(true)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
        <DialogContent className="sm:max-w-2xl max-w-2xl w-full max-h-[85vh] flex flex-col bg-white p-5 sm:p-6 rounded-xl shadow-2xl">
          <DialogHeader className="pb-3 border-b border-line flex flex-row items-center justify-between pr-10">
            <div className="flex items-center gap-2">
              <History className="text-[#E2542A]" size={20} />
              <DialogTitle className="text-base font-bold">
                Recent Checkout Orders
              </DialogTitle>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={loadSales}
              disabled={loading}
              className="text-xs h-7 gap-1"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              Refresh
            </Button>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto my-3 border border-line rounded-lg">
            {loading ? (
              <div className="empty py-12">Loading recent checkout orders…</div>
            ) : sales.length > 0 ? (
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-neutral-50 sticky top-0 border-b border-line text-muted-foreground font-semibold">
                  <tr>
                    <th className="py-2.5 px-3.5 text-left w-24">Receipt ID</th>
                    <th className="py-2.5 px-3.5 text-left">Date &amp; Time</th>
                    <th className="py-2.5 px-3.5 text-center w-24">Items</th>
                    <th className="py-2.5 px-3.5 text-right font-mono w-28">Total Amount</th>
                    <th className="py-2.5 px-3.5 text-center w-24">Payment</th>
                    <th className="py-2.5 px-3.5 text-right w-24" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4E7EA]">
                  {sales.map((s) => (
                    <tr key={s.id} className="row-hover">
                      <td className="py-2.5 px-3.5 font-mono font-bold text-xs text-[#15181D]">
                        {s.id}
                      </td>
                      <td className="py-2.5 px-3.5 text-muted-foreground text-xs whitespace-nowrap">
                        {fmtDate(s.createdAt)}
                      </td>
                      <td className="py-2.5 px-3.5 text-center">
                        <span className="px-2 py-0.5 rounded-full bg-neutral-100 text-xs font-semibold">
                          {s.items?.length || 0} items
                        </span>
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-mono font-bold text-[#E2542A]">
                        {fmtMoney(s.total)}
                      </td>
                      <td className="py-2.5 px-3.5 text-center text-xs text-muted-foreground">
                        {s.paymentMethod}
                      </td>
                      <td className="py-2.5 px-3.5 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenReceipt(s)}
                          className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-black"
                        >
                          <ReceiptIcon size={13} />
                          Receipt
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty py-12">No checkout transactions recorded recently.</div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ReceiptDialog
        open={isReceiptOpen}
        sale={selectedReceipt}
        onClose={() => setIsReceiptOpen(false)}
      />
    </>
  )
}
