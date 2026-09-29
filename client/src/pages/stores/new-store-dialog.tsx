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

interface NewStoreDialogProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export const NewStoreDialog: React.FC<NewStoreDialogProps> = ({
  open,
  onClose,
  onSuccess,
}) => {
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [loading, setLoading] = useState(false)

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error('Store name is required')
      return
    }
    setLoading(true)
    try {
      await api('/stores', {
        method: 'POST',
        body: {
          name: name.trim(),
          address: address.trim() || undefined,
        },
      })
      toast.success('Store created')
      setName('')
      setAddress('')
      onSuccess()
      onClose()
    } catch (err: any) {
      toast.error(err.message || 'Failed to create store')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="max-w-md bg-white p-6">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">New store</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 my-2">
          <div className="field">
            <Label htmlFor="s-name">Name</Label>
            <Input
              id="s-name"
              placeholder="e.g. Westside Branch"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1.5"
            />
          </div>

          <div className="field">
            <Label htmlFor="s-address">Address</Label>
            <Input
              id="s-address"
              placeholder="e.g. 456 Market St"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
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
