import React, { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { ROLE_LABEL } from '@/lib/constants'
import { toast } from 'sonner'
import { PageIcon } from '@/lib/page-icons'

interface RolesData {
  roles: string[]
  permissions: string[]
  matrix: Record<string, string[]>
}

export const RolesPage: React.FC = () => {
  const [data, setData] = useState<RolesData | null>(null)
  const [loading, setLoading] = useState(true)

  const loadRoles = async () => {
    setLoading(true)
    try {
      const res = await api<RolesData>('/roles')
      setData(res)
    } catch (err: any) {
      toast.error(err.message || 'Failed to load roles and permissions')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRoles()
  }, [])

  const handleToggle = async (role: string, perm: string, currentEnabled: boolean) => {
    if (!data) return
    const newEnabled = !currentEnabled

    // Optimistic update
    const updatedRolePerms = newEnabled
      ? [...data.matrix[role], perm]
      : data.matrix[role].filter((p) => p !== perm)

    setData({
      ...data,
      matrix: {
        ...data.matrix,
        [role]: updatedRolePerms,
      },
    })

    try {
      await api(`/roles/${role}/permissions`, {
        method: 'PUT',
        body: { permission: perm, enabled: newEnabled },
      })
      toast.success(
        `${perm} ${newEnabled ? 'granted to' : 'removed from'} ${ROLE_LABEL[role] || role}`
      )
    } catch (err: any) {
      toast.error(err.message || 'Failed to update permission')
      // Rollback
      loadRoles()
    }
  }

  return (
    <div className="custom-card shadow-sm">
      <div className="section-head flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-line mb-3">
        <div className="flex items-center gap-2.5">
          <PageIcon name="roles" className="w-5 h-5 text-neutral-800" />
          <div>
            <h3 className="font-bold text-base">Role → permission matrix</h3>
            <p className="text-xs text-muted-foreground">
              Centralized RBAC matrix — changes take effect immediately across the entire system
            </p>
          </div>
        </div>
      </div>

      <p className="text-muted-foreground text-xs mb-3.5 leading-relaxed bg-neutral-50 p-3 rounded border border-line">
        Toggling a box here changes what that role can do across the entire app immediately —
        permissions are checked centrally, never hardcoded per role in route code.
      </p>

      {loading && !data ? (
        <div className="empty py-12">Loading permission matrix…</div>
      ) : data ? (
        <div className="overflow-x-auto border border-line rounded-md">
          <table className="w-full text-xs sm:text-sm">
            <thead className="bg-neutral-50 border-b border-line text-muted-foreground font-semibold">
              <tr>
                <th className="py-2.5 px-4 text-left w-72">Permission</th>
                {data.roles.map((r) => (
                  <th key={r} className="py-2.5 px-3 text-center w-36 whitespace-nowrap">
                    {ROLE_LABEL[r] || r}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E7EA]">
              {data.permissions.map((p) => (
                <tr key={p} className="row-hover">
                  <td className="py-2.5 px-4 mono text-xs font-semibold text-left text-neutral-800">
                    {p}
                  </td>
                  {data.roles.map((r) => {
                    const isChecked = data.matrix[r]?.includes(p) || false
                    return (
                      <td key={r} className="text-center py-2 px-3">
                        <div className="flex justify-center items-center">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggle(r, p, isChecked)}
                            className="h-4 w-4 rounded border-gray-300 text-[#E2542A] focus:ring-[#E2542A] cursor-pointer"
                          />
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty py-10 text-center text-muted-foreground">
          Failed to load permission matrix.
        </div>
      )}
    </div>
  )
}
