import React, { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { fmtMoney } from '@/lib/utils'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { NewPromotionDialog } from './new-promotion-dialog'
import { Power, Trash2 } from 'lucide-react'
import { PageIcon } from '@/lib/page-icons'

interface PromotionItem {
  id: string
  name: string
  code: string
  type: 'PERCENT' | 'FIXED'
  value: number
  validFrom: string
  validTo: string
  active: boolean
}

export const PromotionsPage: React.FC = () => {
  const { has } = useAuth()
  const canManage = has('PROMOTION_MANAGE')

  const [promotions, setPromotions] = useState<PromotionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false)

  const loadPromotions = async () => {
    setLoading(true)
    try {
      const data = await api<PromotionItem[]>('/promotions')
      setPromotions(data || [])
    } catch (err: any) {
      toast.error(err.message || 'Failed to load promotions')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPromotions()
  }, [])

  const handleToggleActive = async (p: PromotionItem) => {
    try {
      await api(`/promotions/${p.id}`, {
        method: 'PUT',
        body: { active: !p.active },
      })
      toast.success(`Promotion ${!p.active ? 'activated' : 'deactivated'}`)
      loadPromotions()
    } catch (err: any) {
      toast.error(err.message || 'Failed to update promotion status')
    }
  }

  const handleDelete = async (p: PromotionItem) => {
    if (!confirm(`Are you sure you want to delete "${p.name}"?`)) return
    try {
      await api(`/promotions/${p.id}`, { method: 'DELETE' })
      toast.success('Promotion deleted')
      loadPromotions()
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete promotion')
    }
  }

  return (
    <div className="custom-card shadow-sm">
      <div className="section-head flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-line mb-3">
        <div className="flex items-center gap-2.5">
          <PageIcon name="promotions" className="w-5 h-5 text-neutral-800" />
          <div>
            <h3 className="font-bold text-base">Promotions</h3>
            <p className="text-xs text-muted-foreground">
              Manage promotional discount codes, percentages, and validity schedules
            </p>
          </div>
        </div>
        {canManage && (
          <Button
            size="sm"
            onClick={() => setIsNewDialogOpen(true)}
            className="bg-[#E2542A] hover:bg-[#c9431c] text-white text-xs h-8 font-semibold"
          >
            + New promotion
          </Button>
        )}
      </div>

      <div className="overflow-x-auto border border-line rounded-md">
        {loading ? (
          <div className="empty py-12">Loading promotions…</div>
        ) : (
          <table className="w-full text-xs sm:text-sm">
            <thead className="bg-neutral-50 border-b border-line text-muted-foreground font-semibold">
              <tr>
                <th className="py-2.5 px-3 text-left">Campaign</th>
                <th className="py-2.5 px-3 text-left font-mono w-32">Promo Code</th>
                <th className="py-2.5 px-3 text-right font-mono w-32">Discount</th>
                <th className="py-2.5 px-3 text-center w-48">Validity Period</th>
                <th className="py-2.5 px-3 text-center w-28">Status</th>
                {canManage && <th className="py-2.5 px-3 text-right w-36">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E7EA]">
              {promotions.length > 0 ? (
                promotions.map((p) => (
                  <tr key={p.id} className="row-hover">
                    <td className="py-2.5 px-3 font-medium text-left">{p.name}</td>
                    <td className="py-2.5 px-3 mono font-bold text-xs text-left text-[#E2542A]">
                      {p.code}
                    </td>
                    <td className="py-2.5 px-3 text-right mono font-bold text-sm">
                      {p.type === 'PERCENT' ? `${p.value}%` : fmtMoney(p.value)}
                    </td>
                    <td className="py-2.5 px-3 text-center muted text-xs font-mono">
                      {p.validFrom} → {p.validTo}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {p.active ? (
                        <span className="pill pill-ok">Active</span>
                      ) : (
                        <span className="pill pill-neutral">Inactive</span>
                      )}
                    </td>
                    {canManage && (
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant={p.active ? 'outline' : 'ghost'}
                            size="sm"
                            onClick={() => handleToggleActive(p)}
                            className={`text-xs h-7 gap-1 px-2.5 ${
                              p.active
                                ? 'text-neutral-600 hover:text-black'
                                : 'text-[#2F8F5B] hover:bg-green-50'
                            }`}
                          >
                            <Power size={12} />
                            {p.active ? 'Deactivate' : 'Activate'}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(p)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 text-xs h-7 px-2"
                            title="Delete promotion"
                          >
                            <Trash2 size={13} />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={canManage ? 6 : 5} className="empty py-10 text-center text-muted-foreground">
                    No promotional campaigns found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <NewPromotionDialog
        open={isNewDialogOpen}
        onClose={() => setIsNewDialogOpen(false)}
        onSuccess={loadPromotions}
      />
    </div>
  )
}
