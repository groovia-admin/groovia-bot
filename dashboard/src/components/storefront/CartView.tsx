'use client'

import { ArrowLeft, Minus, Plus, ShoppingBag } from 'lucide-react'
import type { CartItem } from '@/lib/storefront/types'

type Props = {
  items: CartItem[]
  total: number
  formatMoney: (amount: number) => string
  onBack: () => void
  onQuantityChange: (productId: string, quantity: number) => void
  canCheckout: boolean
  onCheckout: () => void
}

export function CartView({ items, total, formatMoney, onBack, onQuantityChange, canCheckout, onCheckout }: Props) {
  return (
    <main className="min-h-screen bg-surface pb-32">
      <header className="bg-surface-card border-b border-surface-border px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button className="btn-ghost p-2" onClick={onBack} aria-label="Back to menu">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold text-ink">Your cart</h1>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-4">
        {items.length === 0 ? (
          <div className="text-center py-16">
            <ShoppingBag size={32} className="mx-auto text-ink-faint" />
            <p className="mt-3 text-sm text-ink-muted">Your cart is empty.</p>
            <button className="btn-secondary mt-4" onClick={onBack}>
              Browse the menu
            </button>
          </div>
        ) : (
          <div className="card divide-y divide-surface-border p-0 overflow-hidden">
            {items.map((item) => (
              <div key={item.product_id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink truncate">{item.name}</p>
                  <p className="text-xs text-ink-muted">
                    {item.unit} · {formatMoney(item.unit_price)} each
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="flex items-center gap-1.5 rounded-lg px-1 py-1 bg-brand">
                    <button
                      className="text-white p-1"
                      onClick={() => onQuantityChange(item.product_id, item.quantity - 1)}
                      aria-label={`Decrease ${item.name} quantity`}
                    >
                      <Minus size={14} />
                    </button>
                    <span className="text-white text-sm font-medium w-4 text-center">{item.quantity}</span>
                    <button
                      className="text-white p-1"
                      onClick={() => onQuantityChange(item.product_id, item.quantity + 1)}
                      aria-label={`Increase ${item.name} quantity`}
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                  <span className="text-sm font-semibold text-ink w-16 text-right">{formatMoney(item.subtotal)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {items.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-surface-card border-t border-surface-border px-4 py-3">
          <div className="mx-auto max-w-2xl">
            <div className="flex items-center justify-between text-sm mb-3">
              <span className="text-ink-muted">Subtotal</span>
              <span className="font-semibold text-ink">{formatMoney(total)}</span>
            </div>
            <button className="btn-primary w-full justify-center" onClick={onCheckout} disabled={!canCheckout}>
              Continue
            </button>
            {!canCheckout && (
              <p className="mt-2 text-xs text-center text-ink-muted">
                Open this page from the link WhatsApp sent you to continue.
              </p>
            )}
          </div>
        </div>
      )}
    </main>
  )
}
