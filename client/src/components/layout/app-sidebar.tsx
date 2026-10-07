import React from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { useSidebar } from './sidebar-context'
import { NAV_BY_ROLE, ROLE_LABEL } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { LogOut } from 'lucide-react'
import manUtdLogo from '@/assets/Man_Utd_FC_.svg'
import { PAGE_ICONS } from '@/lib/page-icons'

export const AppSidebar: React.FC = () => {
  const { user, logout, storeName } = useAuth()
  const { isCollapsed, isMobileOpen, closeMobile } = useSidebar()

  if (!user) return null

  const navItems = NAV_BY_ROLE[user.role] || []

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          onClick={closeMobile}
          className="fixed inset-0 bg-black/60 z-40 md:hidden transition-opacity"
        />
      )}

      <aside
        className={`sidebar ${isCollapsed ? 'collapsed' : ''} ${
          isMobileOpen
            ? 'fixed inset-y-0 left-0 z-50 flex shadow-2xl md:sticky md:top-0 md:h-screen md:self-start md:shadow-none'
            : 'hidden md:flex md:sticky md:top-0 md:h-screen md:self-start'
        }`}
      >
        <div className="sidebar-brand">
          <div className="flex items-center justify-center gap-2.5">
            <img
              src={manUtdLogo}
              alt="RetailFlow"
              className={`${isCollapsed ? 'w-8 h-8' : 'w-7 h-7'} object-contain shrink-0`}
            />
            {!isCollapsed && <span className="brand-name truncate">RetailFlow</span>}
          </div>
        </div>

        <nav className="flex-1 space-y-1">
          {navItems.map((item) => {
            const iconSrc = PAGE_ICONS[item.key]
            return (
              <NavLink
                key={item.key}
                to={`/${item.key}`}
                title={isCollapsed ? item.label : undefined}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              >
                <span className="ico flex items-center justify-center shrink-0">
                  {iconSrc ? (
                    <img
                      src={iconSrc}
                      alt={item.label}
                      className={`${isCollapsed ? 'w-6 h-6' : 'w-5 h-5'} object-contain`}
                    />
                  ) : (
                    <span className="text-base">{item.icon}</span>
                  )}
                </span>
                {!isCollapsed && <span className="truncate">{item.label}</span>}
              </NavLink>
            )
          })}
        </nav>

        <div className="sidebar-foot">
          {!isCollapsed ? (
            <>
              <div className="role-chip">{ROLE_LABEL[user.role] || user.role}</div>
              <div className="who truncate">{user.name}</div>
              <div className="who-sub truncate">
                {user.storeId
                  ? storeName(user.storeId)
                  : user.scope === 'ALL_STORES'
                  ? 'All stores'
                  : 'System-wide'}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={logout}
                className="w-full text-[#EDEFF2] border-[#2B303A] bg-transparent hover:bg-[#23272F] hover:text-white transition-all text-xs"
              >
                Sign out
              </Button>
            </>
          ) : (
            <button
              onClick={logout}
              className="w-11 h-11 flex items-center justify-center rounded-lg text-neutral-400 hover:text-red-400 hover:bg-[#23272F] transition-colors"
              title="Sign out"
            >
              <LogOut size={18} />
            </button>
          )}
        </div>
      </aside>
    </>
  )
}
