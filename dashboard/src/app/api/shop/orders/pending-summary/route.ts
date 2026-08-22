import { NextResponse } from 'next/server'
import { requireShopRole } from '@/lib/auth/require-shop-role'

// Deliberately cheap/lightweight — polled every 30s by OrderAlertListener
// (mounted in the dashboard layout, so it runs on every page) to detect a
// new pending order without pulling the full order list the Orders page
// itself fetches on its own, slower cadence.
export async function GET() {
  const authorization = await requireShopRole(['owner', 'manager', 'staff'])

  if ('error' in authorization) {
    return authorization.error
  }

  const { adminClient, shopId } = authorization

  const { data, error, count } = await adminClient
    .from('orders')
    .select('id, order_number, created_at', { count: 'exact' })
    .eq('shop_id', shopId)
    .eq('status', 'pending')
    // Excludes an order still inside the customer's 5-minute self-cancel
    // window — wa-bot hasn't sent the staff alert yet (shop_alert_sent_at
    // IS NULL is its own source of truth for "staff doesn't know about
    // this yet"), so this polled badge/sound shouldn't reveal it early.
    .not('shop_alert_sent_at', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)

  if (error) {
    console.error('Failed to load pending order summary:', error)
    return NextResponse.json({ error: 'Failed to load pending orders' }, { status: 500 })
  }

  return NextResponse.json(
    { count: count ?? 0, latest: data?.[0] ?? null },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  )
}
