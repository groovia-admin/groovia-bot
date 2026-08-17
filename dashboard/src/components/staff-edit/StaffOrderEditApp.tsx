'use client'

import { useEffect, useMemo, useState } from 'react'
import { Minus, Plus, Trash2, Loader2 } from 'lucide-react'
import { formatItemDiffLine } from '@/lib/orderDiffFormat'

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
  orderStatus: 'pending' | 'accepted'
}

// The mobile-first, no-login twin of OrderItemsEditor.tsx (dashboard) —
// same live-apply-per-tap PATCH behavior (no separate "Save" step, so
// there's never an unsaved state once a change has gone out), just
// reachable from a signed link instead of a logged-in session. Customer
// notification is NOT per-tap though (see handleDone below) — several
// quick +/- taps used to read to the customer as a flood of unrelated
// "your order changed" messages instead of one coherent update.
//
// Deliberately decrease/remove only, no increase — a shopkeeper bumping
// a quantity up (or, if that ever gets built, adding a whole new item)
// changes what the customer pays without them agreeing to it in the
// moment, unlike a decrease (always makes the bill go down, never a
// surprise). If a shop genuinely has more to add, that's a new
// conversation with the customer, not a silent edit to this one.
export function StaffOrderEditApp({ orderId, orderNumber, shopName, token, initialItems, initialFees, whatsappNumber, orderStatus }: Props) {
  const [items, setItems] = useState<OrderItem[]>(initialItems)
  const [fees] = useState(initialFees)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ended, setEnded] = useState(false)
  const [showManualReturn, setShowManualReturn] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [showCancelForm, setShowCancelForm] = useState(false)
  const [cancelReason, setCancelReason] = useState('')

  const waLink = useMemo(() => {
    if (!whatsappNumber) return null
    const digits = whatsappNumber.replace(/\D/g, '')
    return digits ? `https://wa.me/${digits}` : null
  }, [whatsappNumber])

  // Same auto-redirect pattern the customer webview already uses after
  // placing an order (StorefrontApp.tsx) — a plain onClick + <a href>
  // combo isn't reliable here: clicking an anchor starts navigation
  // immediately, racing the same tick's React state update, and this is
  // specifically a wa.me link (an app-switch, not a normal page nav) —
  // exactly the case that reportedly left staff stuck on this screen
  // with no visible next step. Tapping Done just flips `ended`; this
  // effect owns the actual navigation, same as the customer flow.
  useEffect(() => {
    if (!ended || !waLink) return
    const redirectTimer = setTimeout(() => {
      window.location.href = waLink
    }, 1200)
    const fallbackTimer = setTimeout(() => setShowManualReturn(true), 4000)
    return () => {
      clearTimeout(redirectTimer)
      clearTimeout(fallbackTimer)
    }
  }, [ended, waLink])

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
          {waLink ? (
            <p className="flex items-center justify-center gap-2 text-sm text-ink-muted">
              <Loader2 size={16} className="animate-spin" /> Returning you to WhatsApp…
            </p>
          ) : (
            <p className="text-sm font-semibold text-ink">You can close this now</p>
          )}
          <p className="text-xs text-ink-faint mt-2">Any changes were already saved and the customer notified.</p>
          {showManualReturn && waLink && (
            <a href={waLink} className="btn-secondary mt-4 w-full justify-center">
              Tap here if you weren&apos;t redirected
            </a>
          )}
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
                    {/* Same +/- stepper shape used everywhere else in the
                        app (customer cart, product grid) — present but
                        permanently disabled here rather than removed, so
                        this screen doesn't look like a different, broken
                        component; see the note above on why increasing
                        isn't allowed from this screen at all. */}
                    <button
                      className="text-white/40 p-1 cursor-not-allowed"
                      disabled
                      aria-label={`Increasing quantity isn't allowed here — ask the customer to place a new order for more ${item.product_name_snapshot}`}
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

        <p className="text-xs text-ink-faint text-center mt-3">Changes save automatically — the customer gets one summary once you tap Done.</p>

        {orderStatus === 'accepted' && !showCancelForm && (
          <button
            type="button"
            className="w-full text-center text-xs font-semibold text-red-600 mt-3 py-1"
            onClick={() => setShowCancelForm(true)}
          >
            Cancel this order
          </button>
        )}

        {/* An inline form, not window.prompt() — prompt()/confirm() are
            unreliable inside WhatsApp's in-app browser (some versions
            silently no-op them), which is exactly why tapping Cancel
            reportedly did nothing at all. Kept in-page like every other
            action on this screen instead of depending on a native
            browser dialog this webview can't control. */}
        {orderStatus === 'accepted' && showCancelForm && (
          <div className="card bg-red-50 border-red-100 mt-3">
            <label className="text-xs font-semibold text-red-600 block mb-1.5" htmlFor="cancelReason">
              Why are you cancelling? The customer will see this.
            </label>
            <textarea
              id="cancelReason"
              className="input"
              rows={2}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. out of stock, can't fulfil today"
              disabled={cancelling}
              autoFocus
            />
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                className="btn-secondary flex-1 justify-center text-xs"
                onClick={() => {
                  setShowCancelForm(false)
                  setCancelReason('')
                }}
                disabled={cancelling}
              >
                Never mind
              </button>
              <button
                type="button"
                className="flex-1 justify-center text-xs rounded-lg py-2 text-white bg-red-600 disabled:opacity-50"
                onClick={handleCancel}
                disabled={cancelling || !cancelReason.trim()}
              >
                {cancelling ? 'Cancelling…' : 'Confirm cancellation'}
              </button>
            </div>
          </div>
        )}

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
          <button className="btn-primary w-full justify-center" onClick={handleDone}>
            {waLink ? 'Done — back to WhatsApp' : 'Done'}
          </button>
        </div>
      </div>
    </main>
  )

  // Always fires — not just when diffLines is non-empty. This is also
  // what accepts a still-'pending' order now (see the /done route): a
  // shopkeeper who opens the link, reviews without changing anything,
  // and taps Done still means "this order is fine, accept it," so the
  // server has to get this call either way. Fire-and-forget: the
  // redirect must never wait on or be blocked by this, same reasoning
  // as every other best-effort notify in this flow.
  //
  // diffLines is computed here, not tracked incrementally per-tap — the
  // `items` state already holds each item's latest quantity (updated by
  // every successful updateQuantity call) and `initialItems` never
  // changes after mount, so comparing the two at this one point already
  // gives the same net "from → to" per item that per-tap bookkeeping
  // used to produce, with no extra state to keep in sync.
  function handleDone() {
    const currentById = new Map(items.map((i) => [i.id, i]))
    const diffLines = initialItems
      .filter((orig) => currentById.get(orig.id)?.quantity !== orig.quantity)
      .map((orig) => {
        const current = currentById.get(orig.id)
        return current
          ? formatItemDiffLine({ name: orig.product_name_snapshot, removed: false, from: orig.quantity, to: current.quantity })
          : formatItemDiffLine({ name: orig.product_name_snapshot, removed: true })
      })

    fetch(`/api/public/staff-edit/${orderId}/done`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, diffLines }),
    }).catch((err) => console.error('Failed to send Done to server', err))

    setEnded(true)
  }

  // Reported missing from the mobile flow entirely — WhatsApp's own
  // CANCEL command exists (typed, requires a reason), but a shopkeeper
  // already looking at this screen shouldn't have to switch apps and
  // type a command to back out of an order they're staring at. A reason
  // is still required here too, same as the WhatsApp command, since the
  // customer already believes this order is being prepared.
  async function handleCancel() {
    const reason = cancelReason.trim()
    if (!reason) return

    setCancelling(true)
    setError(null)

    try {
      const response = await fetch(`/api/public/staff-edit/${orderId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, reason }),
      })
      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Failed to cancel order')
        setCancelling(false)
        return
      }

      setEnded(true)
    } catch {
      setError('Failed to cancel order. Please try again.')
      setCancelling(false)
    }
  }
}
