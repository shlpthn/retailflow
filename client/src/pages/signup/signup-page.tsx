import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { ROLE_LABEL } from '@/lib/constants'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import manUtdLogo from '@/assets/Man_Utd_FC_.svg'
import manUtdPoster from '@/assets/manchester-united-f-c-poster.jpg'

interface StoreOption {
  id: string
  name: string
}

export const SignupPage: React.FC = () => {
  const navigate = useNavigate()
  const roles = Object.keys(ROLE_LABEL)

  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState(roles[0])
  const [stores, setStores] = useState<StoreOption[]>([])
  const [storeId, setStoreId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const isStoreLevel = ['CASHIER', 'INVENTORY_STAFF', 'STORE_MANAGER'].includes(role)

  useEffect(() => {
    const fetchStores = async () => {
      try {
        const data = await api<StoreOption[]>('/auth/stores')
        setStores(data || [])
        if (data && data.length > 0) {
          setStoreId(data[0].id)
        }
      } catch {
        setStores([])
      }
    }
    fetchStores()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!name.trim() || !username.trim() || !password) {
      setError('Please fill in all required fields.')
      return
    }

    if (isStoreLevel && !storeId) {
      setError('Please select a store for store-level roles.')
      return
    }

    setLoading(true)
    try {
      await api('/auth/signup', {
        method: 'POST',
        body: {
          name: name.trim(),
          username: username.trim(),
          role,
          storeId: isStoreLevel ? storeId : undefined,
          password,
        },
      })
      toast.success('Account created successfully! Please sign in.')
      navigate('/login')
    } catch (err: any) {
      setError(err.message || 'Failed to create account')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="login-screen"
      style={{
        backgroundImage: `linear-gradient(rgba(10, 12, 18, 0.4), rgba(10, 12, 18, 0.5)), url(${manUtdPoster})`,
      }}
    >
      <div className="login-card">
        <div className="login-brand">
          <img src={manUtdLogo} alt="RetailFlow" className="w-8 h-8 object-contain shrink-0" />
          <h1>RetailFlow</h1>
        </div>
        <p className="login-sub">Create your account to get started.</p>

        {error && <div className="error-banner">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="field">
            <Label htmlFor="signup-name">Full Name</Label>
            <Input
              id="signup-name"
              name="name"
              placeholder="Cara Chen"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="field">
            <Label htmlFor="signup-username">Username</Label>
            <Input
              id="signup-username"
              name="username"
              placeholder="cashier2"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          <div className="field">
            <Label htmlFor="signup-role">Role</Label>
            <select
              id="signup-role"
              name="role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full"
            >
              {roles.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </div>

          {isStoreLevel && (
            <div className="field">
              <Label htmlFor="signup-store">Store</Label>
              <select
                id="signup-store"
                name="storeId"
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                className="w-full"
                required
              >
                {stores.length > 0 ? (
                  stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))
                ) : (
                  <option value="">(No stores available)</option>
                )}
              </select>
            </div>
          )}

          <div className="field">
            <Label htmlFor="signup-password">Password</Label>
            <Input
              id="signup-password"
              type="password"
              autoComplete="new-password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-[#E2542A] hover:bg-[#c9431c] text-white"
          >
            {loading ? 'Creating account…' : 'Sign up'}
          </Button>

          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate('/login')}
            className="w-full mt-2 text-neutral-700 hover:text-black hover:bg-black/5"
          >
            Back to Sign in
          </Button>
        </form>
      </div>
    </div>
  )
}
