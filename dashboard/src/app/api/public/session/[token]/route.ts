import { NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'

// Resolves an order_sessions row (Phase 1, wa-bot/src/services/sessionService.js)
// for the webview to bootstrap against — the link a customer gets from
// WhatsApp is `${WEBVIEW_BASE_URL}/shop/{slug}?s={token}`, and this is
// what turns that token into "which shop, which customer, what cart".
//
// wa-bot and this dashboard are separate deployments with no shared
// module — the hashing scheme (plain SHA-256, no secret) and the
// sliding-30-minute-expiry semantics are duplicated here rather than
// imported, and MUST stay in sync with sessionService.js if either ever
// changes. Only the hash is ever looked up, matching wa-bot's own
// reasoning: nothing stored in order_sessions can mint a valid session
// on its own.
const SESSION_TTL_MS = 30 * 60 * 1000

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  if (!token) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 400 })
  }

  const adminClient = createAdminClient()
  const tokenHash = hashToken(token)

  const { data: session, error } = await adminClient
    .from('order_sessions')
    .select('id, shop_id, customer_phone, cart_snapshot, expires_at')
    .eq('token_hash', tokenHash)
    .eq('status', 'active')
    .maybeSingle()

  if (error) {
    console.error('Public session lookup failed:', error)
    return NextResponse.json({ error: 'Failed to load session' }, { status: 500 })
  }

  // Same "don't distinguish the reason" choice as validateSession: an
  // expired, consumed, or never-existent token all look identical to the
  // webview, so as not to leak which case it hit.
  if (!session) {
    return NextResponse.json({ error: 'Session not found or expired' }, { status: 404 })
  }

  if (new Date(session.expires_at).getTime() < Date.now()) {
    await adminClient
      .from('order_sessions')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('id', session.id)
    return NextResponse.json({ error: 'Session not found or expired' }, { status: 404 })
  }

  const newExpiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString()
  const { error: slideError } = await adminClient
    .from('order_sessions')
    .update({ expires_at: newExpiresAt, updated_at: new Date().toISOString() })
    .eq('id', session.id)

  if (slideError) {
    // Still a valid session for this request even if the slide-update
    // failed — worst case it expires 30min from the *previous* check
    // instead of this one, not a correctness issue for this response.
    console.error('Failed to slide session expiry:', slideError)
  }

  return NextResponse.json(
    {
      shopId: session.shop_id,
      customerPhone: session.customer_phone,
      cartSnapshot: session.cart_snapshot,
      expiresAt: newExpiresAt,
    },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  )
}
