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
import { ROLE_LABEL } from '@/lib/constants'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'

interface NewUserDialogProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export const NewUserDialog: React.FC<NewUserDialogProps> = ({
  open,
  onClose,
  onSuccess,
}) => {
  const { user, stores } = useAuth()
  const allRoles = Object.keys(ROLE_LABEL)
  const roles = React.useMemo(() => {
    if (user?.role === 'HEAD_OFFICE_MANAGER') {
      return allRoles.filter((r) => r !== 'SYSTEM_ADMIN' && r !== 'HEAD_OFFICE_MANAGER')
    }
    return allRoles
  }, [user?.role, allRoles])

  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('password123')
  const [role, setRole] = useState(roles[0])
  const [storeId, setStoreId] = useState(stores[0]?.id || '')
  const [loading, setLoading] = useState(false)

  React.useEffect(() => {
    if (roles.length && !roles.includes(role)) {
      setRole(roles[0])
    }
  }, [roles, role])

  const showStoreField = ['CASHIER', 'INVENTORY_STAFF', 'STORE_MANAGER'].includes(role)

  React.useEffect(() => {
    if (stores.length && !storeId) {
      setStoreId(stores[0].id)
    }
  }, [stores, storeId])

  const handleCreate = async () => {
    if (!name.trim() || !username.trim() || !password) {
      toast.error('Please fill in required fields')
      return
    }
    setLoading(true)
    try {
      await api('/users', {
        method: 'POST',
        body: {
          name: name.trim(),
          username: username.trim(),
          password,
          role,
          storeId: showStoreField ? storeId : undefined,
        },
      })
      toast.success('User created')
      setName('')
      setUsername('')
      setPassword('password123')
      onSuccess()
      onClose()
    } catch (err: any) {
      toast.error(err.message || 'Failed to create user')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="max-w-md bg-white p-6">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">New user</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 my-2">
          <div className="field">
            <Label htmlFor="u-name">Name</Label>
            <Input
              id="u-name"
              placeholder="e.g. John Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1.5"
            />
          </div>

          <div className="field">
            <Label htmlFor="u-username">Username</Label>
            <Input
              id="u-username"
              placeholder="e.g. jdoe"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1.5 font-mono"
            />
          </div>

          <div className="field">
            <Label htmlFor="u-password">Password</Label>
            <Input
              id="u-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5 font-mono"
            />
          </div>

          <div className="field">
            <Label htmlFor="u-role">Role</Label>
            <select
              id="u-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full mt-1.5 p-2 border rounded-md font-medium bg-white"
            >
              {roles.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </div>

          {showStoreField && (
            <div className="field">
              <Label htmlFor="u-store">Store</Label>
              <select
                id="u-store"
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                className="w-full mt-1.5 p-2 border rounded-md font-medium bg-white"
              >
                {stores.map((s) => (
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
