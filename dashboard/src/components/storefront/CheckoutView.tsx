'use client'

import { useMemo, useState } from 'react'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { generateHourlySlots } from '@/lib/storefront/slots'
import type { StorefrontSettings, SubmitOrderBody } from '@/lib/storefront/types'

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
  total: number
  formatMoney: (amount: number) => string
  onBack: () => void
  onPlaced: (orderNumber: string) => void
}

export function CheckoutView({ token, timezone, settings, total, formatMoney, onBack, onPlaced }: Props) {
  const allowPickup = settings?.allow_pickup ?? true
  const allowDelivery = settings?.allow_delivery ?? false

  const [orderType, setOrderType] = useState<'pickup' | 'delivery'>(allowPickup ? 'pickup' : 'delivery')
  const [customerName, setCustomerName] = useState('')
  const [pickupSlotId, setPickupSlotId] = useState<string | null>(null)
  const [addressLine1, setAddressLine1] = useState('')
  const [addressLine2, setAddressLine2] = useState('')
  const [landmark, setLandmark] = useState('')
  const [city, setCity] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const slots = useMemo(
    () => generateHourlySlots(settings?.business_hours, timezone),
    [settings?.business_hours, timezone]
  )
  const selectedSlot = slots.find((s) => s.id === pickupSlotId) ?? null

  const paymentOptions = settings?.accepted_payment_methods?.length ? settings.accepted_payment_methods : ['cash']

  const deliveryFee =
    orderType === 'delivery'
      ? settings?.free_delivery_above && total >= settings.free_delivery_above
        ? 0
        : settings?.delivery_fee ?? 0
      : 0

  function canSubmit() {
    if (submitting) return false
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
            },
          }),
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
      setError('Something went wrong placing your order. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-surface pb-32">
      <header className="bg-surface-card border-b border-surface-border px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button className="btn-ghost p-2" onClick={onBack} aria-label="Back to cart" disabled={submitting}>
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold text-ink">Checkout</h1>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-4 space-y-4">
        {allowPickup && allowDelivery && (
          <div className="card">
            <p className="text-sm font-medium text-ink mb-2">How would you like to get your order?</p>
            <div className="flex gap-2">
              <button
                className={orderType === 'pickup' ? 'btn text-white bg-brand flex-1 justify-center' : 'btn-secondary flex-1 justify-center'}
                onClick={() => setOrderType('pickup')}
              >
                Pickup
              </button>
              <button
                className={orderType === 'delivery' ? 'btn text-white bg-brand flex-1 justify-center' : 'btn-secondary flex-1 justify-center'}
                onClick={() => setOrderType('delivery')}
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
            onChange={(e) => setCustomerName(e.target.value)}
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
              <div className="flex flex-wrap gap-2">
                {slots.map((slot) => (
                  <button
                    key={slot.id}
                    className={slot.id === pickupSlotId ? 'btn text-white bg-brand' : 'btn-secondary'}
                    onClick={() => setPickupSlotId(slot.id)}
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
            <p className="text-sm font-medium text-ink">Delivery address</p>
            <input
              className="input"
              value={addressLine1}
              onChange={(e) => setAddressLine1(e.target.value)}
              placeholder="House/flat no., street *"
              disabled={submitting}
            />
            <input
              className="input"
              value={addressLine2}
              onChange={(e) => setAddressLine2(e.target.value)}
              placeholder="Area, locality"
              disabled={submitting}
            />
            <input
              className="input"
              value={landmark}
              onChange={(e) => setLandmark(e.target.value)}
              placeholder="Landmark (optional)"
              disabled={submitting}
            />
            <div className="flex gap-3">
              <input
                className="input"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="City"
                disabled={submitting}
              />
              <input
                className="input"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                placeholder="Pincode"
                disabled={submitting}
              />
            </div>
            {deliveryFee > 0 && (
              <p className="text-xs text-ink-muted">Delivery fee: {formatMoney(deliveryFee)}</p>
            )}
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
                  onChange={() => setPaymentMethod(method)}
                  disabled={submitting}
                />
                {PAYMENT_LABELS[method] || method}
              </label>
            ))}
          </div>
        </div>

        {error && (
          <div className="card bg-red-50 border-red-100">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-surface-card border-t border-surface-border px-4 py-3">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-center justify-between text-sm mb-3">
            <span className="text-ink-muted">Total</span>
            <span className="font-semibold text-ink">{formatMoney(total + deliveryFee)}</span>
          </div>
          <button className="btn-primary w-full justify-center" onClick={handleSubmit} disabled={!canSubmit()}>
            {submitting ? <Loader2 size={16} className="animate-spin" /> : 'Place order'}
          </button>
        </div>
      </div>
    </main>
  )
}
