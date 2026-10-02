import React, { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'

export interface StockRequestItem {
  id: string
  storeId: string
  storeName: string
  productId: string
  productName: string
  quantity: number
  status: string
  fulfillment?: {
    type: 'TRANSFER' | 'FACTORY'
    transferId?: string
    factoryOrderId?: string
  }
}

interface ApproveDialogProps {
  open: boolean
  request: StockRequestItem | null
  onClose: () => void
  onSuccess: () => void
}

export const ApproveDialog: React.FC<ApproveDialogProps> = ({
  open,
  request,
  onClose,
  onSuccess,
}) => {
  const { stores } = useAuth()
  const [fulfillmentType, setFulfillmentType] = useState<'TRANSFER' | 'FACTORY'>('TRANSFER')
  const otherStores = stores.filter((s) => s.id !== request?.storeId)
  const [sourceStoreId, setSourceStoreId] = useState<string>(otherStores[0]?.id || '')
  const [loading, setLoading] = useState(false)

  React.useEffect(() => {
    if (otherStores.length && !sourceStoreId) {
      setSourceStoreId(otherStores[0].id)
    }
  }, [otherStores, sourceStoreId])

  if (!request) return null

  const handleApprove = async () => {
    if (fulfillmentType === 'TRANSFER' && !sourceStoreId) {
      toast.error('Please select a source store for transfer')
      return
    }
    setLoading(true)
    try {
      await api(`/stock-requests/${request.id}/approve`, {
        method: 'POST',
        body: {
          fulfillmentType,
          sourceStoreId: fulfillmentType === 'TRANSFER' ? sourceStoreId : undefined,
        },
      })
      toast.success('Request approved')
      onSuccess()
      onClose()
    } catch (err: any) {
      toast.error(err.message || 'Failed to approve request')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="max-w-md bg-white p-6">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">
            Approve — {request.quantity}x {request.productName}
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">for {request.storeName}</p>
        </DialogHeader>

        <div className="space-y-4 my-2">
          <div className="field">
            <Label htmlFor="ff-type">Fulfillment source</Label>
            <select
              id="ff-type"
              value={fulfillmentType}
              onChange={(e) => setFulfillmentType(e.target.value as 'TRANSFER' | 'FACTORY')}
              className="w-full mt-1.5 p-2 border rounded-md font-medium bg-white"
            >
              <option value="TRANSFER">Transfer from another store</option>
              <option value="FACTORY">Order from factory/supplier</option>
            </select>
          </div>

          {fulfillmentType === 'TRANSFER' && (
            <div className="field">
              <Label htmlFor="source-store">Source store</Label>
              <select
                id="source-store"
                value={sourceStoreId}
                onChange={(e) => setSourceStoreId(e.target.value)}
                className="w-full mt-1.5 p-2 border rounded-md font-medium bg-white"
              >
                {otherStores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleApprove}
            disabled={loading}
            className="bg-[#E2542A] hover:bg-[#c9431c] text-white"
          >
            {loading ? 'Approving…' : 'Approve'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
