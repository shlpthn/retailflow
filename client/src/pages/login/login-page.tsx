import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { DEMO_ACCOUNTS, defaultRoute } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ChevronDown, ChevronUp } from 'lucide-react'
import manUtdLogo from '@/assets/Man_Utd_FC_.svg'
import manUtdPoster from '@/assets/manchester-united-f-c-poster.jpg'

export const LoginPage: React.FC = () => {
  const { login, user } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [isDemoExpanded, setIsDemoExpanded] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await login(username, password)
      navigate('/', { replace: true })
    } catch (err: any) {
      setError(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const handleDemoLogin = async (demoUser: string) => {
    setUsername(demoUser)
    setPassword('password123')
    setError(null)
    setLoading(true)
    try {
      await login(demoUser, 'password123')
      navigate('/', { replace: true })
    } catch (err: any) {
      setError(err.message || 'Login failed')
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
      <div className="login-card bg-white/20 backdrop-blur-md border border-white/20">
        <div className="login-brand">
          <img src={manUtdLogo} alt="RetailFlow" className="w-8 h-8 object-contain shrink-0" />
          <h1>RetailFlow</h1>
        </div>
        <p className="login-sub">Sign in to your store console.</p>

        {error && <div className="error-banner">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="field">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          <div className="field">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
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
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <div className="demo-accounts">
          <button
            type="button"
            onClick={() => setIsDemoExpanded((prev) => !prev)}
            className="demo-toggle-btn"
            aria-expanded={isDemoExpanded}
            title={isDemoExpanded ? 'Collapse demo accounts' : 'Expand demo accounts'}
          >
            <span className="demo-toggle-title">Demo accounts — password123</span>
            <span className="demo-toggle-badge">
              <span>{isDemoExpanded ? 'Collapse' : 'Expand'}</span>
              {isDemoExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </span>
          </button>

          {isDemoExpanded && (
            <div className="demo-list">
              {DEMO_ACCOUNTS.map(([u, label]) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => handleDemoLogin(u)}
                  disabled={loading}
                >
                  <b>{u}</b> — {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
