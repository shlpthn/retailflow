import React, { useState, useEffect, useMemo } from 'react'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { ROLE_LABEL } from '@/lib/constants'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NewUserDialog } from './new-user-dialog'
import { Search, UserCheck, UserX } from 'lucide-react'
import { PageIcon } from '@/lib/page-icons'

interface UserItem {
  id: string
  name: string
  username: string
  role: string
  storeId?: string | null
  disabled?: boolean
}

export const UsersPage: React.FC = () => {
  const { storeName } = useAuth()
  const [users, setUsers] = useState<UserItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false)

  const loadUsers = async () => {
    setLoading(true)
    try {
      const data = await api<UserItem[]>('/users')
      setUsers(data || [])
    } catch (err: any) {
      toast.error(err.message || 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [])

  const handleToggleDisabled = async (user: UserItem) => {
    try {
      await api(`/users/${user.id}`, {
        method: 'PUT',
        body: { disabled: !user.disabled },
      })
      toast.success(`User ${!user.disabled ? 'disabled' : 'enabled'}`)
      loadUsers()
    } catch (err: any) {
      toast.error(err.message || 'Failed to update user status')
    }
  }

  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users
    const q = searchQuery.toLowerCase()
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q)
    )
  }, [users, searchQuery])

  return (
    <div className="custom-card shadow-sm">
      <div className="section-head flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-line mb-3">
        <div className="flex items-center gap-2.5">
          <PageIcon name="users" className="w-5 h-5 text-neutral-800" />
          <div>
            <h3 className="font-bold text-base">Users</h3>
            <p className="text-xs text-muted-foreground">
              Manage user accounts, assign roles, and allocate store locations
            </p>
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => setIsNewDialogOpen(true)}
          className="bg-[#E2542A] hover:bg-[#c9431c] text-white text-xs h-8 font-semibold"
        >
          + New user
        </Button>
      </div>

      {/* Search Input */}
      <div className="relative mb-3 max-w-sm">
        <Search size={14} className="absolute left-3 top-2.5 text-muted-foreground" />
        <Input
          placeholder="Search users by name, username, or role…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-8 text-xs h-8 bg-neutral-50/50"
        />
      </div>

      <div className="overflow-x-auto border border-line rounded-md">
        {loading ? (
          <div className="empty py-12">Loading users…</div>
        ) : (
          <table className="w-full text-xs sm:text-sm">
            <thead className="bg-neutral-50 border-b border-line text-muted-foreground font-semibold">
              <tr>
                <th className="py-2.5 px-3 text-left">Full Name</th>
                <th className="py-2.5 px-3 text-left font-mono w-36">Username</th>
                <th className="py-2.5 px-3 text-center w-40">Role</th>
                <th className="py-2.5 px-3 text-left w-44">Assigned Store</th>
                <th className="py-2.5 px-3 text-center w-28">Status</th>
                <th className="py-2.5 px-3 text-right w-28">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E7EA]">
              {filteredUsers.length > 0 ? (
                filteredUsers.map((u) => (
                  <tr key={u.id} className="row-hover">
                    <td className="py-2.5 px-3 font-medium text-left">{u.name}</td>
                    <td className="py-2.5 px-3 mono muted text-xs text-left">{u.username}</td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-neutral-100 text-neutral-800">
                        {ROLE_LABEL[u.role] || u.role}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-left text-muted-foreground text-xs">
                      {u.storeId ? storeName(u.storeId) : 'All Stores'}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {u.disabled ? (
                        <span className="pill pill-bad">Disabled</span>
                      ) : (
                        <span className="pill pill-ok">Active</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggleDisabled(u)}
                        className={`text-xs h-7 px-2 gap-1 ${
                          u.disabled
                            ? 'text-[#2F8F5B] hover:bg-green-50'
                            : 'text-red-600 hover:bg-red-50'
                        }`}
                      >
                        {u.disabled ? (
                          <>
                            <UserCheck size={12} />
                            Enable
                          </>
                        ) : (
                          <>
                            <UserX size={12} />
                            Disable
                          </>
                        )}
                      </Button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="empty py-10 text-center text-muted-foreground">
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <NewUserDialog
        open={isNewDialogOpen}
        onClose={() => setIsNewDialogOpen(false)}
        onSuccess={loadUsers}
      />
    </div>
  )
}
