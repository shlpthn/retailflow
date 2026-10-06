import React from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, BarChart3, Boxes, CheckCircle2, ClipboardCheck, ShieldCheck, ShoppingBag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import manUtdLogo from '@/assets/Man_Utd_FC_.svg'

const features = [
  {
    icon: ShoppingBag,
    title: 'Fast, effortless checkout',
    description: 'Process orders, payments, and receipts at the counter in just a few clicks.',
  },
  {
    icon: Boxes,
    title: 'Inventory under control',
    description: 'Track stock, transfers, and replenishment requests in real time.',
  },
  {
    icon: BarChart3,
    title: 'Clear operational insight',
    description: 'See sales, store performance, and important activity in one place.',
  },
]

const workflowItems = [
  { label: 'Orders today', value: '248' },
  { label: 'Stock availability', value: '94%' },
  { label: 'Pending requests', value: '06' },
]

export const WelcomePage: React.FC = () => {
  const navigate = useNavigate()

  return (
    <main className="welcome-page">
      <header className="welcome-header">
        <button
          type="button"
          className="welcome-brand"
          onClick={() => navigate('/welcome')}
          aria-label="RetailFlow home"
        >
          <img src={manUtdLogo} alt="" className="welcome-brand-logo" />
          <span>RetailFlow</span>
        </button>

        <nav className="welcome-nav" aria-label="Account navigation">
          <Button variant="ghost" onClick={() => navigate('/login')} className="welcome-login-button">
            Sign in
          </Button>
          <Button onClick={() => navigate('/signup')} className="welcome-signup-button">
            Create account
          </Button>
        </nav>
      </header>

      <section className="welcome-hero" aria-labelledby="welcome-title">
        <div className="welcome-hero-copy">
          <p className="welcome-eyebrow"><span /> Retail operations platform</p>
          <h1 id="welcome-title">Keep your stores<br /><em className="welcome-accent">running smoothly</em><br />every day.</h1>
          <p className="welcome-description">
            RetailFlow brings sales, inventory, and store operations into one clear, secure workspace that is always ready for your team.
          </p>
          <div className="welcome-actions">
            <Button size="lg" onClick={() => navigate('/signup')} className="welcome-primary-action">
              Get started <ArrowRight aria-hidden="true" />
            </Button>
            <Button variant="outline" size="lg" onClick={() => navigate('/login')} className="welcome-secondary-action">
              Sign in to your console
            </Button>
          </div>
          <div className="welcome-trust">
            <div className="welcome-trust-item">
              <CheckCircle2 aria-hidden="true" />
              <span>Role-based access control</span>
            </div>
            <div className="welcome-trust-item">
              <CheckCircle2 aria-hidden="true" />
              <span>Real-time inventory tracking</span>
            </div>
          </div>
        </div>

        <div className="welcome-console" aria-label="RetailFlow operations dashboard preview">
          <div className="welcome-console-topbar">
            <div className="welcome-console-dots"><i /><i /><i /></div>
            <div className="welcome-console-mark"><span /> RetailFlow Console</div>
            <div className="welcome-console-status"><i /> Live</div>
          </div>
          <div className="welcome-console-content">
            <div className="welcome-console-heading">
              <div>
                <p>STORE OVERVIEW</p>
                <h2>Good morning, team!</h2>
              </div>
              <div className="welcome-date">Today</div>
            </div>
            <div className="welcome-metrics">
              {workflowItems.map((item) => (
                <div className="welcome-metric" key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
            <div className="welcome-activity">
              <div className="welcome-activity-title"><ClipboardCheck aria-hidden="true" /> Recent activity</div>
              <div className="welcome-activity-row">
                <div className="welcome-activity-icon"><ShoppingBag aria-hidden="true" /></div>
                <div><strong>Order #RF-2481</strong><span>Payment completed</span></div>
                <time>Just now</time>
              </div>
              <div className="welcome-activity-row">
                <div className="welcome-activity-icon inventory"><Boxes aria-hidden="true" /></div>
                <div><strong>Inventory updated</strong><span>12 products received</span></div>
                <time>12 min ago</time>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="welcome-features" aria-labelledby="welcome-features-title">
        <div className="welcome-section-intro">
          <p className="welcome-eyebrow"><span /> Everything you need</p>
          <h2 id="welcome-features-title">One workflow. One source of truth.</h2>
        </div>
        <div className="welcome-feature-grid">
          {features.map(({ icon: Icon, title, description }) => (
            <article className="welcome-feature" key={title}>
              <div className="welcome-feature-icon"><Icon aria-hidden="true" /></div>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="welcome-security" aria-label="Security and role-based access">
        <ShieldCheck aria-hidden="true" />
        <p><strong>The right people, the right access, the right data.</strong> RetailFlow helps every role focus on the work that matters.</p>
      </section>

      <footer className="welcome-footer">
        <span>© {new Date().getFullYear()} RetailFlow</span>
        <span>Retail management, made simpler.</span>
      </footer>
    </main>
  )
}
