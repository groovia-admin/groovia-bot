'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Minus, ShoppingBag, Loader2, CheckCircle2, Search, X } from 'lucide-react'
import { CheckoutView } from './CheckoutView'
import CartLoader from '@/components/ui/CartLoader'
import ProductImage from './ProductImage'
import type {
  CartItem,
  StorefrontProduct,
  StorefrontProductGroup,
  StorefrontCategory,
  StorefrontSettings,
  CheckoutFormState,
} from '@/lib/storefront/types'

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
  whatsappNumber: string | null
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

const DEFAULT_CHECKOUT_FORM: CheckoutFormState = {
  orderType: 'pickup',
  customerName: '',
  pickupSlotId: null,
  addressLine1: '',
  addressLine2: '',
  landmark: '',
  city: '',
  postalCode: '',
  paymentMethod: '',
}

export function StorefrontApp({ shop, settings, token, whatsappNumber }: Props) {
  const [session, setSession] = useState<SessionState>(token ? { status: 'loading' } : { status: 'none' })
  const [categories, setCategories] = useState<StorefrontCategory[]>([])
  const [products, setProducts] = useState<StorefrontProduct[]>([])
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [cart, setCart] = useState<Record<string, CartItem>>({})
  const [view, setView] = useState<'browse' | 'checkout' | 'placed'>('browse')
  const [variantPicker, setVariantPicker] = useState<StorefrontProductGroup | null>(null)
  const [pickedVariantId, setPickedVariantId] = useState<string | null>(null)
  const [placedOrderNumber, setPlacedOrderNumber] = useState<string | null>(null)
  // Lifted up here (not local to CheckoutView) so it survives the
  // customer navigating back to browse for a forgotten item and
  // returning to checkout — this component doesn't unmount between
  // those view switches, only its children do.
  const [checkoutForm, setCheckoutForm] = useState<CheckoutFormState>({
    ...DEFAULT_CHECKOUT_FORM,
    orderType: settings?.allow_pickup === false && settings?.allow_delivery ? 'delivery' : 'pickup',
  })
  const hydratedCartFromSession = useRef(false)
  const hydratedNameFromSession = useRef(false)
  const hydratedAddressFromSession = useRef(false)

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

        // Pre-fill the checkout name field from the customer's WhatsApp
        // profile name (captured when the session was created) — same
        // once-only hydration pattern as the cart above, so it never
        // overwrites something the customer already typed/edited.
        if (!hydratedNameFromSession.current && data.customerName) {
          hydratedNameFromSession.current = true
          setCheckoutForm((prev) => (prev.customerName ? prev : { ...prev, customerName: data.customerName }))
        }

        // Pre-fill delivery address from the customer's last saved one —
        // without this, a returning customer had to retype their full
        // address on every single order. Same once-only pattern, and
        // only fills fields still at their default (empty) value, so it
        // can never clobber anything already typed this session.
        if (!hydratedAddressFromSession.current && data.deliveryAddress) {
          hydratedAddressFromSession.current = true
          const addr = data.deliveryAddress as {
            address_line_1: string
            address_line_2: string | null
            landmark: string | null
            city: string | null
            postal_code: string | null
          }
          setCheckoutForm((prev) =>
            prev.addressLine1
              ? prev
              : {
                  ...prev,
                  addressLine1: addr.address_line_1 || '',
                  addressLine2: addr.address_line_2 || '',
                  landmark: addr.landmark || '',
                  city: addr.city || '',
                  postalCode: addr.postal_code || '',
                }
          )
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

  const waLink = useMemo(() => {
    if (!whatsappNumber) return null
    const digits = whatsappNumber.replace(/\D/g, '')
    return digits ? `https://wa.me/${digits}` : null
  }, [whatsappNumber])

  // This webview only ever exists as a WhatsApp in-app-browser tab —
  // there's nothing else for the customer to do here once an order is
  // placed, so it hands control back to the chat on its own rather than
  // leaving them stuck looking at a static confirmation screen.
  // window.close() alone isn't reliable across WhatsApp's in-app browser
  // implementations (browsers generally only honor it on a window that
  // was itself opened via window.open(), which this tab wasn't) —
  // navigating to a wa.me link is what actually gets recognized and
  // handed back to the WhatsApp app.
  const [showManualReturn, setShowManualReturn] = useState(false)
  useEffect(() => {
    if (view !== 'placed' || !waLink) return
    const redirectTimer = setTimeout(() => {
      window.location.href = waLink
    }, 2500)
    // Only reveal the manual fallback link well after the auto-redirect
    // should already have fired — showing it immediately alongside
    // "Returning you to WhatsApp…" reads as if the automatic part isn't
    // trusted to work at all.
    const fallbackTimer = setTimeout(() => setShowManualReturn(true), 5000)
    return () => {
      clearTimeout(redirectTimer)
      clearTimeout(fallbackTimer)
    }
  }, [view, waLink])

  // Never lets the cart hold more than what's actually on the shelf —
  // reported as a real gap: a customer could previously order past a
  // product's stock_quantity entirely, since nothing anywhere checked
  // it. Clamped here for immediate feedback; order submission
  // re-validates the same limit server-side (stock can still change
  // between browsing and checkout), so this client-side cap is a UX
  // nicety, not the actual enforcement.
  function setQuantity(product: StorefrontProduct, quantity: number) {
    const clamped = Math.min(quantity, product.stock_quantity)
    setCart((prev) => {
      const next = { ...prev }
      if (clamped <= 0) {
        delete next[product.id]
      } else {
        next[product.id] = {
          product_id: product.id,
          name: product.name,
          unit: product.unit,
          unit_price: product.price,
          quantity: clamped,
          subtotal: product.price * clamped,
        }
      }
      return next
    })
  }

  const stockByProductId = useMemo(
    () => Object.fromEntries(products.map((p) => [p.id, p.stock_quantity])),
    [products]
  )

  function setLineQuantity(productId: string, quantity: number) {
    const stock = stockByProductId[productId]
    const clamped = stock != null ? Math.min(quantity, stock) : quantity
    setCart((prev) => {
      const existing = prev[productId]
      if (!existing) return prev
      const next = { ...prev }
      if (clamped <= 0) {
        delete next[productId]
      } else {
        next[productId] = { ...existing, quantity: clamped, subtotal: existing.unit_price * clamped }
      }
      return next
    })
  }

  const visibleProducts = products
    .filter((p) => !activeCategoryId || p.category_id === activeCategoryId)
    .filter((p) => !searchQuery.trim() || p.name.toLowerCase().includes(searchQuery.trim().toLowerCase()))

  // Products sharing the same name become one card with a size picker —
  // the same grouping the dashboard's Add Product "variants" rows create
  // (same name, different unit). A name with only one product still gets
  // a group of length 1, so the card below can render both cases the same
  // way. Not memoized, matching visibleProducts above — cheap at this
  // catalog scale.
  const visibleGroups: StorefrontProductGroup[] = []
  const groupIndexByKey = new Map<string, number>()
  for (const p of visibleProducts) {
    const key = p.name.trim().toLowerCase()
    const idx = groupIndexByKey.get(key)
    if (idx !== undefined) {
      visibleGroups[idx].variants.push(p)
    } else {
      groupIndexByKey.set(key, visibleGroups.length)
      visibleGroups.push({ key, name: p.name, description: p.description, image_url: p.image_url, variants: [p] })
    }
  }
  for (const group of visibleGroups) {
    group.variants.sort((a, b) => a.price - b.price)
  }

  function openVariantPicker(group: StorefrontProductGroup) {
    const inCartVariant = group.variants.find((v) => cart[v.id])
    const firstInStock = group.variants.find((v) => v.stock_quantity > 0)
    setPickedVariantId((inCartVariant ?? firstInStock ?? group.variants[0]).id)
    setVariantPicker(group)
  }

  function confirmVariantPick() {
    if (!variantPicker || !pickedVariantId) return
    const variant = variantPicker.variants.find((v) => v.id === pickedVariantId)
    if (!variant) return
    const existingQty = cart[variant.id]?.quantity ?? 0
    setQuantity(variant, existingQty + 1)
    setVariantPicker(null)
  }

  if (view === 'checkout' && token) {
    return (
      <CheckoutView
        token={token}
        timezone={shop.timezone}
        settings={settings}
        items={cartItems}
        total={cartTotal}
        formatMoney={formatMoney}
        form={checkoutForm}
        onFormChange={setCheckoutForm}
        onQuantityChange={setLineQuantity}
        stockByProductId={stockByProductId}
        canCheckout={session.status === 'active'}
        onBack={() => setView('browse')}
        onAddItems={() => setView('browse')}
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
          {waLink ? (
            <p className="mt-4 flex items-center justify-center gap-2 text-sm text-ink-muted">
              <Loader2 size={14} className="animate-spin" /> Returning you to WhatsApp…
            </p>
          ) : (
            <p className="mt-4 text-xs text-ink-faint">You can close this window now.</p>
          )}
          {showManualReturn && waLink && (
            <a href={waLink} className="btn-secondary mt-3 w-full justify-center">
              Tap here if you weren&apos;t redirected
            </a>
          )}
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

      <div className="sticky top-0 z-10 bg-surface">
        <div className="px-4 pt-3">
          <div className="mx-auto max-w-2xl relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
            <input
              className="input pl-9 pr-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products…"
              aria-label="Search products"
            />
            {searchQuery && (
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        {categories.length > 0 && (
          <div className="overflow-x-auto px-4 py-3 flex gap-2">
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
      </div>

      <div className="mx-auto max-w-2xl px-4 grid grid-cols-2 gap-3 mt-2">
        {catalogLoading ? (
          <div className="col-span-2">
            <CartLoader label="Loading the shop…" size="inline" />
          </div>
        ) : visibleGroups.length === 0 ? (
          <p className="col-span-2 text-center py-12 text-sm text-ink-muted">
            {searchQuery ? `No products match "${searchQuery}".` : 'Nothing here yet.'}
          </p>
        ) : (
          visibleGroups.map((group) => {
            // Single-unit product — unchanged from before.
            if (group.variants.length === 1) {
              const product = group.variants[0]
              const inCart = cart[product.id]
              return (
                <div key={group.key} className="card flex flex-col">
                  <ProductImage src={product.image_url} alt={product.name} />
                  <h3 className="text-sm font-medium leading-tight text-ink">{product.name}</h3>
                  <p className="text-xs mt-0.5 text-ink-muted">{product.unit}</p>
                  <div className="mt-auto pt-2 flex items-center justify-between">
                    <span className="text-sm font-semibold text-ink">{formatMoney(product.price)}</span>
                    {product.stock_quantity <= 0 ? (
                      <span className="text-xs font-medium text-ink-faint">Out of stock</span>
                    ) : inCart ? (
                      <div className="flex items-center gap-1.5 rounded-lg px-1 py-1 bg-brand">
                        <button className="text-white p-1" onClick={() => setQuantity(product, inCart.quantity - 1)} aria-label="Decrease quantity">
                          <Minus size={14} />
                        </button>
                        <span className="text-white text-sm font-medium w-4 text-center">{inCart.quantity}</span>
                        <button
                          className="text-white p-1 disabled:opacity-40"
                          onClick={() => setQuantity(product, inCart.quantity + 1)}
                          aria-label="Increase quantity"
                          disabled={inCart.quantity >= product.stock_quantity}
                        >
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
                  {inCart && inCart.quantity >= product.stock_quantity && (
                    <p className="text-[11px] text-ink-faint mt-1">Only {product.stock_quantity} left</p>
                  )}
                </div>
              )
            }

            // Multiple units under one name — a size picker instead of a
            // direct add, since tapping "+" here wouldn't know which unit
            // the customer means.
            const cheapest = group.variants[0]
            const cartQty = group.variants.reduce((sum, v) => sum + (cart[v.id]?.quantity ?? 0), 0)
            const anyInStock = group.variants.some((v) => v.stock_quantity > 0)
            return (
              <button
                key={group.key}
                type="button"
                className="card flex flex-col text-left"
                onClick={() => anyInStock && openVariantPicker(group)}
                disabled={!anyInStock}
              >
                <ProductImage src={group.image_url} alt={group.name} />
                <h3 className="text-sm font-medium leading-tight text-ink">{group.name}</h3>
                <p className="text-xs mt-0.5 text-ink-muted">{group.variants.length} sizes available</p>
                <div className="mt-auto pt-2 flex items-center justify-between">
                  <span className="text-sm font-semibold text-ink">
                    {anyInStock ? `From ${formatMoney(cheapest.price)}` : 'Out of stock'}
                  </span>
                  {anyInStock && (
                    <span className="text-xs font-semibold text-brand-dark flex items-center gap-1">
                      {cartQty > 0 ? `${cartQty} in cart` : 'Choose size'} ›
                    </span>
                  )}
                </div>
              </button>
            )
          })
        )}
      </div>

      {cartCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-surface-card border-t border-surface-border px-4 py-3">
          <button className="btn-primary w-full justify-between mx-auto max-w-2xl flex" onClick={() => setView('checkout')}>
            <span className="flex items-center gap-2">
              <ShoppingBag size={18} /> {cartCount} item{cartCount > 1 ? 's' : ''}
            </span>
            <span>View order · {formatMoney(cartTotal)}</span>
          </button>
        </div>
      )}

      {variantPicker && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-label={`Choose a size for ${variantPicker.name}`}>
          <div className="absolute inset-0 bg-ink/40" onClick={() => setVariantPicker(null)} />
          <div className="relative w-full max-w-2xl bg-surface-card rounded-t-2xl px-4 pt-3 pb-5 max-h-[80vh] overflow-y-auto">
            <div className="w-9 h-1 rounded-full bg-surface-border mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-ink">{variantPicker.name}</h3>
            <p className="text-xs text-ink-muted mb-2">Choose a size to add to cart</p>
            <div className="flex flex-col">
              {variantPicker.variants.map((v, i) => {
                const outOfStock = v.stock_quantity <= 0
                const selected = pickedVariantId === v.id
                return (
                  <button
                    key={v.id}
                    type="button"
                    disabled={outOfStock}
                    onClick={() => setPickedVariantId(v.id)}
                    className={`flex items-center justify-between py-3 text-left disabled:opacity-40 ${i > 0 ? 'border-t border-surface-hover' : ''}`}
                  >
                    <span className="flex items-center gap-2.5">
                      <span
                        className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${selected ? 'border-brand bg-brand' : 'border-surface-border'}`}
                        style={selected ? { boxShadow: 'inset 0 0 0 2px #fff' } : undefined}
                      />
                      <span>
                        <span className="block text-sm text-ink">{v.unit}</span>
                        <span className="block text-[11px] text-ink-faint">
                          {outOfStock ? 'Out of stock' : `${v.stock_quantity} in stock`}
                        </span>
                      </span>
                    </span>
                    <span className="text-sm font-semibold text-ink">{formatMoney(v.price)}</span>
                  </button>
                )
              })}
            </div>
            <button className="btn-primary w-full mt-3" onClick={confirmVariantPick} disabled={!pickedVariantId}>
              {(() => {
                const picked = variantPicker.variants.find((v) => v.id === pickedVariantId)
                return picked ? `Add to cart — ${formatMoney(picked.price)}` : 'Add to cart'
              })()}
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
