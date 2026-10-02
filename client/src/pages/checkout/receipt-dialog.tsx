import React from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { fmtMoney } from '@/lib/utils'
import { useAuth } from '@/hooks/use-auth'
import { Printer, CheckCircle2 } from 'lucide-react'

export interface SaleReceipt {
  id: string
  storeId: string
  cashierName: string
  createdAt: string
  items: Array<{
    productId: string
    name: string
    quantity: number
    unitPrice: number
  }>
  subtotal: number
  discount: number
  promotionCode?: string | null
  total: number
  paymentMethod: string
}

interface ReceiptDialogProps {
  open: boolean
  sale: SaleReceipt | null
  onClose: () => void
}

export const ReceiptDialog: React.FC<ReceiptDialogProps> = ({ open, sale, onClose }) => {
  const { storeName } = useAuth()
  if (!sale) return null

  const handlePrint = () => {
    window.print()
  }

  const receiptText = `RetailFlow — ${storeName(sale.storeId)}
Receipt #${sale.id}
Cashier: ${sale.cashierName}
${new Date(sale.createdAt).toLocaleString()}
------------------------------------------
${sale.items
  .map(
    (i) =>
      `${i.quantity} x ${i.name.padEnd(20)} ${fmtMoney(i.unitPrice * i.quantity)}`
  )
  .join('\n')}
------------------------------------------
Subtotal        ${fmtMoney(sale.subtotal)}
Discount        -${fmtMoney(sale.discount)}${
    sale.promotionCode ? ` (${sale.promotionCode})` : ''
  }
TOTAL           ${fmtMoney(sale.total)}
Paid via ${sale.paymentMethod}
Thank you!`

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="max-w-md bg-white p-6 shadow-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="text-[#2F8F5B]" size={20} />
            <DialogTitle className="text-lg font-bold">Sale Complete</DialogTitle>
          </div>
        </DialogHeader>

        <div className="receipt printable-receipt my-3 leading-relaxed whitespace-pre font-mono text-xs bg-neutral-50 p-4 border border-dashed border-line rounded">
          {receiptText}
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2 mt-2">
          <Button
            type="button"
            variant="outline"
            onClick={handlePrint}
            className="flex-1 gap-1.5 text-xs h-9"
          >
            <Printer size={15} />
            Print Receipt
          </Button>
          <Button
            type="button"
            onClick={onClose}
            className="flex-1 bg-[#E2542A] hover:bg-[#c9431c] text-white text-xs h-9 font-bold"
          >
            New Sale
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
