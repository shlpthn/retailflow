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
  quantity: number
}

interface RequestStockDialogProps {
  open: boolean
  rows: InventoryRow[]
  onClose: () => void
  onSuccess: () => void
}

export const RequestStockDialog: React.FC<RequestStockDialogProps> = ({
  open,
  rows,
  onClose,
  onSuccess,
}) => {
  const [selectedProductId, setSelectedProductId] = useState<string>(rows[0]?.productId || '')
  const [quantity, setQuantity] = useState<number>(20)
  const [note, setNote] = useState<string>('')
  const [loading, setLoading] = useState(false)

  React.useEffect(() => {
    if (rows.length && !selectedProductId) {
      setSelectedProductId(rows[0].productId)
    }
  }, [rows, selectedProductId])

  const handleSend = async () => {
    if (!selectedProductId || quantity <= 0) return
    setLoading(true)
    try {
      await api('/stock-requests', {
        method: 'POST',
        body: {
          productId: selectedProductId,
          quantity: Number(quantity),
          note: note.trim() || null,
        },
      })
      toast.success('Stock request sent to Head Office')
      onSuccess()
      onClose()
    } catch (err: any) {
      toast.error(err.message || 'Request failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="max-w-md bg-white p-6">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">Request Stock</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 my-2">
          <div className="field">
            <Label htmlFor="req-prod-select">Product</Label>
            <select
              id="req-prod-select"
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="w-full mt-1.5 p-2 border rounded-md font-medium bg-white"
            >
              {rows.map((r) => (
                <option key={r.productId} value={r.productId}>
                  {r.name} — currently {r.quantity}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <Label htmlFor="req-qty-input">Quantity requested</Label>
            <Input
              id="req-qty-input"
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
              className="mt-1.5"
            />
          </div>

          <div className="field">
            <Label htmlFor="req-note-input">Note (optional)</Label>
            <Input
              id="req-note-input"
              placeholder="e.g. Expecting high weekend demand"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1.5"
            />
          </div>
        </div>

        <DialogFooter className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={loading}
            className="bg-[#E2542A] hover:bg-[#c9431c] text-white"
          >
            {loading ? 'Sending…' : 'Send request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
