'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Minus, ShoppingBag, Loader2, CheckCircle2 } from 'lucide-react'
import { CartView } from './CartView'
import { CheckoutView } from './CheckoutView'
import type { CartItem, StorefrontProduct, StorefrontCategory, StorefrontSettings } from '@/lib/storefront/types'

type Shop = {
  id: string
  slug: string
  name: string
  description: string | null
  logo_url: string | null
  city: string | null
  state: string | null
  address_line_1: string | null
  currency_code: string
  timezone: string
}

type Props = {
  shop: Shop
  settings: StorefrontSettings
  token: string | null
}

// Deliberately doesn't distinguish "no token" from "token was invalid" in
// the UI beyond one line of copy — both land the customer in the same
// browse-only mode. The two ARE tracked separately in state (`none` vs
// `invalid`) since they inform slightly different messaging.
type SessionState =
  | { status: 'loading' }
  | { status: 'none' }
  | { status: 'invalid' }
  | { status: 'active'; customerPhone: string }

export function StorefrontApp({ shop, settings, token }: Props) {
  const [session, setSession] = useState<SessionState>(token ? { status: 'loading' } : { status: 'none' })
  const [categories, setCategories] = useState<StorefrontCategory[]>([])
  const [products, setProducts] = useState<StorefrontProduct[]>([])
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null)
  const [cart, setCart] = useState<Record<string, CartItem>>({})
  const [view, setView] = useState<'browse' | 'cart' | 'checkout' | 'placed'>('browse')
  const [placedOrderNumber, setPlacedOrderNumber] = useState<string | null>(null)
  const hydratedCartFromSession = useRef(false)

  const formatMoney = useCallback(
    (amount: number) =>
      new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: shop.currency_code || 'INR',
        maximumFractionDigits: 0,
      }).format(amount),
    [shop.currency_code]
  )

  // Catalog is browsable regardless of session validity — only cart
  // persistence and (eventually) checkout require a real session.
  useEffect(() => {
    let cancelled = false

    async function loadCatalog() {
      try {
        const [catRes, prodRes] = await Promise.all([
          fetch(`/api/public/shop/${shop.slug}/categories`),
          fetch(`/api/public/shop/${shop.slug}/products`),
        ])
        const catJson = await catRes.json()
        const prodJson = await prodRes.json()
        if (cancelled) return
        setCategories(catRes.ok ? catJson.categories : [])
        setProducts(prodRes.ok ? prodJson.products : [])
      } catch (err) {
        console.error('Failed to load catalog', err)
      } finally {
        if (!cancelled) setCatalogLoading(false)
      }
    }

    loadCatalog()
    return () => {
      cancelled = true
    }
  }, [shop.slug])

  useEffect(() => {
    if (!token) return
    let cancelled = false

    async function loadSession() {
      try {
        const res = await fetch(`/api/public/session/${token}`)
        if (cancelled) return
        if (!res.ok) {
          setSession({ status: 'invalid' })
          return
        }
        const data = await res.json()
        setSession({ status: 'active', customerPhone: data.customerPhone })

        // Only ever hydrate the in-progress cart from the session once —
        // after that, local edits are the source of truth and get pushed
        // out via the persist effect below, not pulled back in.
        if (!hydratedCartFromSession.current && data.cartSnapshot?.items?.length) {
          hydratedCartFromSession.current = true
          const map: Record<string, CartItem> = {}
          for (const item of data.cartSnapshot.items as CartItem[]) map[item.product_id] = item
          setCart(map)
        }
      } catch (err) {
        console.error('Failed to resolve session', err)
        if (!cancelled) setSession({ status: 'invalid' })
      }
    }

    loadSession()
    return () => {
      cancelled = true
    }
  }, [token])

  const cartItems = useMemo(() => Object.values(cart), [cart])
  const cartCount = useMemo(() => cartItems.reduce((sum, i) => sum + i.quantity, 0), [cartItems])
  const cartTotal = useMemo(() => cartItems.reduce((sum, i) => sum + i.subtotal, 0), [cartItems])

  // Debounced so rapid +/- taps don't fire a request per tap — only
  // meaningful once a session actually resolved, since there's nowhere
  // to save a cart against a token that was never valid.
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (session.status !== 'active' || !token) return
    if (persistTimer.current) clearTimeout(persistTimer.current)
    persistTimer.current = setTimeout(() => {
      fetch(`/api/public/session/${token}/cart`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: cartItems, total: cartTotal }),
      }).catch((err) => console.error('Failed to save cart', err))
    }, 600)
    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current)
    }
    // cartItems/cartTotal are derived from `cart` every render — depending
    // on `cart` directly is what actually matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, session.status, token])

  function setQuantity(product: StorefrontProduct, quantity: number) {
    setCart((prev) => {
      const next = { ...prev }
      if (quantity <= 0) {
        delete next[product.id]
      } else {
        next[product.id] = {
          product_id: product.id,
          name: product.name,
          unit: product.unit,
          unit_price: product.price,
          quantity,
          subtotal: product.price * quantity,
        }
      }
      return next
    })
  }

  function setLineQuantity(productId: string, quantity: number) {
    setCart((prev) => {
      const existing = prev[productId]
      if (!existing) return prev
      const next = { ...prev }
      if (quantity <= 0) {
        delete next[productId]
      } else {
        next[productId] = { ...existing, quantity, subtotal: existing.unit_price * quantity }
      }
      return next
    })
  }

  const visibleProducts = activeCategoryId ? products.filter((p) => p.category_id === activeCategoryId) : products

  if (view === 'cart') {
    return (
      <CartView
        items={cartItems}
        total={cartTotal}
        formatMoney={formatMoney}
        onBack={() => setView('browse')}
        onQuantityChange={setLineQuantity}
        canCheckout={session.status === 'active'}
        onCheckout={() => setView('checkout')}
      />
    )
  }

  if (view === 'checkout' && token) {
    return (
      <CheckoutView
        token={token}
        timezone={shop.timezone}
        settings={settings}
        total={cartTotal}
        formatMoney={formatMoney}
        onBack={() => setView('cart')}
        onPlaced={(orderNumber) => {
          setPlacedOrderNumber(orderNumber)
          setCart({})
          setView('placed')
        }}
      />
    )
  }

  if (view === 'placed') {
    return (
      <main className="min-h-screen bg-surface flex items-center justify-center px-6">
        <div className="card max-w-sm w-full text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-light">
            <CheckCircle2 size={28} className="text-brand-dark" />
          </div>
          <h2 className="text-lg font-semibold text-ink">Order {placedOrderNumber} placed!</h2>
          <p className="mt-2 text-sm text-ink-muted">
            We&apos;ve sent you a WhatsApp message with the details. The shop will confirm shortly.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-surface pb-24">
      <header className="bg-surface-card border-b border-surface-border px-4 pt-6 pb-4">
        <div className="mx-auto max-w-2xl flex items-center gap-4">
          {shop.logo_url ? (
            <img src={shop.logo_url} alt={`${shop.name} logo`} className="h-14 w-14 rounded-xl object-cover" />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-brand text-xl font-bold text-white">
              {shop.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-ink truncate">{shop.name}</h1>
            {(shop.city || shop.state) && (
              <p className="text-xs text-ink-muted truncate">{[shop.city, shop.state].filter(Boolean).join(', ')}</p>
            )}
          </div>
        </div>

        {settings && (
          <div className="mx-auto max-w-2xl mt-3 flex flex-wrap gap-2 text-xs">
            {settings.allow_pickup && <span className="status-badge bg-brand-light text-brand-dark">Pickup available</span>}
            {settings.allow_delivery && (
              <span className="status-badge bg-brand-light text-brand-dark">
                Delivery{settings.delivery_radius_km ? ` within ${settings.delivery_radius_km}km` : ''}
              </span>
            )}
            {!settings.order_acceptance_enabled && (
              <span className="status-badge bg-red-50 text-red-600">Not accepting orders right now</span>
            )}
          </div>
        )}

        {session.status === 'invalid' && (
          <p className="mx-auto max-w-2xl mt-3 text-xs text-ink-muted">
            This link has expired — message the shop on WhatsApp for a fresh one. You can still browse below.
          </p>
        )}
      </header>

      {categories.length > 0 && (
        <div className="sticky top-0 z-10 bg-surface overflow-x-auto px-4 py-3 flex gap-2">
          <button
            className={activeCategoryId === null ? 'btn text-white bg-brand flex-shrink-0' : 'btn-secondary flex-shrink-0'}
            onClick={() => setActiveCategoryId(null)}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              className={activeCategoryId === c.id ? 'btn text-white bg-brand flex-shrink-0' : 'btn-secondary flex-shrink-0'}
              onClick={() => setActiveCategoryId(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      <div className="mx-auto max-w-2xl px-4 grid grid-cols-2 gap-3 mt-2">
        {catalogLoading ? (
          <div className="col-span-2 flex justify-center py-12">
            <Loader2 className="animate-spin text-ink-faint" size={28} />
          </div>
        ) : visibleProducts.length === 0 ? (
          <p className="col-span-2 text-center py-12 text-sm text-ink-muted">Nothing here yet.</p>
        ) : (
          visibleProducts.map((product) => {
            const inCart = cart[product.id]
            return (
              <div key={product.id} className="card flex flex-col">
                {product.image_url ? (
                  <img src={product.image_url} alt={product.name} className="h-24 w-full rounded-lg object-cover mb-2" />
                ) : (
                  <div className="h-24 w-full rounded-lg mb-2 flex items-center justify-center bg-surface-hover">
                    <span className="text-2xl font-bold text-ink-faint">{product.name.charAt(0).toUpperCase()}</span>
                  </div>
                )}
                <h3 className="text-sm font-medium leading-tight text-ink">{product.name}</h3>
                <p className="text-xs mt-0.5 text-ink-muted">{product.unit}</p>
                <div className="mt-auto pt-2 flex items-center justify-between">
                  <span className="text-sm font-semibold text-ink">{formatMoney(product.price)}</span>
                  {inCart ? (
                    <div className="flex items-center gap-1.5 rounded-lg px-1 py-1 bg-brand">
                      <button className="text-white p-1" onClick={() => setQuantity(product, inCart.quantity - 1)} aria-label="Decrease quantity">
                        <Minus size={14} />
                      </button>
                      <span className="text-white text-sm font-medium w-4 text-center">{inCart.quantity}</span>
                      <button className="text-white p-1" onClick={() => setQuantity(product, inCart.quantity + 1)} aria-label="Increase quantity">
                        <Plus size={14} />
                      </button>
                    </div>
                  ) : (
                    <button
                      className="rounded-lg px-2.5 py-1.5 text-white bg-brand"
                      onClick={() => setQuantity(product, 1)}
                      aria-label={`Add ${product.name}`}
                    >
                      <Plus size={16} />
                    </button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {cartCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-surface-card border-t border-surface-border px-4 py-3">
          <button className="btn-primary w-full justify-between mx-auto max-w-2xl flex" onClick={() => setView('cart')}>
            <span className="flex items-center gap-2">
              <ShoppingBag size={18} /> {cartCount} item{cartCount > 1 ? 's' : ''}
            </span>
            <span>{formatMoney(cartTotal)} · View cart</span>
          </button>
        </div>
      )}
    </main>
  )
}
