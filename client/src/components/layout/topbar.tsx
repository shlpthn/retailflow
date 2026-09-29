import React from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { useSidebar } from './sidebar-context'
import { PAGE_TITLES } from '@/lib/constants'
import { PAGE_ICONS } from '@/lib/page-icons'
import { Menu, PanelLeft } from 'lucide-react'

export const Topbar: React.FC = () => {
  const { user, stores, selectedStoreId, setSelectedStoreId, storeName } = useAuth()
  const { isCollapsed, toggleCollapsed, toggleMobile } = useSidebar()
  const location = useLocation()

  // Extract path key from pathname: e.g. /sales -> sales, /store-detail/123 -> store-detail
  const pathParts = location.pathname.replace(/^\//, '').split('/')
  const activeKey = pathParts[0] || ''

  const showStoreSelector =
    user?.role === 'HEAD_OFFICE_MANAGER' &&
    ['sales', 'inventory', 'products', 'store-detail'].includes(activeKey)

  const title =
    activeKey === 'store-detail'
      ? `${storeName(selectedStoreId)} — Dashboard`
      : PAGE_TITLES[activeKey] || 'RetailFlow'

  const currentIcon = PAGE_ICONS[activeKey]

  return (
    <div className="topbar">
      <div className="flex items-center gap-3">
        {/* Mobile menu trigger */}
        <button
          onClick={toggleMobile}
          className="md:hidden p-1.5 -ml-1 text-neutral-600 hover:text-black rounded hover:bg-neutral-100 transition-colors"
          title="Open menu"
        >
          <Menu size={20} />
        </button>

        {/* Desktop collapse toggle button */}
        <button
          onClick={toggleCollapsed}
          className="hidden md:flex p-1.5 -ml-1 text-neutral-500 hover:text-black rounded hover:bg-neutral-100 transition-colors"
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <PanelLeft size={18} />
        </button>

        <div className="flex items-center gap-2">
          {currentIcon && (
            <img src={currentIcon} alt={title} className="w-5 h-5 object-contain shrink-0" />
          )}
          <h2 className="text-lg font-bold">{title}</h2>
        </div>
      </div>

      {showStoreSelector && stores.length > 0 && (
        <div className="store-selector">
          <span className="text-xs font-semibold text-muted-foreground hidden sm:inline">Store:</span>
          <select
            value={selectedStoreId || ''}
            onChange={(e) => setSelectedStoreId(e.target.value)}
            className="store-select"
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
  )
}
