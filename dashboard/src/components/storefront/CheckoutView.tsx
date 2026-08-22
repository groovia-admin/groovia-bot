'use client'

import { useMemo, useState } from 'react'
import { ArrowLeft, Loader2, Plus, Minus, ShoppingBag } from 'lucide-react'
import { generateHourlySlots, isShopCurrentlyOpen } from '@/lib/storefront/slots'
import type { CartItem, StorefrontSettings, SubmitOrderBody, CheckoutFormState } from '@/lib/storefront/types'

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash',
  upi: 'UPI / GPay',
  online: 'Online payment',
  pay_later: 'Pay later',
}

type Props = {
  token: string
  timezone: string
  settings: StorefrontSettings
  items: CartItem[]
  total: number
  formatMoney: (amount: number) => string
  form: CheckoutFormState
  onFormChange: (updater: (prev: CheckoutFormState) => CheckoutFormState) => void
  onQuantityChange: (productId: string, quantity: number) => void
  stockByProductId: Record<string, number>
  canCheckout: boolean
  onBack: () => void
  onAddItems: () => void
  onPlaced: (orderNumber: string) => void
}

// One page for cart review + checkout, not two — Blinkit went through
// the same change after users found their old separate cart/checkout
// screens hard to navigate. Items sit at the top (editable in place,
// same steppers the browse grid uses), everything else is one scroll
// down, ending in a always-visible bill breakdown and a single CTA with
// the amount on it.
export function CheckoutView({
  token,
  timezone,
  settings,
  items,
  total,
  formatMoney,
  form,
  onFormChange,
  onQuantityChange,
  stockByProductId,
  canCheckout,
  onBack,
  onAddItems,
  onPlaced,
}: Props) {
  const allowPickup = settings?.allow_pickup ?? true
  const allowDelivery = settings?.allow_delivery ?? false

  const {
    orderType,
    customerName,
    pickupSlotId,
    addressLine1,
    addressLine2,
    landmark,
    city,
    postalCode,
    paymentMethod,
    specialInstructions,
    deliveryLatitude,
    deliveryLongitude,
  } = form

  function set<K extends keyof CheckoutFormState>(key: K, value: CheckoutFormState[K]) {
    onFormChange((prev) => ({ ...prev, [key]: value }))
  }

  // Reported gap: the server already checks a delivery order's distance
  // against the shop's configured radius, but nothing anywhere ever
  // collected the customer's actual lat/long to check it against —
  // the feature was silently inert. This is the only place that's
  // collected; it's optional (radius limiting just doesn't apply if
  // it's never provided, same as before), not required to check out.
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setLocationError("Your browser can't share location here.")
      return
    }
    setLocating(true)
    setLocationError(null)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        set('deliveryLatitude', position.coords.latitude)
        set('deliveryLongitude', position.coords.longitude)
        setLocating(false)
      },
      () => {
        setLocationError("Couldn't get your location — you can still enter your address manually.")
        setLocating(false)
      },
      { enableHighAccuracy: false, timeout: 8000 }
    )
  }

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const slots = useMemo(
    () => generateHourlySlots(settings?.business_hours, timezone),
    [settings?.business_hours, timezone]
  )
  const selectedSlot = slots.find((s) => s.id === pickupSlotId) ?? null

  // Pickup already effectively got this (no slot ever shows up outside
  // hours); delivery had no equivalent at all, so a delivery order could
  // be placed while the shop was closed — reported as a real gap. Same
  // check now gates both, shown up front rather than only failing at
  // submission after the customer's filled in a delivery address.
  const isOpen = useMemo(
    () => isShopCurrentlyOpen(settings?.business_hours, timezone),
    [settings?.business_hours, timezone]
  )

  const paymentOptions = settings?.accepted_payment_methods?.length ? settings.accepted_payment_methods : ['cash']

  const deliveryFee =
    orderType === 'delivery'
      ? settings?.free_delivery_above && total >= settings.free_delivery_above
        ? 0
        : settings?.delivery_fee ?? 0
      : 0

  const grandTotal = total + deliveryFee

  function canSubmit() {
    if (submitting || !canCheckout || !isOpen) return false
    if (items.length === 0) return false
    if (!customerName.trim()) return false
    if (!paymentMethod) return false
    if (orderType === 'pickup') return Boolean(selectedSlot)
    return Boolean(addressLine1.trim())
  }

  async function handleSubmit() {
    setError(null)
    setSubmitting(true)

    const body: SubmitOrderBody = {
      orderType,
      customerName: customerName.trim(),
      paymentMethod,
      ...(orderType === 'pickup'
        ? { pickupSlotLabel: selectedSlot?.label }
        : {
            deliveryAddress: {
              address_line_1: addressLine1.trim(),
              address_line_2: addressLine2.trim() || undefined,
              landmark: landmark.trim() || undefined,
              city: city.trim() || undefined,
              postal_code: postalCode.trim() || undefined,
              latitude: deliveryLatitude ?? undefined,
              longitude: deliveryLongitude ?? undefined,
            },
          }),
      specialInstructions: specialInstructions.trim() || undefined,
    }

    try {
      const res = await fetch(`/api/public/session/${token}/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setError(json.error || 'Something went wrong placing your order.')
        setSubmitting(false)
        return
      }
      onPlaced(json.orderNumber)
    } catch (err) {
      console.error('Failed to submit order', err)
      // A genuine network failure here is ambiguous — the request may
      // have reached the server and created the order before the
      // connection dropped, or it may never have gone through at all,
      // and there was previously no way for the customer to tell which
      // from the storefront itself. Retrying is actually safe either
      // way (the session is single-use, so a real duplicate can't be
      // created), but the clearer answer is the WhatsApp confirmation
      // that already exists for exactly this reason — pointing them
      // there instead of leaving them guessing.
      setError("Something went wrong placing your order. Check WhatsApp first — if it actually went through, you'll have a confirmation message there. If not, please try again.")
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-surface pb-32">
      <header className="bg-surface-card border-b border-surface-border px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button className="btn-ghost p-2" onClick={onBack} aria-label="Back to browsing" disabled={submitting}>
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-lg font-bold text-ink">Your order</h1>
          <p className="text-xs text-ink-muted">{items.length} item{items.length === 1 ? '' : 's'}</p>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-4 space-y-4">
        {/* Reported gap: a customer with a stale/expired link used to only
            find out at the very last step — one small grey line easy to
            miss, after browsing the full catalog and filling out the
            entire checkout form. Surfaced here instead, the moment the
            page loads, before they've invested any of that effort. */}
        {!canCheckout && (
          <div className="card bg-red-50 border-red-100">
            <p className="text-sm font-medium text-red-600">This link has expired</p>
            <p className="text-xs text-red-500 mt-0.5">Ask the shop for a fresh WhatsApp link to place an order — you can still browse the menu below.</p>
          </div>
        )}

        {!isOpen && (
          <div className="card bg-red-50 border-red-100">
            <p className="text-sm font-medium text-red-600">We&apos;re closed right now</p>
            <p className="text-xs text-red-500 mt-0.5">You can browse, but ordering opens back up during business hours.</p>
          </div>
        )}

        {items.length === 0 ? (
          <div className="text-center py-16">
            <ShoppingBag size={32} className="mx-auto text-ink-faint" />
            <p className="mt-3 text-sm text-ink-muted">Your cart is empty.</p>
            <button className="btn-secondary mt-4" onClick={onAddItems}>
              Browse the menu
            </button>
          </div>
        ) : (
          <div>
            <div className="card divide-y divide-surface-border p-0 overflow-hidden">
              {items.map((item) => {
                const stock = stockByProductId[item.product_id]
                const atStockLimit = stock != null && item.quantity >= stock
                return (
                  <div key={item.product_id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink truncate">{item.name}</p>
                        <p className="text-xs text-ink-muted">
                          {item.unit} · {formatMoney(item.unit_price)} each
                        </p>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {/* w-9/h-9 (36px) tap targets -- dialed back from
                            an earlier 44px pass, which made this pill
                            visibly oversized next to the price column;
                            still a real improvement over the original
                            ~22px hit area. */}
                        <div className="flex items-center gap-0.5 rounded-lg bg-brand">
                          <button
                            className="text-white w-9 h-9 flex items-center justify-center flex-shrink-0"
                            onClick={() => onQuantityChange(item.product_id, item.quantity - 1)}
                            aria-label={`Decrease ${item.name} quantity`}
                            disabled={submitting}
                          >
                            <Minus size={14} />
                          </button>
                          <span className="text-white text-sm font-medium w-4 text-center">{item.quantity}</span>
                          <button
                            className="text-white w-9 h-9 flex items-center justify-center flex-shrink-0 disabled:opacity-40"
                            onClick={() => onQuantityChange(item.product_id, item.quantity + 1)}
                            aria-label={`Increase ${item.name} quantity`}
                            disabled={submitting || atStockLimit}
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                        <span className="text-sm font-semibold text-ink w-16 text-right">{formatMoney(item.subtotal)}</span>
                      </div>
                    </div>
                    {atStockLimit && <p className="text-[11px] text-ink-faint mt-1">Only {stock} left</p>}
                  </div>
                )
              })}
            </div>

            <button
              className="mt-2.5 w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-brand text-brand-dark text-sm font-semibold py-2.5"
              onClick={onAddItems}
              disabled={submitting}
            >
              <Plus size={15} /> Add items
            </button>
          </div>
        )}

        {allowPickup && allowDelivery && (
          <div className="card">
            <p className="text-sm font-medium text-ink mb-2">How would you like to get your order?</p>
            <div className="flex gap-2">
              <button
                className={orderType === 'pickup' ? 'btn text-white bg-brand flex-1 justify-center' : 'btn-secondary flex-1 justify-center'}
                onClick={() => set('orderType', 'pickup')}
              >
                Pickup
              </button>
              <button
                className={orderType === 'delivery' ? 'btn text-white bg-brand flex-1 justify-center' : 'btn-secondary flex-1 justify-center'}
                onClick={() => set('orderType', 'delivery')}
              >
                Delivery
              </button>
            </div>
          </div>
        )}

        <div className="card">
          <label className="text-sm font-medium text-ink block mb-1.5" htmlFor="customerName">
            Your name
          </label>
          <input
            id="customerName"
            className="input"
            value={customerName}
            onChange={(e) => set('customerName', e.target.value)}
            placeholder="e.g. Priya Sharma"
            disabled={submitting}
          />
        </div>

        {orderType === 'pickup' ? (
          <div className="card">
            <p className="text-sm font-medium text-ink mb-2">Pickup time</p>
            {slots.length === 0 ? (
              <p className="text-sm text-ink-muted">We&apos;re closed for today — please check back during business hours.</p>
            ) : (
              // A fixed 2-column grid, not flex-wrap — flex-wrap sized each
              // pill to its own label width, so slots wrapped raggedly
              // (some pairs shared a row, most didn't) and read as if they
              // were in no particular order even though they're generated
              // strictly chronologically. Equal-width grid cells make the
              // real (already-correct) order actually visible.
              <div className="grid grid-cols-2 gap-2">
                {slots.map((slot) => (
                  <button
                    key={slot.id}
                    className={slot.id === pickupSlotId ? 'btn text-white bg-brand justify-center' : 'btn-secondary justify-center'}
                    onClick={() => set('pickupSlotId', slot.id)}
                    disabled={submitting}
                  >
                    {slot.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="card space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-ink">Delivery address</p>
              <button
                type="button"
                className="text-xs font-semibold text-brand-dark"
                onClick={useCurrentLocation}
                disabled={locating || submitting}
              >
                {locating ? 'Locating…' : deliveryLatitude != null ? '📍 Location added' : '📍 Use my location'}
              </button>
            </div>
            {locationError && <p className="text-[11px] text-red-500 -mt-1">{locationError}</p>}
            <input
              className="input"
              value={addressLine1}
              onChange={(e) => set('addressLine1', e.target.value)}
              placeholder="House/flat no., street *"
              disabled={submitting}
            />
            <input
              className="input"
              value={addressLine2}
              onChange={(e) => set('addressLine2', e.target.value)}
              placeholder="Area, locality"
              disabled={submitting}
            />
            <input
              className="input"
              value={landmark}
              onChange={(e) => set('landmark', e.target.value)}
              placeholder="Landmark (optional)"
              disabled={submitting}
            />
            <div className="flex gap-3">
              <input
                className="input"
                value={city}
                onChange={(e) => set('city', e.target.value)}
                placeholder="City"
                disabled={submitting}
              />
              <input
                className="input"
                value={postalCode}
                onChange={(e) => set('postalCode', e.target.value)}
                placeholder="Pincode"
                disabled={submitting}
              />
            </div>
          </div>
        )}

        <div className="card">
          <p className="text-sm font-medium text-ink mb-2">Payment method</p>
          <div className="flex flex-col gap-2">
            {paymentOptions.map((method) => (
              <label key={method} className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="radio"
                  name="paymentMethod"
                  value={method}
                  checked={paymentMethod === method}
                  onChange={() => set('paymentMethod', method)}
                  disabled={submitting}
                />
                {PAYMENT_LABELS[method] || method}
              </label>
            ))}
          </div>
        </div>

        <div className="card">
          <label className="text-sm font-medium text-ink block mb-1.5" htmlFor="specialInstructions">
            Note for the shop (optional)
          </label>
          <textarea
            id="specialInstructions"
            className="input"
            rows={2}
            value={specialInstructions}
            onChange={(e) => set('specialInstructions', e.target.value)}
            placeholder="e.g. ring the bell, less spicy, call before delivering"
            disabled={submitting}
          />
        </div>

        {items.length > 0 && (
          <div className="card">
            <p className="text-sm font-medium text-ink mb-2">Bill details</p>
            <div className="flex justify-between text-sm text-ink-muted py-1">
              <span>Item total</span>
              <span>{formatMoney(total)}</span>
            </div>
            {deliveryFee > 0 && (
              <div className="flex justify-between text-sm text-ink-muted py-1">
                <span>Delivery fee</span>
                <span>{formatMoney(deliveryFee)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold text-ink pt-2 mt-1 border-t border-dashed border-surface-border">
              <span>To pay</span>
              <span>{formatMoney(grandTotal)}</span>
            </div>
          </div>
        )}

        {error && (
          <div className="card bg-red-50 border-red-100">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}
      </div>

      {items.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-surface-card border-t border-surface-border px-4 py-3">
          <div className="mx-auto max-w-2xl">
            <button className="btn-primary w-full justify-center gap-2" onClick={handleSubmit} disabled={!canSubmit()}>
              {submitting ? <Loader2 size={16} className="animate-spin" /> : `Place order · ${formatMoney(grandTotal)}`}
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
