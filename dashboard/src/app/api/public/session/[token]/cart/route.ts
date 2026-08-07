import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hashSessionToken } from '@/lib/orderSession'
import type { CartItem } from '@/lib/storefront/types'

// Persists cart state as the customer browses (mirrors wa-bot's
// updateCartSnapshot) — separate from the session-resolve GET so a
// plain page load doesn't need to also carry a cart payload. Only
// touches rows still 'active': a cart update racing an expiry or an
// already-consumed session is silently a no-op, not an error, since the
// webview's own next session-resolve call will already have told it the
// session is gone.
const MAX_ITEMS = 100

function isValidItem(item: unknown): item is CartItem {
  if (!item || typeof item !== 'object') return false
  const i = item as Record<string, unknown>
  return (
    typeof i.product_id === 'string' &&
    typeof i.name === 'string' &&
    typeof i.unit === 'string' &&
    typeof i.unit_price === 'number' &&
    Number.isFinite(i.unit_price) &&
    typeof i.quantity === 'number' &&
    Number.isInteger(i.quantity) &&
    i.quantity > 0 &&
    typeof i.subtotal === 'number' &&
    Number.isFinite(i.subtotal)
  )
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  if (!token) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { items, total } = (body as { items?: unknown; total?: unknown }) ?? {}

  if (!Array.isArray(items) || items.length > MAX_ITEMS || !items.every(isValidItem)) {
    return NextResponse.json({ error: 'Invalid cart' }, { status: 400 })
  }

  if (typeof total !== 'number' || !Number.isFinite(total) || total < 0) {
    return NextResponse.json({ error: 'Invalid cart total' }, { status: 400 })
  }

  const adminClient = createAdminClient()
  const tokenHash = hashSessionToken(token)

  const { data: updated, error } = await adminClient
    .from('order_sessions')
    .update({ cart_snapshot: { items, total }, updated_at: new Date().toISOString() })
    .eq('token_hash', tokenHash)
    .eq('status', 'active')
    .select('id')
    .maybeSingle()

  if (error) {
    console.error('Failed to persist cart snapshot:', error)
    return NextResponse.json({ error: 'Failed to save cart' }, { status: 500 })
  }

  if (!updated) {
    return NextResponse.json({ error: 'Session not found or expired' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
