import React, { useState, useEffect, useRef } from 'react'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { fmtMoney, isImg } from '@/lib/utils'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ReceiptDialog, type SaleReceipt } from './receipt-dialog'
import { RecentSalesDialog } from './recent-sales-dialog'
import { History } from 'lucide-react'
import { PageIcon } from '@/lib/page-icons'

interface CheckoutProduct {
  productId: string
  name: string
  price: number
  available: number
  barcode: string
  image: string
}

interface Promotion {
  code: string
  type: 'PERCENT' | 'FIXED'
  value: number
}

interface Recommendation {
  productId: string
  name: string
  price: number
  available: number
  image: string
}

interface RecommendationResponse {
  customerId: string
  strategy: 'user-based-knn' | 'popularity'
  fallback: boolean
  modelVersion: string
  recommendations: Recommendation[]
}

interface CartItem {
  productId: string
  name: string
  price: number
  qty: number
}

export const CheckoutPage: React.FC = () => {
  const { user } = useAuth()
  const [products, setProducts] = useState<CheckoutProduct[]>([])
  const [promos, setPromos] = useState<Promotion[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [promoCode, setPromoCode] = useState<string>('')
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null)
  const [scanValue, setScanValue] = useState<string>('')
  const [customerId, setCustomerId] = useState('')
  const [recommendations, setRecommendations] = useState<RecommendationResponse | null>(null)
  const [recommendationLoading, setRecommendationLoading] = useState(false)
  const [completedSale, setCompletedSale] = useState<SaleReceipt | null>(null)
  const [isReceiptOpen, setIsReceiptOpen] = useState(false)
  const [isRecentSalesOpen, setIsRecentSalesOpen] = useState(false)
  const [isScanSuccess, setIsScanSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const scanInputRef = useRef<HTMLInputElement>(null)

  const loadData = async () => {
    try {
      const [prodsData, promosData] = await Promise.all([
        api<CheckoutProduct[]>('/checkout/products'),
        api<Promotion[]>('/checkout/promotions'),
      ])
      setProducts(prodsData || [])
      setPromos(promosData || [])
    } catch (err: any) {
      toast.error(err.message || 'Failed to load checkout data')
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const cartLine = (productId: string) => cart.find((l) => l.productId === productId)

  const subtotal = () => cart.reduce((s, l) => s + l.price * l.qty, 0)

  const activePromo = () => {
    if (!promoCode) return null
    return promos.find((p) => p.code.toUpperCase() === promoCode.trim().toUpperCase())
  }

  const discount = () => {
    const p = activePromo()
    if (!p) return 0
    return p.type === 'PERCENT' ? subtotal() * (p.value / 100) : p.value
  }

  const total = () => Math.max(0, subtotal() - discount())

  const addToCart = (p: CheckoutProduct) => {
    const existing = cartLine(p.productId)
    if (existing) {
      if (existing.qty < p.available) {
        setCart(cart.map((l) => (l.productId === p.productId ? { ...l, qty: l.qty + 1 } : l)))
      } else {
        toast.error('No more stock available')
      }
    } else {
      if (p.available <= 0) {
        toast.error('Item is out of stock')
        return
      }
      setCart([...cart, { productId: p.productId, name: p.name, price: p.price, qty: 1 }])
    }
  }

  const changeQty = (productId: string, delta: number) => {
    const line = cartLine(productId)
    if (!line) return
    const newQty = line.qty + delta
    if (newQty <= 0) {
      setCart(cart.filter((l) => l.productId !== productId))
    } else {
      const prod = products.find((p) => p.productId === productId)
      if (prod && newQty > prod.available) {
        toast.error('No more stock available')
        return
      }
      setCart(cart.map((l) => (l.productId === productId ? { ...l, qty: newQty } : l)))
    }
  }

  const handleBarcodeSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    const val = scanValue.trim()
    setScanValue('')
    const p = products.find((x) => x.barcode === val || x.productId === val)
    if (p) {
      addToCart(p)
      setIsScanSuccess(true)
      setTimeout(() => setIsScanSuccess(false), 600)
      toast.success(`Added ${p.name}`)
    } else {
      toast.error(`No product matches barcode "${val}"`)
    }
  }

  const loadRecommendations = async () => {
    const id = customerId.trim()
    if (!id || !/^[A-Za-z0-9_-]{1,80}$/.test(id)) {
      setRecommendations(null)
      if (id) toast.error('Customer ID must use letters, numbers, _ or -')
      return
    }
    setRecommendationLoading(true)
    try {
      const result = await api<RecommendationResponse>(`/ml/recommendations?customerId=${encodeURIComponent(id)}&limit=5`)
      setRecommendations(result)
    } catch (err: any) {
      setRecommendations(null)
      if (err.status !== 503) toast.error(err.message || 'Recommendations unavailable')
    } finally {
      setRecommendationLoading(false)
    }
  }

  const handleCheckout = async () => {
    if (!cart.length || !paymentMethod) return
    setSubmitting(true)
    try {
      const { receipt } = await api<{ receipt: SaleReceipt }>('/checkout', {
        method: 'POST',
        body: {
          items: cart.map((l) => ({ productId: l.productId, quantity: l.qty })),
          promotionCode: activePromo() ? activePromo()!.code : null,
          paymentMethod,
          customerId: customerId.trim() || undefined,
          recommendationContext: recommendations ? {
            modelVersion: recommendations.modelVersion,
            strategy: recommendations.strategy,
            fallback: recommendations.fallback,
            suggestedProductIds: recommendations.recommendations.map((p) => p.productId),
          } : undefined,
        },
      })
      setCompletedSale(receipt)
      setIsReceiptOpen(true)
      setCart([])
      setPromoCode('')
      setPaymentMethod(null)
      setCustomerId('')
      setRecommendations(null)
      loadData()
    } catch (err: any) {
      toast.error(err.message || 'Checkout failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="checkout-layout">
      <div className="stack min-w-0" style={{ minHeight: 0 }}>
        <div className={`scanner-box transition-all ${isScanSuccess ? 'animate-scan-success' : ''}`}>
          <Input
            ref={scanInputRef}
            placeholder="Scan or type a barcode, then press Enter…"
            value={scanValue}
            onChange={(e) => setScanValue(e.target.value)}
            onKeyDown={handleBarcodeSubmit}
            autoFocus
            className="text-center font-mono text-base bg-white"
          />
        </div>

        <div className="product-grid">
          {products.length > 0 ? (
            products.map((p) => (
              <div
                key={p.productId}
                className="product-tile group hover:-translate-y-0.5 hover:shadow-md transition-all duration-150"
                onClick={() => addToCart(p)}
              >
                <div className="product-img-wrap">
                  {isImg(p.image) ? (
                    <img src={p.image} alt={p.name} className="product-photo" />
                  ) : (
                    <span className="emoji">{p.image}</span>
                  )}
                </div>
                <div className="name truncate w-full" title={p.name}>{p.name}</div>
                <div className="price mono">{fmtMoney(p.price)}</div>
                <div className="avail">{p.available} in stock</div>
              </div>
            ))
          ) : (
            <div className="empty col-span-full">No products in stock at this store.</div>
          )}
        </div>
      </div>

      <div className="cart-panel shadow-sm">
        <div className="section-head px-4 pt-3.5 pb-0">
          <div className="flex items-center gap-2">
            <PageIcon name="checkout" className="w-5 h-5 text-neutral-800" />
            <h3 className="font-bold">Order summary</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsRecentSalesOpen(true)}
              className="text-xs h-7 px-2 gap-1 text-muted-foreground hover:text-black"
              title="View recent checkout receipts"
            >
              <History size={12} />
              Recent Sales
            </Button>
          </div>
          {cart.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCart([])}
              className="text-muted-foreground hover:text-black text-xs h-7"
            >
              Clear
            </Button>
          )}
        </div>

        <div className="cart-items">
          {cart.length > 0 ? (
            cart.map((item) => (
              <div key={item.productId} className="cart-line">
                <div className="min-w-0 flex-1 pr-2">
                  <div className="font-medium truncate" title={item.name}>{item.name}</div>
                  <div className="mono text-xs text-muted-foreground">
                    {fmtMoney(item.price)} ea
                  </div>
                </div>
                <div className="qty-ctl shrink-0">
                  <button type="button" onClick={() => changeQty(item.productId, -1)}>
                    −
                  </button>
                  <span className="mono font-semibold px-1">{item.qty}</span>
                  <button type="button" onClick={() => changeQty(item.productId, 1)}>
                    +
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="empty py-16">Cart is empty — scan or tap a product.</div>
          )}
        </div>

        <div className="px-3.5 mb-2">
          <div className="field mb-2">
            <label className="text-xs font-semibold text-muted-foreground">Customer ID (optional)</label>
            <div className="flex gap-2 mt-1">
              <Input
                placeholder="e.g. CUST-001"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="font-mono"
              />
              <Button type="button" variant="outline" onClick={loadRecommendations} disabled={recommendationLoading}>
                {recommendationLoading ? 'Loading…' : 'Suggest'}
              </Button>
            </div>
          </div>
          {recommendations && (
            <div className="rounded-md border border-line bg-neutral-50 p-2">
              <div className="mb-2 flex items-center justify-between text-xs font-semibold">
                <span>{recommendations.fallback ? 'Popular suggestions' : 'For this customer'}</span>
                <span className="text-muted-foreground">{recommendations.recommendations.length} available</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {recommendations.recommendations.map((p) => (
                  <button key={p.productId} type="button" onClick={() => addToCart({ ...p, barcode: '', image: p.image })} className="rounded border border-line bg-white px-2 py-1 text-left text-xs hover:border-[#E2542A]">
                    <span className="block font-medium">{p.name}</span>
                    <span className="mono text-muted-foreground">{fmtMoney(p.price)} · {p.available} left</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-3.5 mb-2">
          <div className="field mb-2">
            <label className="text-xs font-semibold text-muted-foreground">Promotion code</label>
            <Input
              placeholder="e.g. SAVE10"
              value={promoCode}
              onChange={(e) => setPromoCode(e.target.value)}
              className="mt-1 uppercase font-mono"
            />
          </div>
        </div>

        <div className="cart-totals">
          <div className="line">
            <span>Subtotal</span>
            <span className="mono">{fmtMoney(subtotal())}</span>
          </div>
          <div className="line">
            <span>
              Discount {activePromo() ? `(${activePromo()!.code})` : ''}
            </span>
            <span className="mono text-green-700">−{fmtMoney(discount())}</span>
          </div>
          <div className="line grand">
            <span>Total</span>
            <span className="mono">{fmtMoney(total())}</span>
          </div>
        </div>

        <div className="payment-methods">
          {['Card', 'Cash', 'Mobile Wallet'].map((m) => (
            <button
              key={m}
              type="button"
              className={paymentMethod === m ? 'selected' : ''}
              onClick={() => setPaymentMethod(m)}
            >
              {m}
            </button>
          ))}
        </div>

        <div className="p-3.5 pt-0">
          <Button
            onClick={handleCheckout}
            disabled={!cart.length || !paymentMethod || submitting}
            className="w-full bg-[#E2542A] hover:bg-[#c9431c] text-white py-2.5 font-bold transition-all"
          >
            {submitting ? 'Processing…' : `Complete checkout · ${fmtMoney(total())}`}
          </Button>
        </div>
      </div>

      <ReceiptDialog
        open={isReceiptOpen}
        sale={completedSale}
        onClose={() => setIsReceiptOpen(false)}
      />

      <RecentSalesDialog
        open={isRecentSalesOpen}
        onClose={() => setIsRecentSalesOpen(false)}
        storeId={user?.storeId}
      />
    </div>
  )
}
