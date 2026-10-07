import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import {
  ArrowRight,
  ShoppingBag,
  Boxes,
  BarChart3,
  ShieldCheck,
  CheckCircle2,
  ScanLine,
  Store,
  Receipt,
  Plus,
  Minus,
  RotateCcw,
  Tag,
  CreditCard,
  Building2,
  ExternalLink,
  Shirt,
  Sparkles,
  Cpu,
  Layers,
  Activity,
  Barcode,
  Search,
  Check,
  Warehouse,
  Users,
  LockKeyhole,
  Truck,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  Target,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import manUtdLogo from '@/assets/Man_Utd_FC_.svg'

interface ProjectShowcaseCard {
  id: string
  number: string
  tabTitle: string
  badge: string
  title: string
  metric: string
  metricSub: string
  image: string
  summary: string
  whyTitle: string
  whyReason: string
  points: string[]
  ctaRole: string
  ctaText: string
}

const PROJECT_SHOWCASE_CARDS: ProjectShowcaseCard[] = [
  {
    id: 'chain-sync',
    number: '01',
    tabTitle: 'Multi-Store Network',
    badge: 'Centralized Architecture',
    title: 'Real-Time Unified Multi-Store Retail Operations',
    metric: '100% Synced',
    metricSub: 'Instant ledger synchronization',
    image: 'https://images.unsplash.com/photo-1555421689-491a97ff2040?auto=format&fit=crop&w=1200&q=80',
    summary:
      'Seamlessly connects retail storefronts (Old Trafford Megastore, Downtown Flagship) and the Central Distribution Hub into a single unified operating backbone.',
    whyTitle: 'Strategic Solution Rationale',
    whyReason:
      'Eliminates data silos across branches. Leadership gains real-time visibility into chain-wide revenue and cash flow without inventory divergence or delayed shift audits.',
    points: [
      'Instant cross-branch synchronization of inventory quantities, catalog pricing, and revenue ledgers',
      'Automated end-of-day register reconciliation with transparent cryptographic audit records',
    ],
    ctaRole: 'headoffice1',
    ctaText: 'Experience Retail Director',
  },
  {
    id: 'matchday-pos',
    number: '02',
    tabTitle: 'High-Velocity POS',
    badge: 'Matchday Peak Optimized',
    title: 'Sub-Second Point-of-Sale for Matchday Peak Traffic',
    metric: '< 350ms',
    metricSub: 'Checkout transaction time',
    image: 'https://images.unsplash.com/photo-1556740758-90de374c12ad?auto=format&fit=crop&w=1200&q=80',
    summary:
      'Cashier interface engineered for rapid barcode scanning, native keyboard wedge hotkeys, and split tender transactions (Cash, Card, QR Wallet).',
    whyTitle: 'Strategic Solution Rationale',
    whyReason:
      'On matchdays, tens of thousands of supporters surge toward stadium counters before kickoff. Sub-350ms transactions clear queues 3x faster, preventing checkout abandonment and lost revenue.',
    points: [
      'Zero-latency barcode scanning with hardware keyboard wedge and in-memory SKU lookup',
      'Instant split tender settlement, thermal receipt dispatch, and rapid transaction closure',
    ],
    ctaRole: 'cashier1',
    ctaText: 'Experience POS Terminal',
  },
  {
    id: 'smart-inventory',
    number: '03',
    tabTitle: 'Logistics & Transfers',
    badge: 'Fulfillment & Restocking',
    title: 'Intelligent Inventory Replenishment & Stock Transfers',
    metric: '0% Discrepancy',
    metricSub: 'Precision movement tracking',
    image: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=1200&q=80',
    summary:
      'Real-time bin-level stock monitoring with automated transfer requests dispatched from Central Logistics Hub to store counters with auditable shipment states.',
    whyTitle: 'Strategic Solution Rationale',
    whyReason:
      'Prevents high-demand matchday kits from running out of stock at Old Trafford counters while excess pallets sit unnoticed in warehouse storage, maximizing working capital velocity.',
    points: [
      'Automated safety-stock thresholds with single-click transfer replenishment dispatches',
      'Dual-custody verification (dispatch and intake) eliminating inventory shrinkage',
    ],
    ctaRole: 'inventory1',
    ctaText: 'Experience Warehouse Hub',
  },
  {
    id: 'promo-engine',
    number: '04',
    tabTitle: 'Promotions & Discounts',
    badge: 'Pricing & Campaigns',
    title: 'Dynamic Promotion Engine & Tiered Discounts',
    metric: '+24.5% Sales',
    metricSub: 'Promotional campaign lift',
    image: 'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?auto=format&fit=crop&w=1200&q=80',
    summary:
      'Store-level and network-wide promotional campaigns, percentage discounts, coupon codes, and scheduled seasonal flash sales.',
    whyTitle: 'Strategic Solution Rationale',
    whyReason:
      'Retail networks need centralized, instant pricing control to launch seasonal campaigns and clear end-of-season inventory without manual register updates.',
    points: [
      'Instant discount validation at checkout with coupon code verification',
      'Flexible percentage and fixed value promotion schedules across all branches',
    ],
    ctaRole: 'headoffice1',
    ctaText: 'Experience Promotions',
  },
  {
    id: 'security-rbac',
    number: '05',
    tabTitle: 'RBAC & Audit Trails',
    badge: 'Enterprise Security',
    title: '5-Role RBAC Security & Immutable Audit Trail',
    metric: '5 Roles',
    metricSub: '100% immutable audit log',
    image: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1200&q=80',
    summary:
      'Strict separation of duties across 5 roles (Cashier, Manager, Warehouse, Director, Admin) backed by an immutable system audit log capturing every state mutation.',
    whyTitle: 'Strategic Solution Rationale',
    whyReason:
      'Safeguards retail revenue, prevents register fraud, unauthorized discounts or price modifications, and stops inventory shrinkage across multi-location enterprise chains.',
    points: [
      'Least-privilege role-based access control strictly enforced on every API route and UI view',
      'Immutable audit trail logging every sign-in, void, refund, discount, and transfer timestamp',
    ],
    ctaRole: 'admin1',
    ctaText: 'Experience System Admin',
  },
]

const SYSTEM_ROLES = [
  {
    id: 'cashier',
    username: 'cashier1',
    name: 'Cara Chen',
    title: 'POS Terminal Cashier',
    location: 'Downtown Flagship · Front Counter #01',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&q=80',
    headline: 'High-throughput checkout with instant barcode verification and split tender.',
    coreTasks: [
      'Sub-second barcode scan & keyboard wedge input',
      'Split tender payments (Cash, Card, QR Wallet)',
      'Thermal receipt printing & digital dispatch',
      'Inventory checking and SKU barcode verification',
    ],
    permissions: ['POS Terminal', 'Barcode Engine', 'Split Tender', 'Receipt Generation'],
  },
  {
    id: 'manager',
    username: 'manager1',
    name: 'Sam Miller',
    title: 'Store Operations Manager',
    location: 'Downtown Flagship · Branch Management',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=256&q=80',
    headline: 'Branch-level stock replenishment, daily cashier audits, and revenue reconciliation.',
    coreTasks: [
      'Approve and dispatch restock requests to Central Hub',
      'Real-time shift auditing & cashier till reconciliation',
      'Local store inventory intake & barcode tagging',
      'Daily branch gross margin and revenue reporting',
    ],
    permissions: ['Store Operations', 'Stock Reorder', 'Cashier Audits', 'Intake Inspection'],
  },
  {
    id: 'warehouse',
    username: 'warehouse1',
    name: 'Alex Rivera',
    title: 'Central Logistics Specialist',
    location: 'Central Distribution Hub · Sector 4B',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=256&q=80',
    headline: 'Bulk stock fulfillment, branch transfer dispatch, and discrepancy-free cycle counts.',
    coreTasks: [
      'Review and pick store replenishment orders',
      'Dispatch inter-branch stock transfer shipments',
      'Bulk PO receiving and vendor pallet verification',
      'Scheduled cycle counts & discrepancy logging',
    ],
    permissions: ['Warehouse Ledger', 'Dispatch Shipments', 'Order Fulfillment', 'Cycle Audits'],
  },
  {
    id: 'headoffice',
    username: 'headoffice1',
    name: 'Helen Vance',
    title: 'Head Office Retail Director',
    location: 'Head Office · Multi-Store Command',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=256&q=80',
    headline: 'Chain-wide performance analytics, master product pricing, and promotional campaigns.',
    coreTasks: [
      'Comparative revenue analysis across all 3 branches',
      'Chain-wide pricing, markdown, and promotion engine',
      'Master catalog management and new SKU releases',
      'Store network audit & performance monitoring',
    ],
    permissions: ['Global Analytics', 'Master Catalog', 'Chain Promotions', 'Revenue Ledger'],
  },
  {
    id: 'admin',
    username: 'admin1',
    name: 'Devin Shaw',
    title: 'Enterprise System Administrator',
    location: 'Enterprise Infrastructure Core',
    avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=256&q=80',
    headline: 'Granular RBAC permission enforcement, user lifecycle provisioning, and immutable audit trails.',
    coreTasks: [
      'Configure role-based permission matrix across all endpoints',
      'Provision and revoke employee terminal accounts',
      'Inspect immutable cryptographic audit logs',
      'Store registry & database health management',
    ],
    permissions: ['RBAC Enforcement', 'User Directory', 'Audit Log Trail', 'Store Registry'],
  },
]

export const WelcomePage: React.FC = () => {
  const navigate = useNavigate()
  const { login } = useAuth()

  // 5-Card Project Showcase Carousel State (Cycles every 5 seconds)
  const [activeCardIndex, setActiveCardIndex] = useState(0)
  const [isAutoPaused, setIsAutoPaused] = useState(false)

  useEffect(() => {
    if (isAutoPaused) return
    const interval = setInterval(() => {
      setActiveCardIndex((prev) => (prev + 1) % PROJECT_SHOWCASE_CARDS.length)
    }, 5000)
    return () => clearInterval(interval)
  }, [isAutoPaused])

  const handlePrevCard = () => {
    setActiveCardIndex((prev) => (prev - 1 + PROJECT_SHOWCASE_CARDS.length) % PROJECT_SHOWCASE_CARDS.length)
  }

  const handleNextCard = () => {
    setActiveCardIndex((prev) => (prev + 1) % PROJECT_SHOWCASE_CARDS.length)
  }

  const currentCard = PROJECT_SHOWCASE_CARDS[activeCardIndex]

  // Roles Tab State
  const [selectedRoleIndex, setSelectedRoleIndex] = useState(0)
  const [roleLoginLoading, setRoleLoginLoading] = useState(false)

  const activeRole = SYSTEM_ROLES[selectedRoleIndex]

  const handleLaunchRole = async (username: string) => {
    setRoleLoginLoading(true)
    try {
      await login(username, 'password123')
      navigate('/', { replace: true })
    } catch {
      navigate('/login')
    } finally {
      setRoleLoginLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex flex-col font-sans selection:bg-[#E2542A] selection:text-white">
      {/* Top Application Bar */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-neutral-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
          <div className="flex items-center gap-3.5 cursor-pointer" onClick={() => navigate('/welcome')}>
            <img src={manUtdLogo} alt="RetailFlow" className="w-8 h-8 object-contain" />
            <div className="flex items-baseline gap-2">
              <span className="font-bold text-xl tracking-tight font-['Plus_Jakarta_Sans',sans-serif] text-[#0F172A]">
                RetailFlow
              </span>
              <span className="hidden sm:inline-block text-[11px] font-semibold tracking-wide text-neutral-400">
                POS & Chain Operations
              </span>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-7 text-sm font-semibold text-neutral-600">
            <a href="#showcase" className="hover:text-[#E2542A] transition-colors">
              Project Showcase
            </a>
            <a href="#roles" className="hover:text-[#E2542A] transition-colors">
              Role Workspaces
            </a>
            <a href="#architecture" className="hover:text-[#E2542A] transition-colors">
              Core Architecture
            </a>
            <a href="#network" className="hover:text-[#E2542A] transition-colors">
              Store Network
            </a>
          </nav>

          <div className="flex items-center gap-2.5">
            <Button
              variant="ghost"
              onClick={() => navigate('/login')}
              className="text-neutral-700 hover:text-black font-semibold text-xs sm:text-sm px-3.5"
            >
              Sign In
            </Button>
            <Button
              onClick={() => handleLaunchRole('cashier1')}
              disabled={roleLoginLoading}
              className="bg-[#E2542A] hover:bg-[#C9431C] text-white font-semibold text-xs sm:text-sm px-4.5 shadow-sm transition-all"
            >
              Launch Register <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-12 pb-16 lg:pt-20 lg:pb-24 border-b border-neutral-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-14 items-center">
            {/* Left Column: Authoritative Editorial Copy */}
            <div className="lg:col-span-5 space-y-6 text-left">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-[#0F172A] leading-[1.15] font-['Plus_Jakarta_Sans',sans-serif]">
                The point-of-sale & inventory engine built for high-tempo retail.
              </h1>

              <p className="text-neutral-600 text-sm sm:text-base leading-relaxed">
                Connect fast-paced front counters with central distribution, split-second barcode processing,
                promotions & discounts engine, and 5-role enterprise access control.
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Button
                  size="lg"
                  onClick={() => navigate('/login')}
                  className="bg-[#0F172A] hover:bg-[#1E293B] text-white font-bold px-6 py-5.5 text-sm shadow-md transition-all"
                >
                  Sign In to Console <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => {
                    const el = document.getElementById('roles')
                    el?.scrollIntoView({ behavior: 'smooth' })
                  }}
                  className="border-neutral-300 text-neutral-800 hover:bg-neutral-50 px-5 py-5.5 text-sm font-semibold"
                >
                  Explore 5 Roles
                </Button>
              </div>

              {/* Staff Team Avatars */}
              <div className="flex items-center gap-3 pt-1">
                <div className="flex -space-x-3 overflow-hidden py-1">
                  {SYSTEM_ROLES.map((r) => (
                    <img
                      key={r.id}
                      src={r.avatar}
                      alt={r.name}
                      className="inline-block w-11 h-11 rounded-full ring-3 ring-white object-cover shadow-sm hover:scale-110 hover:z-10 transition-transform"
                    />
                  ))}
                </div>
                <div className="text-xs text-neutral-500 font-medium">
                  <strong className="text-neutral-900 font-semibold">5 Active Personas</strong> · Cashier, Manager, Hub & HQ
                </div>
              </div>

              {/* Verified Trust Metrics */}
              <div className="grid grid-cols-2 gap-3 pt-4 border-t border-neutral-200 text-xs text-neutral-600">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Sub-second Barcode Checkout</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>5 Dedicated Workspaces</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Real-time Inter-store Sync</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Immutable Audit Logging</span>
                </div>
              </div>
            </div>

            {/* Right Column: 5-Card Project Showcase Carousel with 5s Auto-Cycle */}
            <div
              id="showcase"
              className="lg:col-span-7"
              onMouseEnter={() => setIsAutoPaused(true)}
              onMouseLeave={() => setIsAutoPaused(false)}
            >
              <div className="bg-white rounded-3xl border border-neutral-200/90 shadow-xl overflow-hidden text-left p-6 sm:p-7 space-y-5 transition-all">
                {/* Visual Photographic Banner with Floating Metric */}
                <div className="relative h-56 sm:h-64 rounded-2xl overflow-hidden border border-neutral-200/80 shadow-xs group">
                  <img
                    src={currentCard.image}
                    alt={currentCard.title}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

                  {/* Floating Metric Pill (Top Right) */}
                  <div className="absolute top-3.5 right-3.5 text-right">
                    <div className="bg-neutral-900/85 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-white/20 text-white shadow-lg">
                      <span className="text-base sm:text-lg font-extrabold text-orange-400 block leading-tight">
                        {currentCard.metric}
                      </span>
                      <span className="text-[10px] text-neutral-300 font-medium block">
                        {currentCard.metricSub}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Header & Title */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-extrabold uppercase tracking-wider text-[#E2542A]">
                        Module #{currentCard.number} · RetailFlow
                      </span>
                    </div>
                    <span className="text-xs font-bold text-neutral-400 tabular-nums">
                      {currentCard.number} / 05
                    </span>
                  </div>

                  <h2 className="text-xl sm:text-2xl font-extrabold text-[#0F172A] tracking-tight leading-snug">
                    {currentCard.title}
                  </h2>

                  <p className="text-sm text-neutral-600 leading-relaxed font-normal">
                    {currentCard.summary}
                  </p>
                </div>

                {/* Strategic Solution Rationale */}
                <p className="text-sm text-neutral-900 leading-relaxed font-bold">
                  <span className="text-[#E2542A] font-bold mr-1.5">{currentCard.whyTitle}:</span>
                  {currentCard.whyReason}
                </p>

                {/* Bullet Points */}
                <div className="space-y-2 pt-0.5">
                  {currentCard.points.map((point, pIdx) => (
                    <div key={pIdx} className="flex items-start gap-2.5 text-xs sm:text-sm text-neutral-700">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span>{point}</span>
                    </div>
                  ))}
                </div>

                {/* Carousel Controls Bar */}
                <div className="pt-3 border-t border-neutral-100 flex items-center justify-between gap-3">
                  {/* Pagination Indicator Dots */}
                  <div className="flex items-center gap-1.5">
                    {PROJECT_SHOWCASE_CARDS.map((_, dotIdx) => (
                      <button
                        key={dotIdx}
                        type="button"
                        onClick={() => setActiveCardIndex(dotIdx)}
                        aria-label={`Go to slide ${dotIdx + 1}`}
                        className={`h-2.5 rounded-full transition-all duration-300 ${
                          dotIdx === activeCardIndex
                            ? 'w-8 bg-[#E2542A]'
                            : 'w-2.5 bg-neutral-200 hover:bg-neutral-300'
                        }`}
                      />
                    ))}
                  </div>

                  {/* Prev / Next Circular Buttons */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handlePrevCard}
                      className="w-9 h-9 rounded-full border border-neutral-200 bg-white hover:bg-neutral-100 flex items-center justify-center text-neutral-700 transition-colors shadow-2xs"
                      title="Previous slide"
                      aria-label="Previous slide"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={handleNextCard}
                      className="w-9 h-9 rounded-full border border-neutral-200 bg-white hover:bg-neutral-100 flex items-center justify-center text-neutral-700 transition-colors shadow-2xs"
                      title="Next slide"
                      aria-label="Next slide"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Proof & Architecture Metrics Bar */}
      <section className="py-8 bg-neutral-50 border-b border-neutral-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="space-y-1">
              <span className="text-2xl sm:text-3xl font-extrabold text-[#0F172A] font-['Plus_Jakarta_Sans',sans-serif] block">
                &lt; 350ms
              </span>
              <span className="text-xs font-medium text-neutral-500">Scan-to-Tender Latency</span>
            </div>
            <div className="space-y-1">
              <span className="text-2xl sm:text-3xl font-extrabold text-[#0F172A] font-['Plus_Jakarta_Sans',sans-serif] block">
                5 Roles
              </span>
              <span className="text-xs font-medium text-neutral-500">Dedicated Enterprise Workspaces</span>
            </div>
            <div className="space-y-1">
              <span className="text-2xl sm:text-3xl font-extrabold text-emerald-600 font-['Plus_Jakarta_Sans',sans-serif] block">
                100% Sync
              </span>
              <span className="text-xs font-medium text-neutral-500">Real-time Cross-Branch Parity</span>
            </div>
            <div className="space-y-1">
              <span className="text-2xl sm:text-3xl font-extrabold text-[#0F172A] font-['Plus_Jakarta_Sans',sans-serif] block">
                Full Audit
              </span>
              <span className="text-xs font-medium text-neutral-500">Immutable Transaction Logs</span>
            </div>
          </div>
        </div>
      </section>

      {/* Role Workspaces Navigator (Clean & Authentic) */}
      <section id="roles" className="py-16 lg:py-24 bg-white border-b border-neutral-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mb-12 space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-neutral-100 text-neutral-700">
              <Users className="w-3.5 h-3.5 text-[#E2542A]" />
              Role-Based Access Control
            </div>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-[#0F172A] font-['Plus_Jakarta_Sans',sans-serif]">
              5 Dedicated Roles. One Unified Operations Ledger.
            </h2>
            <p className="text-neutral-600 text-sm sm:text-base leading-relaxed">
              Every employee logs into an interface curated strictly for their responsibilities—reducing cognitive load
              and eliminating unauthorized actions.
            </p>
          </div>

          {/* Role Horizontal Selector Tabs */}
          <div className="flex flex-wrap gap-3 mb-8">
            {SYSTEM_ROLES.map((role, idx) => {
              const isSelected = idx === selectedRoleIndex
              return (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => setSelectedRoleIndex(idx)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-xs sm:text-sm font-semibold transition-all border ${
                    isSelected
                      ? 'bg-[#0F172A] text-white border-[#0F172A] shadow-md scale-[1.02]'
                      : 'bg-white text-neutral-700 hover:bg-neutral-50 border-neutral-200'
                  }`}
                >
                  <img
                    src={role.avatar}
                    alt={role.name}
                    className="w-11 h-11 sm:w-12 sm:h-12 rounded-full object-cover shrink-0 ring-2 ring-neutral-200 shadow-sm"
                  />
                  <div className="text-left">
                    <span className="block font-bold">{role.title}</span>
                    <span className={`text-[11px] font-normal block ${isSelected ? 'text-neutral-300' : 'text-neutral-500'}`}>
                      {role.name}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Active Role Deep-Dive Card */}
          <div className="bg-[#F8FAFC] border border-neutral-200 rounded-2xl p-6 sm:p-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-8 space-y-5 text-left">
                <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-600 font-medium">
                  <span className="font-bold text-[#E2542A]">{activeRole.title}</span>
                  <span>·</span>
                  <span>Assigned: {activeRole.location}</span>
                </div>

                <h3 className="text-xl sm:text-2xl font-bold font-['Plus_Jakarta_Sans',sans-serif] text-[#0F172A]">
                  Built for {activeRole.name}
                </h3>

                <p className="text-sm text-neutral-600 leading-relaxed">{activeRole.headline}</p>

                <div className="space-y-2 pt-1">
                  <span className="text-xs font-bold text-neutral-700 block">
                    Core Operational Duties
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-neutral-700">
                    {activeRole.coreTasks.map((task) => (
                      <div key={task} className="flex items-start gap-2">
                        <Check className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
                        <span>{task}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  <span className="text-xs font-bold text-neutral-700 block">
                    Granted Module Access
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {activeRole.permissions.map((perm) => (
                      <span
                        key={perm}
                        className="px-3 py-1 bg-white border border-neutral-200 rounded-lg text-xs font-medium text-neutral-700 shadow-2xs"
                      >
                        ✓ {perm}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* 1-Click Test Launcher Box */}
              <div className="lg:col-span-4 bg-white p-6 sm:p-7 rounded-2xl border border-neutral-200 shadow-md flex flex-col items-center text-center space-y-4">
                <div className="relative group">
                  <img
                    src={activeRole.avatar}
                    alt={activeRole.name}
                    className="w-40 h-40 sm:w-44 sm:h-44 rounded-3xl object-cover border-4 border-white shadow-xl ring-2 ring-neutral-200 transition-transform duration-300 group-hover:scale-102"
                    loading="lazy"
                  />
                  <div className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 bg-white border border-neutral-200 shadow-xs px-3 py-1 rounded-full flex items-center gap-1.5 text-[11px] font-bold text-neutral-700 whitespace-nowrap">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>On Duty · Ready</span>
                  </div>
                </div>
                <div className="pt-2">
                  <h4 className="font-bold text-lg text-[#0F172A] font-['Plus_Jakarta_Sans',sans-serif]">{activeRole.name}</h4>
                  <p className="text-xs text-neutral-500 font-medium mt-0.5">User: {activeRole.username} · {activeRole.title}</p>
                </div>
                <Button
                  onClick={() => handleLaunchRole(activeRole.username)}
                  disabled={roleLoginLoading}
                  className="w-full bg-[#E2542A] hover:bg-[#C9431C] text-white text-xs sm:text-sm font-bold py-3 shadow-sm transition-all"
                >
                  {roleLoginLoading ? 'Authenticating…' : `1-Click Demo as ${activeRole.name.split(' ')[0]} →`}
                </Button>
                <div className="text-[11px] text-neutral-400 font-normal">Default credentials: password123</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Core Architectural Pillars */}
      <section id="architecture" className="py-16 lg:py-24 bg-[#F8FAFC] border-b border-neutral-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mb-12 space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-neutral-200 text-neutral-700">
              <Layers className="w-3.5 h-3.5 text-neutral-700" />
              Platform Engineering
            </div>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-[#0F172A] font-['Plus_Jakarta_Sans',sans-serif]">
              Engineered for Retail Stability & Speed
            </h2>
            <p className="text-neutral-600 text-sm sm:text-base leading-relaxed">
              Architectural design choices made to prevent cashier slowdowns, data desync, and audit gaps.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 text-left">
            <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-2xs space-y-3">
              <div className="w-10 h-10 rounded-lg bg-orange-50 border border-orange-100 flex items-center justify-center text-[#E2542A]">
                <Barcode className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base font-['Plus_Jakarta_Sans',sans-serif] text-[#0F172A]">
                Hardware Wedge Barcode POS
              </h3>
              <p className="text-xs text-neutral-600 leading-relaxed">
                Native keyboard wedge and laser scanner listener. Auto-generates missing EAN/UPC barcodes and verifies
                prices in memory.
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-2xs space-y-3">
              <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
                <Warehouse className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base font-['Plus_Jakarta_Sans',sans-serif] text-[#0F172A]">
                Multi-Branch Stock Ledger
              </h3>
              <p className="text-xs text-neutral-600 leading-relaxed">
                Inter-branch replenishment orders, transfer dispatches, and intake confirmation without stock count
                discrepancies.
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-2xs space-y-3">
              <div className="w-10 h-10 rounded-lg bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600">
                <Tag className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base font-['Plus_Jakarta_Sans',sans-serif] text-[#0F172A]">
                Dynamic Promotions & Pricing
              </h3>
              <p className="text-xs text-neutral-600 leading-relaxed">
                Network-wide discount codes, percentage and fixed markdowns scheduled and validated automatically at register.
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-2xs space-y-3">
              <div className="w-10 h-10 rounded-lg bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600">
                <LockKeyhole className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base font-['Plus_Jakarta_Sans',sans-serif] text-[#0F172A]">
                Granular RBAC & Audits
              </h3>
              <p className="text-xs text-neutral-600 leading-relaxed">
                Server-side authorization enforced on every API route with tamper-proof immutable audit records for every
                sale and refund.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Store Network Section */}
      <section id="network" className="py-16 lg:py-24 bg-white border-b border-neutral-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mb-12 space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-neutral-100 text-neutral-700">
              <Activity className="w-3.5 h-3.5 text-[#E2542A]" />
              Live Topology
            </div>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-[#0F172A] font-['Plus_Jakarta_Sans',sans-serif]">
              Connected Retail Network
            </h2>
            <p className="text-neutral-600 text-sm sm:text-base leading-relaxed">
              Three operational nodes operating in continuous synchronization.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-xl border border-neutral-200 bg-[#F8FAFC] space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-xs font-semibold text-neutral-400">Store #001</span>
                  <h3 className="font-bold text-lg font-['Plus_Jakarta_Sans',sans-serif] text-[#0F172A]">Downtown Flagship</h3>
                </div>
                <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 text-[11px] font-semibold rounded-full">
                  Online
                </span>
              </div>
              <p className="text-xs text-neutral-600 leading-relaxed">
                High-volume pedestrian retail counter with 4 active POS terminals and express checkout lines.
              </p>
              <div className="pt-2 border-t border-neutral-200 flex justify-between text-xs text-neutral-500 font-medium">
                <span>Active Terminals: 4</span>
                <span className="tabular-nums">Latency: 42ms</span>
              </div>
            </div>

            <div className="p-6 rounded-xl border border-neutral-200 bg-[#F8FAFC] space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-xs font-semibold text-neutral-400">Store #002</span>
                  <h3 className="font-bold text-lg font-['Plus_Jakarta_Sans',sans-serif] text-[#0F172A]">Old Trafford Megastore</h3>
                </div>
                <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 text-[11px] font-semibold rounded-full">
                  Online
                </span>
              </div>
              <p className="text-xs text-neutral-600 leading-relaxed">
                Matchday stadium mega-counter optimized for peak sub-second transaction bursts before and after kickoff.
              </p>
              <div className="pt-2 border-t border-neutral-200 flex justify-between text-xs text-neutral-500 font-medium">
                <span>Active Terminals: 12</span>
                <span className="tabular-nums">Latency: 38ms</span>
              </div>
            </div>

            <div className="p-6 rounded-xl border border-neutral-200 bg-[#F8FAFC] space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-xs font-semibold text-neutral-400">Hub #001</span>
                  <h3 className="font-bold text-lg font-['Plus_Jakarta_Sans',sans-serif] text-[#0F172A]">Central Logistics Hub</h3>
                </div>
                <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 text-[11px] font-semibold rounded-full">
                  Synchronized
                </span>
              </div>
              <p className="text-xs text-neutral-600 leading-relaxed">
                Bulk storage and automated replenishment dispatch supplying all regional retail storefronts.
              </p>
              <div className="pt-2 border-t border-neutral-200 flex justify-between text-xs text-neutral-500 font-medium">
                <span className="tabular-nums">Total SKUs: 1,420</span>
                <span className="tabular-nums">Latency: 29ms</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Conversion Banner Section */}
      <section className="py-16 lg:py-20 bg-[#0F172A] text-white text-center">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-neutral-800 text-orange-400 text-xs font-semibold">
            <span>Enterprise-Grade POS Platform</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight font-['Plus_Jakarta_Sans',sans-serif]">
            Ready to experience RetailFlow?
          </h2>
          <p className="text-neutral-400 text-sm sm:text-base max-w-xl mx-auto">
            Log in to your terminal or create an account to start managing stores, transactions, and inventory.
          </p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Button
              size="lg"
              onClick={() => navigate('/login')}
              className="bg-[#E2542A] hover:bg-[#C9431C] text-white font-bold px-8 py-5.5 text-sm shadow-lg hover:shadow-orange-500/20"
            >
              Sign In to Console <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={() => navigate('/signup')}
              className="border-neutral-700 text-white hover:bg-neutral-800 px-6 py-5.5 text-sm font-semibold"
            >
              Create Account
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white border-t border-neutral-200 py-8 text-xs text-neutral-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <img src={manUtdLogo} alt="" className="w-5 h-5 object-contain" />
            <span className="font-bold text-[#0F172A] font-['Plus_Jakarta_Sans',sans-serif]">RetailFlow</span>
            <span className="text-neutral-400">· Manchester United Retail Operations Platform</span>
          </div>
          <div className="flex items-center gap-6 text-[12px] text-neutral-500 font-medium">
            <span className="tabular-nums">Build v2.4.0</span>
            <span>Security: Enforced RBAC</span>
            <span className="tabular-nums">© {new Date().getFullYear()} RetailFlow</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
