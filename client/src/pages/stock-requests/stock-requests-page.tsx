import React, { useState, useEffect, useMemo } from 'react'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ApproveDialog, type StockRequestItem } from './approve-dialog'
import { Search, CheckCircle, XCircle } from 'lucide-react'
import { PageIcon } from '@/lib/page-icons'

interface Transfer {
  id: string
  sourceStoreName: string
  destinationStoreName: string
  status: string
}

interface FactoryOrder {
  id: string
  destinationStoreName: string
  status: string
}

export const StockRequestsPage: React.FC = () => {
  const { has } = useAuth()
  const canApprove = has('STOCK_REQUEST_APPROVE')

  const [requests, setRequests] = useState<StockRequestItem[]>([])
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [factoryOrders, setFactoryOrders] = useState<FactoryOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  const [selectedRequest, setSelectedRequest] = useState<StockRequestItem | null>(null)
  const [isApproveOpen, setIsApproveOpen] = useState(false)

  const loadData = async () => {
    setLoading(true)
    try {
      const [reqs, trans, orders] = await Promise.all([
        api<StockRequestItem[]>('/stock-requests'),
        api<Transfer[]>('/transfers').catch(() => []),
        api<FactoryOrder[]>('/transfers/factory-orders').catch(() => []),
      ])
      setRequests(reqs || [])
      setTransfers(trans || [])
      setFactoryOrders(orders || [])
    } catch (err: any) {
      toast.error(err.message || 'Failed to load stock requests')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const nextStep = (r: StockRequestItem) => {
    if (r.status === 'REJECTED') return <span className="muted">Rejected</span>
    if (r.status === 'COMPLETED') return <span className="text-[#2F8F5B] font-medium">Stock received — done</span>
    if (!r.fulfillment) return <span className="muted">Awaiting your review</span>

    if (r.fulfillment.type === 'TRANSFER') {
      const t = transfers.find((x) => x.id === r.fulfillment?.transferId)
      if (!t) return ''
      if (t.status === 'PENDING_DISPATCH') {
        return (
          <span>
            Waiting for <b>{t.sourceStoreName}</b> to dispatch
          </span>
        )
      }
      if (t.status === 'IN_TRANSIT') {
        return (
          <span>
            In transit — waiting for <b>{t.destinationStoreName}</b> to receive
          </span>
        )
      }
    } else {
      const o = factoryOrders.find((x) => x.id === r.fulfillment?.factoryOrderId)
      if (o && o.status === 'ORDERED') {
        return (
          <span>
            Factory order placed — waiting for <b>{o.destinationStoreName}</b> to mark received
          </span>
        )
      }
    }
    return ''
  }

  const statusPill = (status: string) => {
    const map: Record<string, string> = {
      REQUESTED: 'pill-neutral',
      UNDER_REVIEW: 'pill-neutral',
      APPROVED: 'pill-accent',
      FULFILLMENT_PENDING: 'pill-warn',
      DISPATCHED: 'pill-warn',
      IN_TRANSIT: 'pill-warn',
      RECEIVED: 'pill-ok',
      COMPLETED: 'pill-ok',
      REJECTED: 'pill-bad',
    }
    return (
      <span className={`pill ${map[status] || 'pill-neutral'}`}>
        {status.replace(/_/g, ' ').toLowerCase()}
      </span>
    )
  }

  const handleReject = async (id: string) => {
    const reason = prompt('Reason for rejecting this request (optional):')
    try {
      await api(`/stock-requests/${id}/reject`, {
        method: 'POST',
        body: { reason: reason || null },
      })
      toast.success('Request rejected')
      loadData()
    } catch (err: any) {
      toast.error(err.message || 'Failed to reject request')
    }
  }

  const openApproveModal = (req: StockRequestItem) => {
    setSelectedRequest(req)
    setIsApproveOpen(true)
  }

  const filteredRequests = useMemo(() => {
    if (!searchQuery.trim()) return requests
    const q = searchQuery.toLowerCase()
    return requests.filter(
      (r) =>
        r.productName.toLowerCase().includes(q) ||
        r.storeName.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q)
    )
  }, [requests, searchQuery])

  return (
    <div className="custom-card shadow-sm">
      <div className="section-head flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-line mb-3">
        <div className="flex items-center gap-2.5">
          <PageIcon name="stock-requests" className="w-5 h-5 text-neutral-800" />
          <div>
            <h3 className="font-bold text-base">All stock requests</h3>
            <p className="text-xs text-muted-foreground">
              Approve stock replenishment requests from store branches and coordinate supply fulfillment
            </p>
          </div>
        </div>
      </div>

      {/* Search Input */}
      <div className="relative mb-3 max-w-sm">
        <Search size={14} className="absolute left-3 top-2.5 text-muted-foreground" />
        <Input
          placeholder="Search by product, store, or request ID…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-8 text-xs h-8 bg-neutral-50/50"
        />
      </div>

      <div className="overflow-x-auto border border-line rounded-md">
        {loading ? (
          <div className="empty py-12">Loading requests…</div>
        ) : (
          <table className="w-full text-xs sm:text-sm">
            <thead className="bg-neutral-50 border-b border-line text-muted-foreground font-semibold">
              <tr>
                <th className="py-2.5 px-3 text-left font-mono w-24">Request ID</th>
                <th className="py-2.5 px-3 text-left w-40">Requesting Store</th>
                <th className="py-2.5 px-3 text-left">Product</th>
                <th className="py-2.5 px-3 text-right font-mono w-24">Quantity</th>
                <th className="py-2.5 px-3 text-center w-36">Status</th>
                <th className="py-2.5 px-3 text-left w-64">Next Step</th>
                {canApprove && <th className="py-2.5 px-3 text-right w-44">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E7EA]">
              {filteredRequests.length > 0 ? (
                filteredRequests.map((r) => (
                  <tr key={r.id} className="row-hover">
                    <td className="py-2.5 px-3 font-mono muted text-xs font-semibold text-left">
                      {r.id.slice(-6)}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-left">{r.storeName}</td>
                    <td className="py-2.5 px-3 text-left">{r.productName}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-[#15181D]">
                      {r.quantity}
                    </td>
                    <td className="py-2.5 px-3 text-center">{statusPill(r.status)}</td>
                    <td className="py-2.5 px-3 text-xs text-left">{nextStep(r)}</td>
                    {canApprove && (
                      <td className="py-2.5 px-3 text-right">
                        {['REQUESTED', 'UNDER_REVIEW'].includes(r.status) ? (
                          <div className="flex justify-end gap-1.5">
                            <Button
                              size="sm"
                              onClick={() => openApproveModal(r)}
                              className="bg-[#E2542A] hover:bg-[#c9431c] text-white text-xs h-7 px-2.5 gap-1 font-semibold"
                            >
                              <CheckCircle size={12} />
                              Approve
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleReject(r.id)}
                              className="text-red-600 border-red-200 hover:bg-red-50 text-xs h-7 px-2.5 gap-1"
                            >
                              <XCircle size={12} />
                              Reject
                            </Button>
                          </div>
                        ) : r.fulfillment ? (
                          <span className="badge-source px-2 py-0.5 rounded bg-neutral-100 font-medium">
                            {r.fulfillment.type === 'TRANSFER' ? 'via transfer' : 'via factory order'}
                          </span>
                        ) : null}
                      </td>
                    )}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={canApprove ? 7 : 6} className="empty py-10 text-center text-muted-foreground">
                    No stock replenishment requests found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <ApproveDialog
        open={isApproveOpen}
        request={selectedRequest}
        onClose={() => setIsApproveOpen(false)}
        onSuccess={loadData}
      />
    </div>
  )
}
