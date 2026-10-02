import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NewStoreDialog } from './new-store-dialog'
import { Search, ArrowRight } from 'lucide-react'
import { PageIcon } from '@/lib/page-icons'

interface StoreItem {
  id: string
  name: string
  address?: string
}

export const StoresPage: React.FC = () => {
  const { user, has, hasAny, setSelectedStoreId, refreshStores } = useAuth()
  const navigate = useNavigate()
  const canManage = has('STORE_MANAGE')

  const [stores, setStores] = useState<StoreItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false)

  const loadStores = async () => {
    setLoading(true)
    try {
      const data = await api<StoreItem[]>('/stores')
      setStores(data || [])
      refreshStores()
    } catch (err: any) {
      toast.error(err.message || 'Failed to load stores')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStores()
  }, [])

  const handleOpenDashboard = (storeId: string) => {
    setSelectedStoreId(storeId)
    navigate(`/store-detail/${storeId}`)
  }

  const filteredStores = useMemo(() => {
    if (!searchQuery.trim()) return stores
    const q = searchQuery.toLowerCase()
    return stores.filter(
      (s) => s.name.toLowerCase().includes(q) || (s.address && s.address.toLowerCase().includes(q))
    )
  }, [stores, searchQuery])

  return (
    <div className="custom-card shadow-sm">
      <div className="section-head flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-line mb-3">
        <div className="flex items-center gap-2.5">
          <PageIcon name="stores" className="w-5 h-5 text-neutral-800" />
          <div>
            <h3 className="font-bold text-base">All stores</h3>
            <p className="text-xs text-muted-foreground">
              Manage store branches and navigate to dedicated store performance dashboards
            </p>
          </div>
        </div>
        {canManage && (
          <Button
            size="sm"
            onClick={() => setIsNewDialogOpen(true)}
            className="bg-[#E2542A] hover:bg-[#c9431c] text-white text-xs h-8 font-semibold"
          >
            + New store
          </Button>
        )}
      </div>

      {/* Search Bar */}
      <div className="relative mb-3 max-w-sm">
        <Search size={14} className="absolute left-3 top-2.5 text-muted-foreground" />
        <Input
          placeholder="Search stores by name or address…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-8 text-xs h-8 bg-neutral-50/50"
        />
      </div>

      <div className="overflow-x-auto border border-line rounded-md">
        {loading ? (
          <div className="empty py-12">Loading stores…</div>
        ) : (
          <table className="w-full text-xs sm:text-sm">
            <thead className="bg-neutral-50 border-b border-line text-muted-foreground font-semibold">
              <tr>
                <th className="py-2.5 px-3 text-left w-64">Store Name</th>
                <th className="py-2.5 px-3 text-left">Address</th>
                <th className="py-2.5 px-3 text-right w-44">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E7EA]">
              {filteredStores.length > 0 ? (
                filteredStores.map((s) => (
                  <tr key={s.id} className="row-hover">
                    <td className="py-2.5 px-3 font-medium text-left">{s.name}</td>
                    <td className="py-2.5 px-3 text-muted-foreground text-xs text-left">
                      {s.address || '—'}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {hasAny('SALES_VIEW_ALL_STORES', 'INVENTORY_VIEW') &&
                        user?.role === 'HEAD_OFFICE_MANAGER' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenDashboard(s.id)}
                            className="text-xs h-7 text-muted-foreground hover:text-black gap-1"
                          >
                            Open dashboard
                            <ArrowRight size={13} />
                          </Button>
                        )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="empty py-10 text-center text-muted-foreground">
                    No stores found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <NewStoreDialog
        open={isNewDialogOpen}
        onClose={() => setIsNewDialogOpen(false)}
        onSuccess={loadStores}
      />
    </div>
  )
}
