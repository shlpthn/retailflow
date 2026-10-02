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

interface Product {
  id: string
  name: string
  barcode: string
  price: number
  image?: string
}

interface NewProductDialogProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  product?: Product | null
}

function generateBarcode(): string {
  const suffix = Date.now().toString().slice(-8)
  const rand = Math.floor(1000 + Math.random() * 9000).toString()
  return `${suffix}${rand}`
}

export const NewProductDialog: React.FC<NewProductDialogProps> = ({
  open,
  onClose,
  onSuccess,
  product,
}) => {
  const [name, setName] = useState('')
  const [barcode, setBarcode] = useState('')
  const [price, setPrice] = useState<string>('')
  const [image, setImage] = useState('')
  const [loading, setLoading] = useState(false)

  React.useEffect(() => {
    if (product) {
      setName(product.name || '')
      setBarcode(product.barcode || '')
      setPrice(product.price != null ? String(product.price) : '')
      setImage(product.image || '')
    } else {
      setName('')
      setBarcode('')
      setPrice('')
      setImage('')
    }
  }, [product, open])

  const handleSave = async () => {
    if (!name.trim() || !price) {
      toast.error('Please enter name and price')
      return
    }
    const finalBarcode = barcode.trim() || generateBarcode()
    setLoading(true)
    try {
      if (product) {
        await api(`/products/${product.id}`, {
          method: 'PUT',
          body: {
            name: name.trim(),
            barcode: finalBarcode,
            price: Number(price),
            image: image.trim() || undefined,
          },
        })
        toast.success('Product updated')
      } else {
        await api('/products', {
          method: 'POST',
          body: {
            name: name.trim(),
            barcode: finalBarcode,
            price: Number(price),
            image: image.trim() || undefined,
          },
        })
        toast.success('Product created')
      }
      setName('')
      setBarcode('')
      setPrice('')
      setImage('')
      onSuccess()
      onClose()
    } catch (err: any) {
      toast.error(err.message || (product ? 'Failed to update product' : 'Failed to create product'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="max-w-md bg-white p-6">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">
            {product ? 'Edit product' : 'New product'}
          </DialogTitle>
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
            <div className="flex items-center justify-between">
              <Label htmlFor="p-barcode">Barcode</Label>
              {!product && (
                <button
                  type="button"
                  onClick={() => setBarcode(generateBarcode())}
                  className="text-xs text-[#E2542A] hover:underline font-medium cursor-pointer"
                >
                  Generate barcode
                </button>
              )}
            </div>
            <Input
              id="p-barcode"
              placeholder="e.g. 100000000001 (auto-generated if empty)"
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
            <Label htmlFor="p-image">Icon or Image URL (optional)</Label>
            <Input
              id="p-image"
              placeholder="📦 or https://..."
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
            onClick={handleSave}
            disabled={loading}
            className="bg-[#E2542A] hover:bg-[#c9431c] text-white"
          >
            {loading ? (product ? 'Saving…' : 'Creating…') : product ? 'Save changes' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
