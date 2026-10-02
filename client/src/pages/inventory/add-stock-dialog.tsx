import React, { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { api } from '@/lib/api'

interface InventoryRow {
  productId: string
  name: string
  barcode: string
  quantity: number
}

interface StockDialogProps {
  open: boolean
  mode: 'add-stock' | 'dispatch-stock'
  rows: InventoryRow[]
  onClose: () => void
  onSuccess: () => void
}

export const AddStockDialog: React.FC<StockDialogProps> = ({
  open,
  mode,
  rows,
  onClose,
  onSuccess,
}) => {
  const [selectedProductId, setSelectedProductId] = useState<string>(rows[0]?.productId || '')
  const [quantity, setQuantity] = useState<number>(1)
  const [barcodeInput, setBarcodeInput] = useState<string>('')
  const [loading, setLoading] = useState(false)

  const title = mode === 'add-stock' ? 'Add Stock' : 'Dispatch Stock'

  // Sync default selection if rows change
  React.useEffect(() => {
    if (rows.length && !selectedProductId) {
      setSelectedProductId(rows[0].productId)
    }
  }, [rows, selectedProductId])

  const handleBarcodeEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    const val = barcodeInput.trim()
    const found = rows.find((r) => r.barcode === val)
    if (found) {
      setSelectedProductId(found.productId)
      toast.success(`Selected ${found.name}`)
    } else {
      toast.error('Barcode not found')
    }
  }

  const handleConfirm = async () => {
    if (!selectedProductId || quantity <= 0) return
    setLoading(true)
    try {
      await api(`/inventory/${mode}`, {
        method: 'POST',
        body: {
          productId: selectedProductId,
          quantity: Number(quantity),
        },
      })
      toast.success(`${title} recorded`)
      onSuccess()
      onClose()
    } catch (err: any) {
      toast.error(err.message || 'Operation failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="max-w-md bg-white p-6">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 my-2">
          <div className="scanner-box py-3 mb-0">
            <Input
              placeholder="Scan barcode and press Enter…"
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              onKeyDown={handleBarcodeEnter}
              className="text-center font-mono"
            />
          </div>

          <div className="field">
            <Label htmlFor="stock-prod-select">Product</Label>
            <select
              id="stock-prod-select"
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="w-full mt-1.5 p-2 border rounded-md font-medium bg-white"
            >
              {rows.map((r) => (
                <option key={r.productId} value={r.productId}>
                  {r.name} ({r.barcode})
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <Label htmlFor="stock-qty-input">Quantity</Label>
            <Input
              id="stock-qty-input"
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
              className="mt-1.5"
            />
          </div>
        </div>

        <DialogFooter className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={loading}
            className="bg-[#E2542A] hover:bg-[#c9431c] text-white"
          >
            {loading ? 'Confirming…' : 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
