import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hashSessionToken, SESSION_TTL_MS } from '@/lib/orderSession'

// Resolves an order_sessions row (Phase 1, wa-bot/src/services/sessionService.js)
// for the webview to bootstrap against — the link a customer gets from
// WhatsApp is `${WEBVIEW_BASE_URL}/shop/{slug}?s={token}`, and this is
// what turns that token into "which shop, which customer, what cart".
// See lib/orderSession.ts for why the hashing/expiry logic is duplicated
// from wa-bot rather than imported.

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  if (!token) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 400 })
  }

  const adminClient = createAdminClient()
  const tokenHash = hashSessionToken(token)

  const { data: session, error } = await adminClient
    .from('order_sessions')
    .select('id, shop_id, customer_phone, customer_name, cart_snapshot, expires_at')
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

  // A returning customer's most recent delivery address, so checkout
  // doesn't ask them to retype it on every order — mirrors the
  // customerName pre-fill just below it. order_sessions has no
  // customer_id (a session exists before any order/customer row does),
  // so this goes through the same shop_id+phone lookup order/route.ts
  // already uses to find-or-create the customer. No customer row yet
  // (first-ever session) or no saved address yet (first-ever delivery
  // order) both just mean nothing to pre-fill — not an error.
  let deliveryAddress: {
    address_line_1: string
    address_line_2: string | null
    landmark: string | null
    city: string | null
    postal_code: string | null
  } | null = null

  const { data: customer } = await adminClient
    .from('customers')
    .select('id')
    .eq('shop_id', session.shop_id)
    .eq('phone', session.customer_phone)
    .maybeSingle()

  if (customer) {
    // Deliberately NOT ordered by is_default first: order/route.ts sets
    // is_default only on a customer's very first-ever saved address and
    // never revisits it afterward, while every later delivery order
    // unconditionally inserts another new row rather than reusing one —
    // confirmed against real data where a customer's actual most recent
    // address was a different (non-default) row than an earlier one
    // still flagged default. created_at DESC is what actually reflects
    // "what they used last," which is what pre-filling should mean here.
    const { data: address } = await adminClient
      .from('customer_addresses')
      .select('address_line_1, address_line_2, landmark, city, postal_code')
      .eq('customer_id', customer.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (address) deliveryAddress = address
  }

  return NextResponse.json(
    {
      shopId: session.shop_id,
      customerPhone: session.customer_phone,
      customerName: session.customer_name,
      cartSnapshot: session.cart_snapshot,
      deliveryAddress,
      expiresAt: newExpiresAt,
    },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  )
}
