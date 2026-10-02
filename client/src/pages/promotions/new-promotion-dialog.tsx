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

interface NewPromotionDialogProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export const NewPromotionDialog: React.FC<NewPromotionDialogProps> = ({
  open,
  onClose,
  onSuccess,
}) => {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [type, setType] = useState<'PERCENT' | 'FIXED'>('PERCENT')
  const [value, setValue] = useState<string>('')
  const [validFrom, setValidFrom] = useState('2026-01-01')
  const [validTo, setValidTo] = useState('2026-12-31')
  const [loading, setLoading] = useState(false)

  const handleCreate = async () => {
    if (!name.trim() || !code.trim() || !value) {
      toast.error('Please fill in required fields')
      return
    }
    setLoading(true)
    try {
      await api('/promotions', {
        method: 'POST',
        body: {
          name: name.trim(),
          code: code.trim().toUpperCase(),
          type,
          value: Number(value),
          validFrom,
          validTo,
        },
      })
      toast.success('Promotion created')
      setName('')
      setCode('')
      setValue('')
      onSuccess()
      onClose()
    } catch (err: any) {
      toast.error(err.message || 'Failed to create promotion')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="max-w-md bg-white p-6">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">New promotion</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 my-2">
          <div className="field">
            <Label htmlFor="pr-name">Name</Label>
            <Input
              id="pr-name"
              placeholder="e.g. Summer Clearance"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1.5"
            />
          </div>

          <div className="field">
            <Label htmlFor="pr-code">Code</Label>
            <Input
              id="pr-code"
              placeholder="SAVE10"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="mt-1.5 font-mono uppercase"
            />
          </div>

          <div className="field">
            <Label htmlFor="pr-type">Type</Label>
            <select
              id="pr-type"
              value={type}
              onChange={(e) => setType(e.target.value as 'PERCENT' | 'FIXED')}
              className="w-full mt-1.5 p-2 border rounded-md font-medium bg-white"
            >
              <option value="PERCENT">Percent off</option>
              <option value="FIXED">Fixed amount off</option>
            </select>
          </div>

          <div className="field">
            <Label htmlFor="pr-value">Value {type === 'PERCENT' ? '(%)' : '($)'}</Label>
            <Input
              id="pr-value"
              type="number"
              min={0}
              placeholder={type === 'PERCENT' ? '10' : '5.00'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="mt-1.5 font-mono"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="field">
              <Label htmlFor="pr-from">Valid from</Label>
              <Input
                id="pr-from"
                type="date"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
                className="mt-1.5 text-xs font-mono"
              />
            </div>
            <div className="field">
              <Label htmlFor="pr-to">Valid to</Label>
              <Input
                id="pr-to"
                type="date"
                value={validTo}
                onChange={(e) => setValidTo(e.target.value)}
                className="mt-1.5 text-xs font-mono"
              />
            </div>
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
