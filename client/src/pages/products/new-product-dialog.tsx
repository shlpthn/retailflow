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

interface NewProductDialogProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export const NewProductDialog: React.FC<NewProductDialogProps> = ({
  open,
  onClose,
  onSuccess,
}) => {
  const [name, setName] = useState('')
  const [barcode, setBarcode] = useState('')
  const [price, setPrice] = useState<string>('')
  const [image, setImage] = useState('')
  const [loading, setLoading] = useState(false)

  const handleCreate = async () => {
    if (!name.trim() || !barcode.trim() || !price) {
      toast.error('Please fill in all required fields')
      return
    }
    setLoading(true)
    try {
      await api('/products', {
        method: 'POST',
        body: {
          name: name.trim(),
          barcode: barcode.trim(),
          price: Number(price),
          image: image.trim() || undefined,
        },
      })
      toast.success('Product created')
      setName('')
      setBarcode('')
      setPrice('')
      setImage('')
      onSuccess()
      onClose()
    } catch (err: any) {
      toast.error(err.message || 'Failed to create product')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="max-w-md bg-white p-6">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">New product</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 my-2">
          <div className="field">
            <Label htmlFor="p-name">Name</Label>
            <Input
              id="p-name"
              placeholder="e.g. Organic Milk"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1.5"
            />
          </div>

          <div className="field">
            <Label htmlFor="p-barcode">Barcode</Label>
            <Input
              id="p-barcode"
              placeholder="e.g. 100000000001"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              className="mt-1.5 font-mono"
            />
          </div>

          <div className="field">
            <Label htmlFor="p-price">Price ($)</Label>
            <Input
              id="p-price"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="mt-1.5 font-mono"
            />
          </div>

          <div className="field">
            <Label htmlFor="p-image">Icon (emoji, optional)</Label>
            <Input
              id="p-image"
              placeholder="📦"
              value={image}
              onChange={(e) => setImage(e.target.value)}
              className="mt-1.5"
            />
          </div>
        </div>

        <DialogFooter className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={loading}
            className="bg-[#E2542A] hover:bg-[#c9431c] text-white"
          >
            {loading ? 'Creating…' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
