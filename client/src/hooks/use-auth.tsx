import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import { toast } from 'sonner'

export interface User {
  id: string
  name: string
  username: string
  role: string
  storeId?: string | null
  scope: string
  permissions: string[]
}

export interface Store {
  id: string
  name: string
  address?: string
}

interface AuthContextType {
  token: string | null
  user: User | null
  stores: Store[]
  selectedStoreId: string | null
  setSelectedStoreId: (id: string | null) => void
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  has: (perm: string) => boolean
  hasAny: (...perms: string[]) => boolean
  storeName: (id?: string | null) => string
  refreshStores: () => Promise<Store[] | void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem('rf_token'))
  const [user, setUser] = useState<User | null>(null)
  const [stores, setStores] = useState<Store[]>([])
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(true)

  const has = useCallback((perm: string) => {
    return !!(user && user.permissions.includes(perm))
  }, [user])

  const hasAny = useCallback((...perms: string[]) => {
    return perms.some(has)
  }, [has])

  const storeName = useCallback((id?: string | null) => {
    if (!id) return ''
    return (stores.find((s) => s.id === id) || {}).name || id
  }, [stores])

  const refreshStores = useCallback(async () => {
    try {
      const data = await api<Store[]>('/stores')
      setStores(data || [])
      return data
    } catch {
      return []
    }
  }, [])

  const refreshUser = useCallback(async () => {
    try {
      const currentUser = await api<User>('/auth/me')
      setUser(currentUser)
    } catch {
      // ignore
    }
  }, [])

  const initAuth = useCallback(async (authToken: string) => {
    try {
      const currentUser = await api<User>('/auth/me')
      setUser(currentUser)

      let loadedStores: Store[] = []
      if (currentUser.permissions.includes('STORE_VIEW')) {
        try {
          loadedStores = await api<Store[]>('/stores')
          setStores(loadedStores || [])
        } catch {
          // ignore
        }
      }

      if (currentUser.storeId) {
        setSelectedStoreId(currentUser.storeId)
      } else if (loadedStores.length > 0) {
        setSelectedStoreId(loadedStores[0].id)
      }
    } catch (e) {
      sessionStorage.removeItem('rf_token')
      setToken(null)
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (token) {
      initAuth(token)
    } else {
      setLoading(false)
    }
  }, [token, initAuth])

  const login = async (username: string, password: string) => {
    const { token: newToken, user: newUser } = await api<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: { username, password },
    })

    sessionStorage.setItem('rf_token', newToken)
    setToken(newToken)
    setUser(newUser)

    let loadedStores: Store[] = []
    if (newUser.permissions.includes('STORE_VIEW')) {
      try {
        loadedStores = await api<Store[]>('/stores')
        setStores(loadedStores || [])
      } catch {
        // ignore
      }
    }

    if (newUser.storeId) {
      setSelectedStoreId(newUser.storeId)
    } else if (loadedStores.length > 0) {
      setSelectedStoreId(loadedStores[0].id)
    }
  }

  const logout = () => {
    sessionStorage.removeItem('rf_token')
    setToken(null)
    setUser(null)
    setStores([])
    setSelectedStoreId(null)
    window.location.hash = '#/login'
  }

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        stores,
        selectedStoreId,
        setSelectedStoreId,
        loading,
        login,
        logout,
        has,
        hasAny,
        storeName,
        refreshStores,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
