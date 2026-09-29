import React, { useState, useEffect, useMemo } from 'react'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { fmtMoney } from '@/lib/utils'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NewProductDialog } from './new-product-dialog'
import { Search, Trash2 } from 'lucide-react'
import { PageIcon } from '@/lib/page-icons'

interface Product {
  id: string
  name: string
  barcode: string
  price: number
  image?: string
}

export const ProductsPage: React.FC = () => {
  const { has } = useAuth()
  const canManage = has('PRODUCT_MANAGE')

  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false)

  const loadProducts = async () => {
    setLoading(true)
    try {
      const data = await api<Product[]>('/products')
      setProducts(data || [])
    } catch (err: any) {
      toast.error(err.message || 'Failed to load products')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProducts()
  }, [])

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) return
    try {
      await api(`/products/${id}`, { method: 'DELETE' })
      toast.success('Product deleted')
      loadProducts()
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete product')
    }
  }

  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return products
    const q = searchQuery.toLowerCase()
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || p.barcode.toLowerCase().includes(q)
    )
  }, [products, searchQuery])

  return (
    <div className="custom-card shadow-sm">
      <div className="section-head flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-line mb-3">
        <div className="flex items-center gap-2.5">
          <PageIcon name="products" className="w-5 h-5 text-neutral-800" />
          <div>
            <h3 className="font-bold text-base">Product catalog</h3>
            <p className="text-xs text-muted-foreground">
              Manage product master catalog, barcodes, and standard pricing
            </p>
          </div>
        </div>
        {canManage && (
          <Button
            size="sm"
            onClick={() => setIsNewDialogOpen(true)}
            className="bg-[#E2542A] hover:bg-[#c9431c] text-white text-xs h-8 font-semibold"
          >
            + New product
          </Button>
        )}
      </div>

      {/* Search Bar */}
      <div className="relative mb-3 max-w-sm">
        <Search size={14} className="absolute left-3 top-2.5 text-muted-foreground" />
        <Input
          placeholder="Search products by name or barcode…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-8 text-xs h-8 bg-neutral-50/50"
        />
      </div>

      <div className="overflow-x-auto border border-line rounded-md">
        {loading ? (
          <div className="empty py-12">Loading products…</div>
        ) : (
          <table className="w-full text-xs sm:text-sm">
            <thead className="bg-neutral-50 border-b border-line text-muted-foreground font-semibold">
              <tr>
                <th className="py-2.5 px-3 text-center w-14">#</th>
                <th className="py-2.5 px-3 text-left">Product Name</th>
                <th className="py-2.5 px-3 text-left font-mono w-40">Barcode</th>
                <th className="py-2.5 px-3 text-right font-mono w-32">Unit Price</th>
                {canManage && <th className="py-2.5 px-3 text-right w-24">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E7EA]">
              {filteredProducts.length > 0 ? (
                filteredProducts.map((p) => (
                  <tr key={p.id} className="row-hover">
                    <td className="py-2 px-3 text-center text-xl">{p.image || '📦'}</td>
                    <td className="py-2 px-3 font-medium text-left">{p.name}</td>
                    <td className="py-2 px-3 font-mono text-muted-foreground text-xs text-left">
                      {p.barcode}
                    </td>
                    <td className="py-2 px-3 text-right mono font-bold text-sm text-[#15181D]">
                      {fmtMoney(p.price)}
                    </td>
                    {canManage && (
                      <td className="py-2 px-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(p.id, p.name)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 text-xs h-7 px-2 gap-1"
                        >
                          <Trash2 size={13} />
                          Delete
                        </Button>
                      </td>
                    )}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={canManage ? 5 : 4} className="empty py-10 text-center text-muted-foreground">
                    No products found in catalog.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <NewProductDialog
        open={isNewDialogOpen}
        onClose={() => setIsNewDialogOpen(false)}
        onSuccess={loadProducts}
      />
    </div>
  )
}
