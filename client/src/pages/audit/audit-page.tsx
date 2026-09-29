import React, { useState, useEffect, useMemo } from 'react'
import { api } from '@/lib/api'
import { fmtDate } from '@/lib/utils'
import { ROLE_LABEL } from '@/lib/constants'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'
import { PageIcon } from '@/lib/page-icons'

interface AuditLogItem {
  id: string
  createdAt: string
  userName: string
  role: string
  action: string
  resource?: string
}

export const AuditPage: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    const loadLogs = async () => {
      setLoading(true)
      try {
        const data = await api<AuditLogItem[]>('/audit-logs')
        setLogs(data || [])
      } catch (err: any) {
        toast.error(err.message || 'Failed to load audit logs')
      } finally {
        setLoading(false)
      }
    }
    loadLogs()
  }, [])

  const filteredLogs = useMemo(() => {
    if (!searchQuery.trim()) return logs
    const q = searchQuery.toLowerCase()
    return logs.filter(
      (l) =>
        l.userName.toLowerCase().includes(q) ||
        l.action.toLowerCase().includes(q) ||
        (l.resource && l.resource.toLowerCase().includes(q))
    )
  }, [logs, searchQuery])

  return (
    <div className="custom-card shadow-sm">
      <div className="section-head flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-line mb-3">
        <div className="flex items-center gap-2.5">
          <PageIcon name="audit" className="w-5 h-5 text-neutral-800" />
          <div>
            <h3 className="font-bold text-base">Audit Log</h3>
            <p className="text-xs text-muted-foreground">
              Audit trail recording the 200 most recent system operations across all stores
            </p>
          </div>
        </div>
      </div>

      {/* Search Input */}
      <div className="relative mb-3 max-w-sm">
        <Search size={14} className="absolute left-3 top-2.5 text-muted-foreground" />
        <Input
          placeholder="Filter by user, action, or resource…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-8 text-xs h-8 bg-neutral-50/50"
        />
      </div>

      <div className="overflow-x-auto border border-line rounded-md">
        {loading ? (
          <div className="empty py-12">Loading audit logs…</div>
        ) : (
          <table className="w-full text-xs sm:text-sm">
            <thead className="bg-neutral-50 border-b border-line text-muted-foreground font-semibold">
              <tr>
                <th className="py-2.5 px-3 text-left font-mono w-44">Timestamp</th>
                <th className="py-2.5 px-3 text-left w-40">User</th>
                <th className="py-2.5 px-3 text-center w-36">Role</th>
                <th className="py-2.5 px-3 text-left">Action</th>
                <th className="py-2.5 px-3 text-left font-mono w-56">Resource</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E7EA]">
              {filteredLogs.length > 0 ? (
                filteredLogs.map((l) => (
                  <tr key={l.id} className="row-hover">
                    <td className="py-2.5 px-3 muted text-xs font-mono text-left whitespace-nowrap">
                      {fmtDate(l.createdAt)}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-left">{l.userName}</td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-neutral-100 text-neutral-700">
                        {ROLE_LABEL[l.role] || l.role}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 capitalize text-left font-mono text-xs">
                      {l.action.replace(/_/g, ' ').toLowerCase()}
                    </td>
                    <td className="py-2.5 px-3 mono muted text-xs text-left truncate max-w-xs">
                      {l.resource || '—'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="empty py-10 text-center text-muted-foreground">
                    No matching audit logs found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
