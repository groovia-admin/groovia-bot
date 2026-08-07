import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Public storefront lookup — no auth, no shop-role gate. This is what
// the ordering webview (Phase 5) calls first to render a shop's header
// and delivery terms before showing its catalog. Only fields safe for a
// customer to see are selected here — nothing internal (owner contact
// info, subscription status, upi_id, cost prices, etc.) ever reaches
// this response, unlike the authenticated /api/shop/* routes which
// return full rows to dashboard staff.
const SHOP_COLUMNS = 'id, slug, name, description, logo_url, currency_code, timezone'
const SETTINGS_COLUMNS =
  'allow_pickup, allow_delivery, minimum_order_amount, delivery_fee, delivery_radius_km, free_delivery_above, accepted_payment_methods, business_hours, order_acceptance_enabled'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const adminClient = createAdminClient()

  const { data: shop, error: shopError } = await adminClient
    .from('shops')
    .select(SHOP_COLUMNS)
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle()

  if (shopError) {
    console.error('Public shop lookup failed:', shopError)
    return NextResponse.json({ error: 'Failed to load shop' }, { status: 500 })
  }

  if (!shop) {
    return NextResponse.json({ error: 'Shop not found' }, { status: 404 })
  }

  const { data: settings, error: settingsError } = await adminClient
    .from('shop_settings')
    .select(SETTINGS_COLUMNS)
    .eq('shop_id', shop.id)
    .maybeSingle()

  if (settingsError) {
    console.error('Public shop settings lookup failed:', settingsError)
    return NextResponse.json({ error: 'Failed to load shop' }, { status: 500 })
  }

  return NextResponse.json(
    { shop, settings: settings ?? null },
    { headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=60' } }
  )
}
