import React from 'react'
import { Outlet } from 'react-router-dom'
import { AppSidebar } from './app-sidebar'
import { Topbar } from './topbar'
import { SidebarProvider } from './sidebar-context'
import { Toaster } from 'sonner'

export const AppShell: React.FC = () => {
  return (
    <SidebarProvider>
      <div className="shell">
        <AppSidebar />
        <div className="main flex-1 min-w-0 flex flex-col">
          <Topbar />
          <main className="content flex-1 p-4 sm:p-6" id="content">
            <Outlet />
          </main>
        </div>
        <Toaster richColors position="bottom-right" />
      </div>
    </SidebarProvider>
  )
}
