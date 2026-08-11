'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Plus, Search, Package, Store, Check, X, Clock, Tag, Pencil,
  ChevronRight, ImageOff,
} from 'lucide-react'
import clsx from 'clsx'
import CartLoader from '@/components/ui/CartLoader'
import EmptyState from '@/components/ui/EmptyState'

// ── Types ──────────────────────────────────────────────────────────────────────
interface MasterCategory {
  id: string
  name: string
  slug: string
  image_url: string | null
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
  image_url: string | null
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

interface ShopProductEnablement {
  shop_id: string
  master_product_id: string
  is_enabled: boolean
}

type VariantRow = { unit: string; base_price: string }

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

function Thumb({ src, alt, size = 36 }: { src: string | null; alt: string; size?: number }) {
  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        style={{ width: size, height: size, borderRadius: 8, objectFit: 'cover', flexShrink: 0, border: '1px solid var(--surface-border)' }}
      />
    )
  }
  return (
    <div
      style={{
        width: size, height: size, borderRadius: 8, flexShrink: 0,
        background: 'var(--surface)', border: '1px solid var(--surface-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <ImageOff size={size * 0.4} color="var(--ink-faint)" />
    </div>
  )
}

export default function MasterCatalogClient() {
  const supabase = createClient()

  const [activeTab, setActiveTab] = useState<Tab>('catalog')
  const [categories, setCategories] = useState<MasterCategory[]>([])
  const [shops, setShops] = useState<Shop[]>([])
  const [enablements, setEnablements] = useState<ShopCategoryEnablement[]>([]) // ALL shops, loaded once
  const [productEnablements, setProductEnablements] = useState<ShopProductEnablement[]>([]) // ALL shops, loaded once
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<Set<string>>(new Set())
  const [bulkBusyProductId, setBulkBusyProductId] = useState<string | null>(null)
  const [requests, setRequests] = useState<ProductRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Catalog tab
  const [catalogSearch, setCatalogSearch] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)

  // Enable-for-shops tab
  const [selectedShopIds, setSelectedShopIds] = useState<Set<string>>(new Set())
  const [shopSearch, setShopSearch] = useState('')
  const [bulkBusyCategoryId, setBulkBusyCategoryId] = useState<string | null>(null)

  // Requests tab
  const [requestShopFilter, setRequestShopFilter] = useState<string>('all')

  // Modals
  const [showAddCategory, setShowAddCategory] = useState(false)
  const [editingCategory, setEditingCategory] = useState<MasterCategory | null>(null)
  const [showAddProduct, setShowAddProduct] = useState(false)
  const [editingProduct, setEditingProduct] = useState<MasterProduct | null>(null)
  const [showApproveGlobal, setShowApproveGlobal] = useState<ProductRequest | null>(null)
  const [approveCategoryId, setApproveCategoryId] = useState('')
  const [saving, setSaving] = useState(false)

  const [categoryForm, setCategoryForm] = useState({ name: '', slug: '', image_url: '' })
  const EMPTY_MASTER_VARIANT: VariantRow = { unit: '', base_price: '' }
  const [productForm, setProductForm] = useState({
    name: '',
    brand: '',
    image_url: '',
    variants: [{ ...EMPTY_MASTER_VARIANT }] as VariantRow[],
  })

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
    const [catsRes, shopsRes, requestsRes, enablementsRes, productEnablementsRes] = await Promise.all([
      supabase.from('master_categories').select('*, master_products(*)').order('display_order'),
      supabase.from('shops').select('id, name, city, is_active').order('name'),
      supabase.from('product_requests').select('*, shops(name)').eq('status', 'pending').order('created_at', { ascending: false }),
      // Loaded for every shop up front (small table) rather than per-selected-shop —
      // the bulk enable/disable and per-category coverage counts both need to see
      // every shop's enablement state at once, not just one shop at a time.
      supabase.from('shop_master_categories').select('shop_id, master_category_id'),
      supabase.from('shop_master_products').select('shop_id, master_product_id, is_enabled'),
    ])

    if (catsRes.data) {
      setCategories(catsRes.data as MasterCategory[])
      if (!selectedCategoryId && catsRes.data.length > 0) setSelectedCategoryId(catsRes.data[0].id)
    }
    if (shopsRes.data) setShops(shopsRes.data as Shop[])
    if (requestsRes.data) setRequests(requestsRes.data as ProductRequest[])
    if (enablementsRes.data) setEnablements(enablementsRes.data)
    if (productEnablementsRes.data) setProductEnablements(productEnablementsRes.data as ShopProductEnablement[])
    setLoading(false)
  }

  // ── Category enablement (bulk, across selected shops) ─────────────────────
  function enabledShopCount(categoryId: string) {
    return enablements.filter((e) => e.master_category_id === categoryId).length
  }

  function toggleShopSelection(shopId: string) {
    setSelectedShopIds((prev) => {
      const next = new Set(prev)
      if (next.has(shopId)) next.delete(shopId)
      else next.add(shopId)
      return next
    })
  }

  async function bulkToggleCategory(catId: string, enable: boolean) {
    if (selectedShopIds.size === 0) {
      showToast('Select at least one shop first')
      return
    }
    setBulkBusyCategoryId(catId)

    const targetShopIds = Array.from(selectedShopIds)

    if (!enable) {
      const { error } = await supabase
        .from('shop_master_categories')
        .delete()
        .eq('master_category_id', catId)
        .in('shop_id', targetShopIds)

      if (error) {
        showToast(`Error: ${error.message}`)
      } else {
        setEnablements((prev) => prev.filter((e) => !(e.master_category_id === catId && targetShopIds.includes(e.shop_id))))
        showToast(`Category disabled for ${targetShopIds.length} shop${targetShopIds.length > 1 ? 's' : ''}`)
      }
      setBulkBusyCategoryId(null)
      return
    }

    const rows = targetShopIds.map((shopId) => ({ shop_id: shopId, master_category_id: catId }))
    const { error } = await supabase.from('shop_master_categories').upsert(rows, { onConflict: 'shop_id,master_category_id', ignoreDuplicates: true })

    if (error) {
      showToast(`Error: ${error.message}`)
      setBulkBusyCategoryId(null)
      return
    }

    setEnablements((prev) => {
      const existingKeys = new Set(prev.map((e) => `${e.shop_id}:${e.master_category_id}`))
      const additions = rows.filter((r) => !existingKeys.has(`${r.shop_id}:${r.master_category_id}`))
      return [...prev, ...additions]
    })

    const cat = categories.find((c) => c.id === catId)
    if (cat?.master_products?.length) {
      const productRows = targetShopIds.flatMap((shopId) =>
        (cat.master_products ?? []).map((p) => ({
          shop_id: shopId,
          master_product_id: p.id,
          stock_quantity: 0,
          is_available: true,
          is_enabled: true,
        }))
      )
      await supabase.from('shop_master_products').upsert(productRows, { onConflict: 'shop_id,master_product_id', ignoreDuplicates: true })
    }

    // Mirror into each shop's real catalog — same per-shop sync endpoint the
    // single-shop flow already used, just called once per selected shop.
    const syncResults = await Promise.all(
      targetShopIds.map((shopId) =>
        fetch(`/api/admin/shops/${shopId}/sync-master-category`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ masterCategoryId: catId }),
        }).then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      )
    )
    const totalCreated = syncResults.reduce((sum, r) => sum + (r.ok ? r.data.productsCreated ?? 0 : 0), 0)
    const failures = syncResults.filter((r) => !r.ok).length

    showToast(
      failures > 0
        ? `Enabled for ${targetShopIds.length} shop(s), but syncing failed for ${failures} of them`
        : `Enabled for ${targetShopIds.length} shop(s) — ${totalCreated} product(s) added across their catalogs`
    )
    setBulkBusyCategoryId(null)
  }

  function enabledProductShopCount(productId: string) {
    return productEnablements.filter((e) => e.master_product_id === productId && e.is_enabled).length
  }

  function toggleCategoryExpanded(catId: string) {
    setExpandedCategoryIds((prev) => {
      const next = new Set(prev)
      if (next.has(catId)) next.delete(catId)
      else next.add(catId)
      return next
    })
  }

  // Item-level enablement — a shop can have a category enabled but only
  // some of its products (e.g. the master category is enabled but a
  // discontinued item within it shouldn't sync). Independent of
  // bulkToggleCategory above, though enabling a product here also ensures
  // the category's own shop_master_categories bookkeeping row exists (a
  // product can't really be "enabled" for a shop that doesn't have the
  // category at all), and syncs just that one product via
  // sync-master-category's masterProductId param rather than the whole
  // category.
  async function bulkToggleProduct(productId: string, categoryId: string, enable: boolean) {
    if (selectedShopIds.size === 0) {
      showToast('Select at least one shop first')
      return
    }
    setBulkBusyProductId(productId)

    const targetShopIds = Array.from(selectedShopIds)

    if (!enable) {
      const { error } = await supabase
        .from('shop_master_products')
        .update({ is_enabled: false })
        .eq('master_product_id', productId)
        .in('shop_id', targetShopIds)

      if (error) {
        showToast(`Error: ${error.message}`)
      } else {
        setProductEnablements((prev) =>
          prev.map((e) => (e.master_product_id === productId && targetShopIds.includes(e.shop_id) ? { ...e, is_enabled: false } : e))
        )
        showToast(`Product disabled for ${targetShopIds.length} shop${targetShopIds.length > 1 ? 's' : ''}`)
      }
      setBulkBusyProductId(null)
      return
    }

    const catRows = targetShopIds.map((shopId) => ({ shop_id: shopId, master_category_id: categoryId }))
    const { error: catError } = await supabase
      .from('shop_master_categories')
      .upsert(catRows, { onConflict: 'shop_id,master_category_id', ignoreDuplicates: true })

    if (catError) {
      showToast(`Error: ${catError.message}`)
      setBulkBusyProductId(null)
      return
    }

    setEnablements((prev) => {
      const existingKeys = new Set(prev.map((e) => `${e.shop_id}:${e.master_category_id}`))
      const additions = catRows.filter((r) => !existingKeys.has(`${r.shop_id}:${r.master_category_id}`))
      return [...prev, ...additions]
    })

    const productRows = targetShopIds.map((shopId) => ({
      shop_id: shopId,
      master_product_id: productId,
      stock_quantity: 0,
      is_available: true,
      is_enabled: true,
    }))
    const { error } = await supabase.from('shop_master_products').upsert(productRows, { onConflict: 'shop_id,master_product_id' })

    if (error) {
      showToast(`Error: ${error.message}`)
      setBulkBusyProductId(null)
      return
    }

    setProductEnablements((prev) => {
      const existingKeys = new Set(prev.map((e) => `${e.shop_id}:${e.master_product_id}`))
      const additions = productRows
        .filter((r) => !existingKeys.has(`${r.shop_id}:${r.master_product_id}`))
        .map((r) => ({ shop_id: r.shop_id, master_product_id: r.master_product_id, is_enabled: true }))
      const updated = prev.map((e) => (e.master_product_id === productId && targetShopIds.includes(e.shop_id) ? { ...e, is_enabled: true } : e))
      return [...updated, ...additions]
    })

    const syncResults = await Promise.all(
      targetShopIds.map((shopId) =>
        fetch(`/api/admin/shops/${shopId}/sync-master-category`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ masterCategoryId: categoryId, masterProductId: productId }),
        }).then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      )
    )
    const totalCreated = syncResults.reduce((sum, r) => sum + (r.ok ? r.data.productsCreated ?? 0 : 0), 0)
    const failures = syncResults.filter((r) => !r.ok).length

    showToast(
      failures > 0
        ? `Enabled for ${targetShopIds.length} shop(s), but syncing failed for ${failures} of them`
        : `Enabled for ${targetShopIds.length} shop(s) — ${totalCreated} added`
    )
    setBulkBusyProductId(null)
  }

  // ── Category CRUD ───────────────────────────────────────────────────────────
  async function toggleCategoryActive(cat: MasterCategory) {
    const { error } = await supabase.from('master_categories').update({ is_active: !cat.is_active }).eq('id', cat.id)
    if (error) { showToast(`Error: ${error.message}`); return }
    setCategories((prev) => prev.map((c) => (c.id === cat.id ? { ...c, is_active: !c.is_active } : c)))
    showToast(cat.is_active ? 'Category deactivated' : 'Category activated')
  }

  async function handleAddCategory(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    const { data, error } = await supabase
      .from('master_categories')
      .insert({
        name: categoryForm.name,
        slug: categoryForm.slug,
        image_url: categoryForm.image_url || null,
        display_order: categories.length + 1,
      })
      .select()
      .single()

    if (error) {
      showToast(`Error: ${error.message}`)
    } else {
      setCategories((prev) => [...prev, { ...(data as MasterCategory), master_products: [] }])
      setSelectedCategoryId(data.id)
      setShowAddCategory(false)
      setCategoryForm({ name: '', slug: '', image_url: '' })
      showToast('Category created')
    }
    setSaving(false)
  }

  async function handleEditCategory(e: React.FormEvent) {
    e.preventDefault()
    if (!editingCategory) return
    setSaving(true)

    const { error } = await supabase
      .from('master_categories')
      .update({ name: categoryForm.name, slug: categoryForm.slug, image_url: categoryForm.image_url || null })
      .eq('id', editingCategory.id)

    if (error) {
      showToast(`Error: ${error.message}`)
    } else {
      setCategories((prev) =>
        prev.map((c) => (c.id === editingCategory.id ? { ...c, name: categoryForm.name, slug: categoryForm.slug, image_url: categoryForm.image_url || null } : c))
      )
      setEditingCategory(null)
      showToast('Category updated')
    }
    setSaving(false)
  }

  // ── Product CRUD ─────────────────────────────────────────────────────────────
  async function toggleProductActive(product: MasterProduct) {
    const { error } = await supabase.from('master_products').update({ is_active: !product.is_active }).eq('id', product.id)
    if (error) { showToast(`Error: ${error.message}`); return }
    setCategories((prev) =>
      prev.map((c) =>
        c.id === product.master_category_id
          ? { ...c, master_products: c.master_products?.map((p) => (p.id === product.id ? { ...p, is_active: !p.is_active } : p)) }
          : c
      )
    )
  }

  function updateProductVariant(index: number, field: keyof VariantRow, value: string) {
    setProductForm((f) => ({ ...f, variants: f.variants.map((v, i) => (i === index ? { ...v, [field]: value } : v)) }))
  }

  function addProductVariantRow() {
    setProductForm((f) => ({ ...f, variants: [...f.variants, { ...EMPTY_MASTER_VARIANT }] }))
  }

  function removeProductVariantRow(index: number) {
    setProductForm((f) => ({ ...f, variants: f.variants.filter((_, i) => i !== index) }))
  }

  // Same grouping convention as the shop-level Products page: a second
  // variant row under one Name is a second unit, not a separate product —
  // "Tata Salt" 250g/500g/1kg become three master_products rows sharing a
  // name. Uniqueness is enforced per category (client-side here; a DB
  // unique index on (master_category_id, lower(name), lower(unit)) backs
  // it up against races).
  async function handleAddProduct(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedCategoryId) return

    const existing = categories.find((c) => c.id === selectedCategoryId)?.master_products ?? []
    for (const v of productForm.variants) {
      if (!v.unit.trim()) { showToast('Every variant needs a unit'); return }
      const dup = existing.some(
        (p) => p.name.trim().toLowerCase() === productForm.name.trim().toLowerCase() && p.unit.trim().toLowerCase() === v.unit.trim().toLowerCase()
      )
      if (dup) { showToast(`"${productForm.name}" with unit "${v.unit}" already exists in this category`); return }
    }
    const seenUnits = new Set<string>()
    for (const v of productForm.variants) {
      const key = v.unit.trim().toLowerCase()
      if (seenUnits.has(key)) { showToast(`Two variants both use unit "${v.unit}"`); return }
      seenUnits.add(key)
    }

    setSaving(true)

    const { data, error } = await supabase
      .from('master_products')
      .insert(
        productForm.variants.map((v) => ({
          master_category_id: selectedCategoryId,
          name: productForm.name,
          brand: productForm.brand || null,
          unit: v.unit,
          image_url: productForm.image_url || null,
          base_price: v.base_price ? parseFloat(v.base_price) : null,
        }))
      )
      .select()

    if (error) {
      showToast(`Error: ${error.message}`)
    } else {
      setCategories((prev) =>
        prev.map((c) => (c.id === selectedCategoryId ? { ...c, master_products: [...(c.master_products ?? []), ...(data as MasterProduct[])] } : c))
      )
      setShowAddProduct(false)
      setProductForm({ name: '', brand: '', image_url: '', variants: [{ ...EMPTY_MASTER_VARIANT }] })
      showToast(data.length > 1 ? `"${productForm.name}" added — ${data.length} sizes` : 'Product added to master catalog')
    }
    setSaving(false)
  }

  async function handleEditProduct(e: React.FormEvent) {
    e.preventDefault()
    if (!editingProduct) return
    setSaving(true)

    const variant = productForm.variants[0]
    const changes = {
      name: productForm.name,
      brand: productForm.brand || null,
      unit: variant.unit,
      image_url: productForm.image_url || null,
      base_price: variant.base_price ? parseFloat(variant.base_price) : null,
    }

    const { error } = await supabase.from('master_products').update(changes).eq('id', editingProduct.id)

    if (error) {
      showToast(`Error: ${error.message}`)
    } else {
      setCategories((prev) =>
        prev.map((c) =>
          c.id === editingProduct.master_category_id
            ? { ...c, master_products: c.master_products?.map((p) => (p.id === editingProduct.id ? { ...p, ...changes } : p)) }
            : c
        )
      )
      setEditingProduct(null)
      showToast('Product updated')
    }
    setSaving(false)
  }

  // ── Approve/reject product request ─────────────────────────────────────────
  async function handleRequest(req: ProductRequest, decision: 'approved_global' | 'approved_local' | 'rejected', categoryId?: string) {
    if (decision === 'approved_global') {
      if (!categoryId) { setShowApproveGlobal(req); return }

      const { data: newProduct, error: productError } = await supabase
        .from('master_products')
        .insert({ master_category_id: categoryId, name: req.name, brand: req.brand, unit: req.unit, base_price: req.suggested_price })
        .select()
        .single()

      if (productError) { showToast(`Error: ${productError.message}`); return }

      await supabase.from('product_requests').update({
        status: 'approved_global',
        master_product_id: newProduct.id,
        reviewed_at: new Date().toISOString(),
      }).eq('id', req.id)

      setCategories((prev) =>
        prev.map((c) => (c.id === categoryId ? { ...c, master_products: [...(c.master_products ?? []), newProduct as MasterProduct] } : c))
      )
      setShowApproveGlobal(null)
    } else if (decision === 'approved_local') {
      const { data: shopProduct, error: shopError } = await supabase
        .from('products')
        .insert({ shop_id: req.shop_id, name: req.name, unit: req.unit, price: req.suggested_price ?? 0, stock_quantity: 0 })
        .select()
        .single()

      if (shopError) { showToast(`Error: ${shopError.message}`); return }

      await supabase.from('product_requests').update({
        status: 'approved_local',
        shop_product_id: shopProduct.id,
        reviewed_at: new Date().toISOString(),
      }).eq('id', req.id)
    } else {
      await supabase.from('product_requests').update({ status: 'rejected', reviewed_at: new Date().toISOString() }).eq('id', req.id)
    }

    setRequests((prev) => prev.filter((r) => r.id !== req.id))
    showToast(decision === 'rejected' ? 'Request rejected' : 'Request approved')
  }

  const filteredCategories = categories.filter((c) => !catalogSearch || c.name.toLowerCase().includes(catalogSearch.toLowerCase()))
  const selectedCategory = categories.find((c) => c.id === selectedCategoryId) ?? null
  const filteredShopsForEnable = shops.filter((s) => !shopSearch || s.name.toLowerCase().includes(shopSearch.toLowerCase()))
  const filteredRequests = requestShopFilter === 'all' ? requests : requests.filter((r) => r.shop_id === requestShopFilter)
  const requestShopOptions = Array.from(new Map(requests.map((r) => [r.shop_id, r.shops?.name ?? 'Unknown shop'])).entries())

  if (loading) return <CartLoader label="Loading master catalog…" />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Master Catalog</h1>
          <p className="text-ink-muted text-sm mt-0.5">
            {categories.length} categories · {categories.reduce((n, c) => n + (c.master_products?.length ?? 0), 0)} products · {shops.length} shops
          </p>
        </div>
        <button onClick={() => { setCategoryForm({ name: '', slug: '', image_url: '' }); setShowAddCategory(true) }} className="btn-secondary">
          <Tag className="w-4 h-4" /> Add Category
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--surface)' }}>
        {([
          { id: 'catalog', label: 'Master Catalog', icon: Package },
          { id: 'enable', label: 'Enable for Shops', icon: Store },
          { id: 'requests', label: `Requests ${requests.length > 0 ? `(${requests.length})` : ''}`, icon: Clock },
        ] as { id: Tab; label: string; icon: typeof Package }[]).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={clsx(
              'flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all',
              activeTab === tab.id ? 'text-[var(--brand-dark)]' : 'text-ink-muted hover:text-ink'
            )}
            style={activeTab === tab.id ? { background: '#FFFFFF', border: '1px solid var(--surface-border)', boxShadow: '0 1px 3px rgba(11,28,48,0.08)' } : {}}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Master Catalog — sidebar + panel ──────────────────────────── */}
      {activeTab === 'catalog' && (
        <div className="grid gap-4" style={{ gridTemplateColumns: '280px 1fr', alignItems: 'start' }}>
          {/* Sidebar */}
          <div className="card p-0 overflow-hidden" style={{ display: 'flex', flexDirection: 'column', maxHeight: 640 }}>
            <div style={{ padding: 12, borderBottom: '1px solid var(--surface-border)' }}>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint" />
                <input value={catalogSearch} onChange={(e) => setCatalogSearch(e.target.value)} placeholder="Search categories…" className="input pl-9" />
              </div>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {filteredCategories.length === 0 ? (
                <p className="text-ink-muted text-sm p-4">No categories match.</p>
              ) : (
                filteredCategories.map((cat) => {
                  const selected = cat.id === selectedCategoryId
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategoryId(cat.id)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                        background: selected ? 'var(--brand-light)' : 'transparent', border: 'none', borderBottom: '1px solid var(--surface)',
                        cursor: 'pointer', textAlign: 'left',
                      }}
                    >
                      <Thumb src={cat.image_url} alt={cat.name} size={30} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: "var(--text-base)", fontWeight: 600, color: selected ? 'var(--brand-dark)' : 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {cat.name}
                          </span>
                          {!cat.is_active && (
                            <span style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: 'var(--ink-faint)', background: 'var(--surface)', padding: '1px 5px', borderRadius: 999 }}>OFF</span>
                          )}
                        </div>
                        <span style={{ fontSize: "var(--text-xs)", color: 'var(--ink-faint)' }}>{cat.master_products?.length ?? 0} items · in {enabledShopCount(cat.id)} shop{enabledShopCount(cat.id) === 1 ? '' : 's'}</span>
                      </div>
                      <ChevronRight size={14} color="var(--ink-faint)" style={{ flexShrink: 0 }} />
                    </button>
                  )
                })
              )}
            </div>
          </div>

          {/* Main panel */}
          {!selectedCategory ? (
            <div className="card text-center py-16 text-ink-muted">Select a category, or add one to get started.</div>
          ) : (
            <div className="space-y-3">
              <div className="card flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Thumb src={selectedCategory.image_url} alt={selectedCategory.name} size={44} />
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-semibold text-ink text-lg">{selectedCategory.name}</h2>
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ background: selectedCategory.is_active ? 'var(--brand-light)' : 'var(--surface)', color: selectedCategory.is_active ? 'var(--brand-dark)' : 'var(--ink-muted)' }}
                      >
                        {selectedCategory.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <p className="text-xs text-ink-muted mt-0.5">{selectedCategory.master_products?.length ?? 0} products · /{selectedCategory.slug}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setCategoryForm({ name: selectedCategory.name, slug: selectedCategory.slug, image_url: selectedCategory.image_url ?? '' }); setEditingCategory(selectedCategory) }}
                    className="btn-secondary btn-sm"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </button>
                  <button onClick={() => toggleCategoryActive(selectedCategory)} className="btn-secondary btn-sm">
                    {selectedCategory.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                  <button
                    onClick={() => { setProductForm({ name: '', brand: '', image_url: '', variants: [{ ...EMPTY_MASTER_VARIANT }] }); setShowAddProduct(true) }}
                    className="btn-primary btn-sm"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add product
                  </button>
                </div>
              </div>

              <div className="card p-0 overflow-hidden">
                {!selectedCategory.master_products?.length ? (
                  <EmptyState
                    icon={Package}
                    title="No products yet"
                    description="Add the first product to this category."
                    action={{
                      label: 'Add product',
                      onClick: () => { setProductForm({ name: '', brand: '', image_url: '', variants: [{ ...EMPTY_MASTER_VARIANT }] }); setShowAddProduct(true) },
                    }}
                  />
                ) : (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Brand</th>
                        <th>Unit</th>
                        <th>Base Price</th>
                        <th>Status</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {selectedCategory.master_products.map((product) => (
                        <tr key={product.id}>
                          <td>
                            <div className="flex items-center gap-2.5">
                              <Thumb src={product.image_url} alt={product.name} size={30} />
                              <span className="text-ink font-medium">{product.name}</span>
                            </div>
                          </td>
                          <td>{product.brand ?? <span className="text-ink-faint">—</span>}</td>
                          <td>{product.unit}</td>
                          <td>{product.base_price ? `₹${product.base_price}` : <span className="text-ink-faint">—</span>}</td>
                          <td>
                            <button
                              onClick={() => toggleProductActive(product)}
                              className={clsx('status-badge border text-xs', product.is_active ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-ink-muted bg-surface border-surface-border')}
                              style={{ cursor: 'pointer' }}
                            >
                              {product.is_active ? 'Active' : 'Inactive'}
                            </button>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              onClick={() => { setProductForm({ name: product.name, brand: product.brand ?? '', image_url: product.image_url ?? '', variants: [{ unit: product.unit, base_price: product.base_price?.toString() ?? '' }] }); setEditingProduct(product) }}
                              className="btn-ghost btn-sm"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Enable for Shops — multi-select + bulk toggle ───────────────── */}
      {activeTab === 'enable' && (
        <div className="grid gap-4" style={{ gridTemplateColumns: '280px 1fr', alignItems: 'start' }}>
          <div className="card p-0 overflow-hidden" style={{ display: 'flex', flexDirection: 'column', maxHeight: 640 }}>
            <div style={{ padding: 12, borderBottom: '1px solid var(--surface-border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint" />
                <input value={shopSearch} onChange={(e) => setShopSearch(e.target.value)} placeholder="Search shops…" className="input pl-9" />
              </div>
              <div className="flex items-center justify-between text-xs text-ink-muted">
                <span>{selectedShopIds.size} selected</span>
                <div className="flex gap-2">
                  <button className="text-[var(--brand-dark)] hover:underline" onClick={() => setSelectedShopIds(new Set(filteredShopsForEnable.map((s) => s.id)))}>All</button>
                  <button className="text-[var(--brand-dark)] hover:underline" onClick={() => setSelectedShopIds(new Set())}>None</button>
                </div>
              </div>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {filteredShopsForEnable.map((shop) => (
                <label key={shop.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderBottom: '1px solid var(--surface)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={selectedShopIds.has(shop.id)} onChange={() => toggleShopSelection(shop.id)} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "var(--text-base)", color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {shop.name}{!shop.is_active && <span style={{ color: 'var(--ink-faint)' }}> (inactive)</span>}
                    </div>
                    {shop.city && <div style={{ fontSize: "var(--text-xs)", color: 'var(--ink-faint)' }}>{shop.city}</div>}
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm text-ink-muted">
              {selectedShopIds.size === 0
                ? 'Select one or more shops on the left, then enable/disable categories for all of them at once.'
                : `Changes below apply to ${selectedShopIds.size} selected shop${selectedShopIds.size > 1 ? 's' : ''}.`}
            </p>
            {categories.map((cat) => {
              const coverage = enabledShopCount(cat.id)
              const busy = bulkBusyCategoryId === cat.id
              const expanded = expandedCategoryIds.has(cat.id)
              const products = cat.master_products ?? []
              return (
                <div key={cat.id} className="card" style={{ padding: 0 }}>
                  <div className="flex items-center justify-between" style={{ padding: 16 }}>
                    <button
                      type="button"
                      onClick={() => products.length > 0 && toggleCategoryExpanded(cat.id)}
                      className="flex items-center gap-3 text-left"
                      style={{ background: 'none', border: 'none', cursor: products.length > 0 ? 'pointer' : 'default', padding: 0 }}
                    >
                      {products.length > 0 && (
                        <ChevronRight className="w-4 h-4 text-ink-faint" style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }} />
                      )}
                      <Thumb src={cat.image_url} alt={cat.name} size={34} />
                      <div>
                        <p className="font-medium text-ink text-sm">{cat.name}</p>
                        <p className="text-xs text-ink-muted">{products.length} products · enabled in {coverage} of {shops.length} shops</p>
                      </div>
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        disabled={busy || selectedShopIds.size === 0}
                        onClick={() => bulkToggleCategory(cat.id, true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-40"
                        style={{ color: 'var(--brand-dark)', background: 'rgba(0,104,95,0.1)' }}
                      >
                        <Check className="w-3.5 h-3.5" /> Enable all
                      </button>
                      <button
                        disabled={busy || selectedShopIds.size === 0}
                        onClick={() => bulkToggleCategory(cat.id, false)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-40"
                        style={{ color: 'var(--error)', background: 'rgba(186,26,26,0.08)' }}
                      >
                        <X className="w-3.5 h-3.5" /> Disable all
                      </button>
                    </div>
                  </div>

                  {expanded && products.length > 0 && (
                    <div style={{ borderTop: '1px solid var(--surface-border)' }}>
                      {products.map((product) => {
                        const productCoverage = enabledProductShopCount(product.id)
                        const productBusy = bulkBusyProductId === product.id
                        return (
                          <div
                            key={product.id}
                            className="flex items-center justify-between"
                            style={{ padding: '10px 16px 10px 44px', borderTop: '1px solid var(--surface)' }}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Thumb src={product.image_url} alt={product.name} size={26} />
                              <div className="min-w-0">
                                <p className="text-ink text-sm truncate">{product.name} <span className="text-ink-faint">· {product.unit}</span></p>
                                <p className="text-xs text-ink-muted">enabled for {productCoverage} of {shops.length} shops</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <button
                                disabled={productBusy || selectedShopIds.size === 0}
                                onClick={() => bulkToggleProduct(product.id, cat.id, true)}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium disabled:opacity-40"
                                style={{ color: 'var(--brand-dark)', background: 'rgba(0,104,95,0.1)' }}
                              >
                                <Check className="w-3 h-3" /> Enable
                              </button>
                              <button
                                disabled={productBusy || selectedShopIds.size === 0}
                                onClick={() => bulkToggleProduct(product.id, cat.id, false)}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium disabled:opacity-40"
                                style={{ color: 'var(--error)', background: 'rgba(186,26,26,0.08)' }}
                              >
                                <X className="w-3 h-3" /> Disable
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Tab: Product Requests ────────────────────────────────────────────── */}
      {activeTab === 'requests' && (
        <div className="space-y-3">
          {requestShopOptions.length > 1 && (
            <select value={requestShopFilter} onChange={(e) => setRequestShopFilter(e.target.value)} className="input" style={{ maxWidth: 260 }}>
              <option value="all">All shops</option>
              {requestShopOptions.map(([shopId, name]) => (
                <option key={shopId} value={shopId}>{name}</option>
              ))}
            </select>
          )}
          {filteredRequests.length === 0 ? (
            <div className="card text-center py-12 text-ink-muted">
              No pending product requests. Shopkeepers can request products from their dashboard.
            </div>
          ) : filteredRequests.map((req) => (
            <div key={req.id} className="card">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-semibold text-ink">{req.name}</p>
                    {req.brand && <span className="text-xs text-ink-muted">{req.brand}</span>}
                    <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--surface)', color: 'var(--ink-muted)' }}>{req.unit}</span>
                  </div>
                  <p className="text-xs text-ink-muted">
                    From: <span className="text-ink">{req.shops?.name}</span>
                    {req.suggested_price && <> · Suggested ₹{req.suggested_price}</>}
                    {req.reason && <> · &quot;{req.reason}&quot;</>}
                  </p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => handleRequest(req, 'approved_global')} className="btn-secondary text-xs flex items-center gap-1" title="Add to master catalog (available to all shops)" aria-label="Add to master catalog (available to all shops)">
                    <Package className="w-3 h-3" /> Add to Master
                  </button>
                  <button onClick={() => handleRequest(req, 'approved_local')} className="btn-secondary text-xs flex items-center gap-1" title="Approve only for this shop" aria-label="Approve only for this shop">
                    <Store className="w-3 h-3" /> Shop Only
                  </button>
                  <button onClick={() => handleRequest(req, 'rejected')} className="btn-ghost text-xs flex items-center gap-1" style={{ color: 'var(--error)' }}>
                    <X className="w-3 h-3" /> Reject
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Add/Edit Category Modal ───────────────────────────────────────────── */}
      {(showAddCategory || editingCategory) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => { setShowAddCategory(false); setEditingCategory(null) }} />
          <div className="relative rounded-2xl w-full max-w-sm shadow-2xl" style={{ background: '#FFFFFF', border: '1px solid var(--surface-border)' }}>
            <div className="p-6">
              <h2 className="font-display font-bold text-ink text-lg mb-5">{editingCategory ? 'Edit Category' : 'Add Category'}</h2>
              <form onSubmit={editingCategory ? handleEditCategory : handleAddCategory} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-ink-muted mb-1.5">Category name *</label>
                  <input
                    value={categoryForm.name}
                    onChange={(e) => {
                      const name = e.target.value
                      const slug = editingCategory ? categoryForm.slug : name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
                      setCategoryForm((f) => ({ ...f, name, slug }))
                    }}
                    placeholder="Dairy & Eggs" required className="input"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink-muted mb-1.5">Slug *</label>
                  <input value={categoryForm.slug} onChange={(e) => setCategoryForm((f) => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))} placeholder="dairy" required className="input" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink-muted mb-1.5">Image URL (optional)</label>
                  <input value={categoryForm.image_url} onChange={(e) => setCategoryForm((f) => ({ ...f, image_url: e.target.value }))} placeholder="https://…" className="input" />
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => { setShowAddCategory(false); setEditingCategory(null) }} className="btn-secondary flex-1 justify-center">Cancel</button>
                  <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">{saving ? 'Saving…' : editingCategory ? 'Save' : 'Create'}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ── Add/Edit Product Modal ───────────────────────────────────────────── */}
      {(showAddProduct || editingProduct) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => { setShowAddProduct(false); setEditingProduct(null) }} />
          <div className="relative rounded-2xl w-full max-w-md shadow-2xl" style={{ background: '#FFFFFF', border: '1px solid var(--surface-border)' }}>
            <div className="p-6">
              <h2 className="font-display font-bold text-ink text-lg mb-1">{editingProduct ? 'Edit Product' : 'Add Master Product'}</h2>
              <p className="text-ink-muted text-sm mb-5">
                {editingProduct ? 'Editing' : 'Adding to'}: <span className="text-ink">{editingProduct ? categories.find((c) => c.id === editingProduct.master_category_id)?.name : selectedCategory?.name}</span>
              </p>
              <form onSubmit={editingProduct ? handleEditProduct : handleAddProduct} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-ink-muted mb-1.5">Product name *</label>
                  <input value={productForm.name} onChange={(e) => setProductForm((f) => ({ ...f, name: e.target.value }))} placeholder="Amul Butter" required className="input" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink-muted mb-1.5">Brand</label>
                  <input value={productForm.brand} onChange={(e) => setProductForm((f) => ({ ...f, brand: e.target.value }))} placeholder="Amul" className="input" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink-muted mb-1.5">Image URL (optional)</label>
                  <input value={productForm.image_url} onChange={(e) => setProductForm((f) => ({ ...f, image_url: e.target.value }))} placeholder="https://…" className="input" />
                </div>

                <div style={{ borderTop: '1px solid var(--surface-border)', paddingTop: 12 }}>
                  <label className="block text-xs font-medium text-ink-muted mb-1.5">
                    {productForm.variants.length > 1 ? 'Variants' : 'Unit & base price'}
                  </label>
                  {!editingProduct && (
                    <p className="text-xs text-ink-faint mb-2">Add another unit to sell this in multiple sizes — each becomes its own entry, grouped by name.</p>
                  )}
                  <div className="space-y-2">
                    {productForm.variants.map((v, i) => (
                      <div key={i} className="grid gap-2" style={{ gridTemplateColumns: editingProduct ? '1fr 1fr' : '1fr 1fr auto' }}>
                        <input
                          value={v.unit}
                          onChange={(e) => updateProductVariant(i, 'unit', e.target.value)}
                          placeholder="100g / 1L / piece"
                          required
                          className="input"
                        />
                        <input
                          type="number"
                          value={v.base_price}
                          onChange={(e) => updateProductVariant(i, 'base_price', e.target.value)}
                          placeholder="Base price ₹"
                          className="input"
                        />
                        {!editingProduct && productForm.variants.length > 1 && (
                          <button type="button" onClick={() => removeProductVariantRow(i)} className="btn-ghost btn-sm" aria-label={`Remove ${v.unit || 'variant'}`}>
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {!editingProduct && (
                    <button type="button" onClick={addProductVariantRow} className="text-xs font-semibold mt-2" style={{ color: 'var(--brand-dark)' }}>
                      + Add another unit
                    </button>
                  )}
                  <p className="text-xs text-ink-faint mt-2">Shopkeepers can override this price</p>
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => { setShowAddProduct(false); setEditingProduct(null) }} className="btn-secondary flex-1 justify-center">Cancel</button>
                  <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">
                    {saving ? 'Saving…' : editingProduct ? 'Save' : productForm.variants.length > 1 ? `Add — ${productForm.variants.length} sizes` : 'Add Product'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ── Approve Request → Master Catalog Modal ───────────────────────────── */}
      {showApproveGlobal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => { setShowApproveGlobal(null); setApproveCategoryId('') }} />
          <div className="relative rounded-2xl w-full max-w-sm shadow-2xl" style={{ background: '#FFFFFF', border: '1px solid var(--surface-border)' }}>
            <div className="p-6">
              <h2 className="font-display font-bold text-ink text-lg mb-1">Add to Master Catalog</h2>
              <p className="text-ink-muted text-sm mb-5">
                Adding <span className="text-ink">{showApproveGlobal.name}</span> — pick which category it belongs to.
              </p>
              <form onSubmit={(e) => { e.preventDefault(); if (approveCategoryId) handleRequest(showApproveGlobal, 'approved_global', approveCategoryId) }} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-ink-muted mb-1.5">Master category *</label>
                  <select value={approveCategoryId} onChange={(e) => setApproveCategoryId(e.target.value)} required className="input">
                    <option value="">Choose a category...</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => { setShowApproveGlobal(null); setApproveCategoryId('') }} className="btn-secondary flex-1 justify-center">Cancel</button>
                  <button type="submit" disabled={!approveCategoryId} className="btn-primary flex-1 justify-center">Add Product</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl px-4 py-3 shadow-xl text-sm text-ink flex items-center gap-2" style={{ background: '#FFFFFF', border: '1px solid var(--surface-border)' }}>
          <Check className="w-4 h-4" style={{ color: 'var(--brand-dark)' }} />
          {toast}
        </div>
      )}
    </div>
  )
}
