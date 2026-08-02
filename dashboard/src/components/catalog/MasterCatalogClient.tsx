'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Plus, Search, ChevronDown, ChevronRight,
  Package, Store, Check, X, Clock,
  ToggleLeft, ToggleRight, Tag
} from 'lucide-react'
import clsx from 'clsx'

// ── Types ──────────────────────────────────────────────────────────────────────
interface MasterCategory {
  id: string
  name: string
  slug: string
  display_order: number
  is_active: boolean
  master_products?: MasterProduct[]
}

interface MasterProduct {
  id: string
  master_category_id: string
  name: string
  brand: string | null
  unit: string
  base_price: number | null
  is_active: boolean
}

interface Shop {
  id: string
  name: string
  city: string | null
  is_active: boolean
}

interface ShopCategoryEnablement {
  shop_id: string
  master_category_id: string
}

interface ProductRequest {
  id: string
  shop_id: string
  name: string
  brand: string | null
  unit: string
  suggested_price: number | null
  reason: string | null
  status: string
  created_at: string
  shops?: { name: string }
}

type Tab = 'catalog' | 'enable' | 'requests'

export default function MasterCatalogClient() {
  const supabase = createClient()

  const [activeTab, setActiveTab]           = useState<Tab>('catalog')
  const [categories, setCategories]         = useState<MasterCategory[]>([])
  const [shops, setShops]                   = useState<Shop[]>([])
  const [enablements, setEnablements]       = useState<ShopCategoryEnablement[]>([])
  const [requests, setRequests]             = useState<ProductRequest[]>([])
  const [expandedCat, setExpandedCat]       = useState<string | null>(null)
  const [selectedShop, setSelectedShop]     = useState<string>('')
  const [loading, setLoading]               = useState(true)
  const [toast, setToast]                   = useState('')
  const [search, setSearch]                 = useState('')
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Add product/category modal
  const [showAddProduct, setShowAddProduct] = useState<string | null>(null) // category id
  const [showAddCategory, setShowAddCategory] = useState(false)
  const [productForm, setProductForm]       = useState({ name: '', brand: '', unit: '', base_price: '' })
  const [categoryForm, setCategoryForm]     = useState({ name: '', slug: '' })
  const [saving, setSaving]                 = useState(false)

  function showToast(msg: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = setTimeout(() => setToast(''), 3000)
  }

  // ── Load data ──────────────────────────────────────────────────────────────
  useEffect(() => {
    loadAll()
  }, [])

  async function loadAll() {
    setLoading(true)
    const [catsRes, shopsRes, requestsRes] = await Promise.all([
      supabase
        .from('master_categories')
        .select('*, master_products(*)')
        .order('display_order'),
      supabase
        .from('shops')
        .select('id, name, city, is_active')
        .order('name'),
      supabase
        .from('product_requests')
        .select('*, shops(name)')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
    ])

    if (catsRes.data)     setCategories(catsRes.data as MasterCategory[])
    if (shopsRes.data)    setShops(shopsRes.data as Shop[])
    if (requestsRes.data) setRequests(requestsRes.data as ProductRequest[])
    setLoading(false)
  }

  async function loadEnablements(shopId: string) {
    const { data } = await supabase
      .from('shop_master_categories')
      .select('shop_id, master_category_id')
      .eq('shop_id', shopId)
    if (data) setEnablements(data)
  }

  // ── Category enablement ────────────────────────────────────────────────────
  function isCategoryEnabled(catId: string) {
    return enablements.some(e => e.master_category_id === catId)
  }

  async function toggleCategoryForShop(catId: string) {
    if (!selectedShop) return
    const isEnabled = isCategoryEnabled(catId)

    if (isEnabled) {
      // Disable — remove row
      const { error } = await supabase
        .from('shop_master_categories')
        .delete()
        .eq('shop_id', selectedShop)
        .eq('master_category_id', catId)

      if (error) { showToast(`Error: ${error.message}`); return }
      setEnablements(prev => prev.filter(e => e.master_category_id !== catId))
      showToast('Category disabled for shop')
    } else {
      // Enable — insert row
      const { error } = await supabase
        .from('shop_master_categories')
        .insert({ shop_id: selectedShop, master_category_id: catId })

      if (error) { showToast(`Error: ${error.message}`); return }
      setEnablements(prev => [...prev, { shop_id: selectedShop, master_category_id: catId }])

      // Auto-create shop_master_products rows for all products in this category
      const cat = categories.find(c => c.id === catId)
      if (cat?.master_products?.length) {
        const rows = cat.master_products.map(p => ({
          shop_id: selectedShop,
          master_product_id: p.id,
          stock_quantity: 0,
          is_available: true,
          is_enabled: true,
        }))
        // upsert in case some already exist
        await supabase.from('shop_master_products').upsert(rows, { onConflict: 'shop_id,master_product_id', ignoreDuplicates: true })
      }
      showToast('Category enabled — all products added to shop catalog')
    }
  }

  // ── Add master product ─────────────────────────────────────────────────────
  async function handleAddProduct(e: React.FormEvent) {
    e.preventDefault()
    if (!showAddProduct) return
    setSaving(true)

    const { data, error } = await supabase
      .from('master_products')
      .insert({
        master_category_id: showAddProduct,
        name:       productForm.name,
        brand:      productForm.brand || null,
        unit:       productForm.unit,
        base_price: productForm.base_price ? parseFloat(productForm.base_price) : null,
      })
      .select()
      .single()

    if (error) {
      showToast(`Error: ${error.message}`)
    } else {
      setCategories(prev => prev.map(c =>
        c.id === showAddProduct
          ? { ...c, master_products: [...(c.master_products ?? []), data as MasterProduct] }
          : c
      ))
      setShowAddProduct(null)
      setProductForm({ name: '', brand: '', unit: '', base_price: '' })
      showToast('Product added to master catalog')
    }
    setSaving(false)
  }

  // ── Add master category ────────────────────────────────────────────────────
  async function handleAddCategory(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    const { data, error } = await supabase
      .from('master_categories')
      .insert({
        name:          categoryForm.name,
        slug:          categoryForm.slug,
        display_order: categories.length + 1,
      })
      .select()
      .single()

    if (error) {
      showToast(`Error: ${error.message}`)
    } else {
      setCategories(prev => [...prev, { ...(data as MasterCategory), master_products: [] }])
      setShowAddCategory(false)
      setCategoryForm({ name: '', slug: '' })
      showToast('Category created')
    }
    setSaving(false)
  }

  // ── Approve/reject product request ─────────────────────────────────────────
  async function handleRequest(req: ProductRequest, decision: 'approved_global' | 'approved_local' | 'rejected') {
    if (decision === 'approved_global') {
      // Add to master products — ask which category
      const catId = prompt('Enter master category ID to add this product to:')
      if (!catId) return

      const { data: newProduct, error: productError } = await supabase
        .from('master_products')
        .insert({
          master_category_id: catId,
          name:           req.name,
          brand:          req.brand,
          unit:           req.unit,
          base_price:     req.suggested_price,
        })
        .select()
        .single()

      if (productError) { showToast(`Error: ${productError.message}`); return }

      await supabase.from('product_requests').update({
        status:            'approved_global',
        master_product_id: newProduct.id,
        reviewed_at:       new Date().toISOString(),
      }).eq('id', req.id)

    } else if (decision === 'approved_local') {
      // Add directly to shop's products table
      const { data: shopProduct, error: shopError } = await supabase
        .from('products')
        .insert({
          shop_id:    req.shop_id,
          name:       req.name,
          unit:       req.unit,
          price:      req.suggested_price ?? 0,
          stock_quantity: 0,
        })
        .select()
        .single()

      if (shopError) { showToast(`Error: ${shopError.message}`); return }

      await supabase.from('product_requests').update({
        status:         'approved_local',
        shop_product_id: shopProduct.id,
        reviewed_at:    new Date().toISOString(),
      }).eq('id', req.id)

    } else {
      await supabase.from('product_requests').update({
        status:      'rejected',
        reviewed_at: new Date().toISOString(),
      }).eq('id', req.id)
    }

    setRequests(prev => prev.filter(r => r.id !== req.id))
    showToast(decision === 'rejected' ? 'Request rejected' : 'Request approved')
  }

  const filteredCats = categories.filter(c =>
    !search ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.master_products?.some(p => p.name.toLowerCase().includes(search.toLowerCase()))
  )

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-slate-500">Loading catalog...</div>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Master Catalog</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {categories.length} categories · {categories.reduce((n, c) => n + (c.master_products?.length ?? 0), 0)} products
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowAddCategory(true)} className="btn-secondary">
            <Tag className="w-4 h-4" /> Add Category
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: '#0f172a' }}>
        {([
          { id: 'catalog',  label: 'Master Catalog', icon: Package },
          { id: 'enable',   label: 'Enable for Shops', icon: Store },
          { id: 'requests', label: `Requests ${requests.length > 0 ? `(${requests.length})` : ''}`, icon: Clock },
        ] as { id: Tab; label: string; icon: any }[]).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={clsx(
              'flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all',
              activeTab === tab.id
                ? 'text-white' : 'text-slate-500 hover:text-slate-300'
            )}
            style={activeTab === tab.id ? { background: '#1e293b', border: '1px solid #334155' } : {}}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Master Catalog ──────────────────────────────────────────────── */}
      {activeTab === 'catalog' && (
        <div className="space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search products or categories..."
              className="input pl-9"
            />
          </div>

          {filteredCats.map(cat => (
            <div key={cat.id} className="card p-0 overflow-hidden">
              {/* Category header */}
              <button
                onClick={() => setExpandedCat(expandedCat === cat.id ? null : cat.id)}
                className="w-full flex items-center justify-between p-4 hover:bg-slate-700/20 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {expandedCat === cat.id
                    ? <ChevronDown className="w-4 h-4 text-slate-400" />
                    : <ChevronRight className="w-4 h-4 text-slate-400" />}
                  <span className="font-semibold text-white">{cat.name}</span>
                  <span className="text-xs text-slate-500 px-2 py-0.5 rounded-full"
                    style={{ background: '#334155' }}>
                    {cat.master_products?.length ?? 0} items
                  </span>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); setShowAddProduct(cat.id) }}
                  className="btn-secondary btn-sm flex items-center gap-1 text-xs"
                >
                  <Plus className="w-3 h-3" /> Add product
                </button>
              </button>

              {/* Products list */}
              {expandedCat === cat.id && (
                <div style={{ borderTop: '1px solid #334155' }}>
                  {!cat.master_products?.length ? (
                    <div className="p-6 text-center text-slate-500 text-sm">
                      No products yet.{' '}
                      <button onClick={() => setShowAddProduct(cat.id)} className="text-blue-400 hover:underline">
                        Add the first one
                      </button>
                    </div>
                  ) : (
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>Brand</th>
                          <th>Unit</th>
                          <th>Base Price</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cat.master_products
                          .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()))
                          .map(product => (
                            <tr key={product.id}>
                              <td className="text-slate-100 font-medium">{product.name}</td>
                              <td>{product.brand ?? <span className="text-slate-600">—</span>}</td>
                              <td>{product.unit}</td>
                              <td>{product.base_price ? `₹${product.base_price}` : <span className="text-slate-600">—</span>}</td>
                              <td>
                                <span className={clsx('status-badge border text-xs',
                                  product.is_active
                                    ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20'
                                    : 'text-slate-400 bg-slate-400/10 border-slate-400/20'
                                )}>
                                  {product.is_active ? 'Active' : 'Inactive'}
                                </span>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Tab: Enable for Shops ────────────────────────────────────────────── */}
      {activeTab === 'enable' && (
        <div className="space-y-5">
          {/* Shop selector */}
          <div className="card">
            <label className="block text-xs font-medium text-slate-400 mb-2">Select a shop to manage its catalog</label>
            <select
              value={selectedShop}
              onChange={e => { setSelectedShop(e.target.value); if (e.target.value) loadEnablements(e.target.value) }}
              className="input"
            >
              <option value="">Choose a shop...</option>
              {shops.map(shop => (
                <option key={shop.id} value={shop.id}>
                  {shop.name}{shop.city ? ` — ${shop.city}` : ''}
                  {!shop.is_active ? ' (inactive)' : ''}
                </option>
              ))}
            </select>
          </div>

          {selectedShop && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-400">
                  Toggle categories to enable/disable all products in that category for this shop.
                </p>
                <span className="text-xs text-slate-500">
                  {enablements.length} of {categories.length} categories enabled
                </span>
              </div>

              <div className="space-y-2">
                {categories.map(cat => {
                  const enabled = isCategoryEnabled(cat.id)
                  return (
                    <div
                      key={cat.id}
                      className={clsx('card flex items-center justify-between transition-all',
                        enabled ? 'border-emerald-500/30' : ''
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className={clsx('w-2 h-2 rounded-full', enabled ? 'bg-emerald-400' : 'bg-slate-600')} />
                        <div>
                          <p className="font-medium text-white text-sm">{cat.name}</p>
                          <p className="text-xs text-slate-500">{cat.master_products?.length ?? 0} products</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {enabled && (
                          <span className="text-xs text-emerald-400">
                            {cat.master_products?.length ?? 0} items added to shop
                          </span>
                        )}
                        <button
                          onClick={() => toggleCategoryForShop(cat.id)}
                          className={clsx('flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                            enabled
                              ? 'text-red-400 hover:bg-red-400/10'
                              : 'text-emerald-400 hover:bg-emerald-400/10'
                          )}
                        >
                          {enabled
                            ? <><X className="w-3.5 h-3.5" /> Disable</>
                            : <><Check className="w-3.5 h-3.5" /> Enable</>}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Tab: Product Requests ────────────────────────────────────────────── */}
      {activeTab === 'requests' && (
        <div className="space-y-3">
          {requests.length === 0 ? (
            <div className="card text-center py-12 text-slate-500">
              No pending product requests. Shopkeepers can request products from their dashboard.
            </div>
          ) : requests.map(req => (
            <div key={req.id} className="card">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-semibold text-white">{req.name}</p>
                    {req.brand && <span className="text-xs text-slate-500">{req.brand}</span>}
                    <span className="text-xs px-2 py-0.5 rounded" style={{ background: '#334155', color: '#94a3b8' }}>
                      {req.unit}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    From: <span className="text-slate-300">{req.shops?.name}</span>
                    {req.suggested_price && <> · Suggested ₹{req.suggested_price}</>}
                    {req.reason && <> · "{req.reason}"</>}
                  </p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleRequest(req, 'approved_global')}
                    className="btn-secondary text-xs flex items-center gap-1"
                    title="Add to master catalog (available to all shops)"
                  >
                    <Package className="w-3 h-3" /> Add to Master
                  </button>
                  <button
                    onClick={() => handleRequest(req, 'approved_local')}
                    className="btn-secondary text-xs flex items-center gap-1"
                    title="Approve only for this shop"
                  >
                    <Store className="w-3 h-3" /> Shop Only
                  </button>
                  <button
                    onClick={() => handleRequest(req, 'rejected')}
                    className="btn-ghost text-xs text-red-400 flex items-center gap-1"
                  >
                    <X className="w-3 h-3" /> Reject
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Add Product Modal ──────────────────────────────────────────────── */}
      {showAddProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowAddProduct(null)} />
          <div className="relative rounded-2xl w-full max-w-md shadow-2xl"
            style={{ background: '#1e293b', border: '1px solid #334155' }}>
            <div className="p-6">
              <h2 className="font-display font-bold text-white text-lg mb-1">Add Master Product</h2>
              <p className="text-slate-400 text-sm mb-5">
                Adding to: <span className="text-white">{categories.find(c => c.id === showAddProduct)?.name}</span>
              </p>
              <form onSubmit={handleAddProduct} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Product name *</label>
                  <input value={productForm.name} onChange={e => setProductForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Amul Butter" required className="input" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Brand</label>
                    <input value={productForm.brand} onChange={e => setProductForm(f => ({ ...f, brand: e.target.value }))}
                      placeholder="Amul" className="input" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Unit *</label>
                    <input value={productForm.unit} onChange={e => setProductForm(f => ({ ...f, unit: e.target.value }))}
                      placeholder="100g / 1L / piece" required className="input" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Base price (₹)</label>
                  <input type="number" value={productForm.base_price}
                    onChange={e => setProductForm(f => ({ ...f, base_price: e.target.value }))}
                    placeholder="52" className="input" />
                  <p className="text-xs text-slate-600 mt-1">Shopkeepers can override this price</p>
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setShowAddProduct(null)} className="btn-secondary flex-1 justify-center">Cancel</button>
                  <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">
                    {saving ? 'Adding...' : 'Add Product'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Category Modal ──────────────────────────────────────────────── */}
      {showAddCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowAddCategory(false)} />
          <div className="relative rounded-2xl w-full max-w-sm shadow-2xl"
            style={{ background: '#1e293b', border: '1px solid #334155' }}>
            <div className="p-6">
              <h2 className="font-display font-bold text-white text-lg mb-5">Add Category</h2>
              <form onSubmit={handleAddCategory} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Category name *</label>
                  <input
                    value={categoryForm.name}
                    onChange={e => {
                      const name = e.target.value
                      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
                      setCategoryForm({ name, slug })
                    }}
                    placeholder="Dairy & Eggs" required className="input" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Slug *</label>
                  <input value={categoryForm.slug}
                    onChange={e => setCategoryForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                    placeholder="dairy" required className="input" />
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setShowAddCategory(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
                  <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">
                    {saving ? 'Creating...' : 'Create'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl px-4 py-3 shadow-xl text-sm text-slate-200 flex items-center gap-2"
          style={{ background: '#1e293b', border: '1px solid #334155' }}>
          <Check className="w-4 h-4 text-emerald-400" />
          {toast}
        </div>
      )}
    </div>
  )
}
