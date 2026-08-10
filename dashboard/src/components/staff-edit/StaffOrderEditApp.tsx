'use client'

import { useState } from 'react'
import { Minus, Plus, Trash2, CheckCircle2 } from 'lucide-react'

type OrderItem = {
  id: string
  product_name_snapshot: string
  unit_snapshot: string
  quantity: number
  unit_price: number
  subtotal: number
}

type Props = {
  orderId: string
  orderNumber: string
  shopName: string
  token: string
  initialItems: OrderItem[]
  initialFees: { delivery_fee: number; tax_amount: number; discount_amount: number }
  whatsappNumber: string | null
}

// The mobile-first, no-login twin of OrderItemsEditor.tsx (dashboard) —
// same live-apply-per-tap behavior (each +/- immediately PATCHes and
// notifies the customer, no separate "Save" step to avoid implying
// there's an unsaved state once a change has already gone out), just
// reachable from a signed link instead of a logged-in session.
export function StaffOrderEditApp({ orderId, orderNumber, shopName, token, initialItems, initialFees, whatsappNumber }: Props) {
  const [items, setItems] = useState<OrderItem[]>(initialItems)
  const [fees] = useState(initialFees)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ended, setEnded] = useState(false)

  const subtotal = items.reduce((sum, i) => sum + Number(i.subtotal), 0)
  const total = subtotal + Number(fees.delivery_fee || 0) + Number(fees.tax_amount || 0) - Number(fees.discount_amount || 0)

  async function updateQuantity(item: OrderItem, nextQuantity: number) {
    setBusyId(item.id)
    setError(null)

    try {
      const response = await fetch(`/api/public/staff-edit/${orderId}/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, quantity: nextQuantity }),
      })
      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Failed to update item')
        return
      }

      if (data.removed) {
        setItems((prev) => prev.filter((i) => i.id !== item.id))
      } else {
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, quantity: nextQuantity, subtotal: i.unit_price * nextQuantity } : i))
        )
      }
    } catch {
      setError('Failed to update item. Please try again.')
    } finally {
      setBusyId(null)
    }
  }

  function removeItem(item: OrderItem) {
    if (items.length <= 1) {
      setError("Can't remove every item — use Reject in WhatsApp instead if none of these are available.")
      return
    }
    if (!window.confirm(`Remove ${item.product_name_snapshot} from this order?`)) return
    updateQuantity(item, 0)
  }

  if (ended) {
    return (
      <main className="min-h-[100dvh] flex items-center justify-center bg-surface px-6">
        <div className="text-center max-w-xs">
          <CheckCircle2 size={36} className="mx-auto text-brand mb-3" />
          <p className="text-sm font-semibold text-ink">You can close this now</p>
          <p className="text-xs text-ink-muted mt-1">Any changes were already saved and the customer notified.</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-[100dvh] bg-surface pb-32">
      <header className="bg-surface-card border-b border-surface-border px-4 py-4 sticky top-0 z-10">
        <h1 className="text-base font-bold text-ink">Editing {orderNumber}</h1>
        <p className="text-xs text-ink-muted mt-0.5">{shopName}</p>
      </header>

      <div className="mx-auto max-w-md px-4 py-4">
        {error && (
          <div className="card bg-red-50 border-red-100 mb-3">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <div className="card divide-y divide-surface-border p-0 overflow-hidden">
          {items.map((item) => {
            const busy = busyId === item.id
            return (
              <div key={item.id} className="flex items-center justify-between gap-2 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink truncate">{item.product_name_snapshot}</p>
                  <p className="text-xs text-ink-muted">
                    {item.unit_snapshot} · ₹{Number(item.unit_price).toFixed(2)} each
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="flex items-center gap-1.5 rounded-lg px-1 py-1 bg-brand" style={{ opacity: busy ? 0.6 : 1 }}>
                    <button
                      className="text-white p-1"
                      disabled={busy}
                      onClick={() => updateQuantity(item, item.quantity - 1)}
                      aria-label={`Decrease ${item.product_name_snapshot} quantity`}
                    >
                      <Minus size={14} />
                    </button>
                    <span className="text-white text-sm font-medium w-4 text-center">{item.quantity}</span>
                    <button
                      className="text-white p-1"
                      disabled={busy}
                      onClick={() => updateQuantity(item, item.quantity + 1)}
                      aria-label={`Increase ${item.product_name_snapshot} quantity`}
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                  <span className="text-sm font-semibold text-ink w-14 text-right">₹{Number(item.subtotal).toFixed(0)}</span>
                  <button
                    className="w-7 h-7 rounded-lg border border-red-100 text-red-600 flex items-center justify-center flex-shrink-0"
                    disabled={busy}
                    onClick={() => removeItem(item)}
                    aria-label={`Remove ${item.product_name_snapshot}`}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        <p className="text-xs text-ink-faint text-center mt-3">Changes save automatically — the customer is notified right away.</p>

        <div className="card mt-4">
          <div className="flex justify-between text-sm text-ink-muted py-1">
            <span>Subtotal</span>
            <span>₹{subtotal.toFixed(2)}</span>
          </div>
          {fees.delivery_fee > 0 && (
            <div className="flex justify-between text-sm text-ink-muted py-1">
              <span>Delivery fee</span>
              <span>₹{Number(fees.delivery_fee).toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-bold text-ink pt-2 mt-1 border-t border-dashed border-surface-border">
            <span>Total</span>
            <span>₹{total.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-surface-card border-t border-surface-border px-4 py-3">
        <div className="mx-auto max-w-md">
          {whatsappNumber ? (
            <a
              href={`https://wa.me/${whatsappNumber}`}
              className="btn-primary w-full justify-center"
              onClick={() => setEnded(true)}
            >
              Done — back to WhatsApp
            </a>
          ) : (
            <button className="btn-primary w-full justify-center" onClick={() => setEnded(true)}>
              Done
            </button>
          )}
        </div>
      </div>
    </main>
  )
}
