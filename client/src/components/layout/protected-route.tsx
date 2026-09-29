import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { defaultRoute } from '@/lib/constants'
import { toast } from 'sonner'

interface ProtectedRouteProps {
  requiredPermissions?: string[]
  allowedRoles?: string[]
  children: React.ReactElement
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  requiredPermissions = [],
  allowedRoles = [],
  children,
}) => {
  const { user, loading, hasAny } = useAuth()

  if (loading) {
    return <div className="empty">Verifying access…</div>
  }

  if (!user) {
    return <Navigate to="/" replace />
  }

  // Check roles if specified
  const roleAllowed =
    allowedRoles.length === 0 || allowedRoles.includes(user.role)

  // Check permissions if specified
  const permissionAllowed =
    requiredPermissions.length === 0 || hasAny(...requiredPermissions)

  const isDenied = !roleAllowed || !permissionAllowed

  React.useEffect(() => {
    if (isDenied && user) {
      toast.error(`Access restricted: Your role (${user.role}) cannot access this page.`)
    }
  }, [isDenied, user])

  if (isDenied) {
    return <Navigate to={defaultRoute(user.role)} replace />
  }

  return children
}
