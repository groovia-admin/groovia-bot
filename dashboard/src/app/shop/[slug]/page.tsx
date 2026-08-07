import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { StorefrontApp } from '@/components/storefront/StorefrontApp'

type PublicShopPageProps = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ s?: string }>
}

const SHOP_COLUMNS = 'id, slug, name, description, logo_url, city, state, address_line_1, currency_code, timezone'
const SETTINGS_COLUMNS =
  'allow_pickup, allow_delivery, minimum_order_amount, delivery_fee, delivery_radius_km, free_delivery_above, accepted_payment_methods, business_hours, order_acceptance_enabled'

// Server-rendered shell (fast first paint, no client round-trip for the
// shop header) wrapping the interactive StorefrontApp client component,
// which owns catalog browsing + cart state and talks to the
// /api/public/* routes (Phase 4) for everything past this initial load.
export default async function PublicShopPage({ params, searchParams }: PublicShopPageProps) {
  const { slug } = await params
  const { s: token } = await searchParams

  const adminClient = createAdminClient()

  const { data: shop, error } = await adminClient
    .from('shops')
    .select(SHOP_COLUMNS)
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    console.error('Failed to load public shop:', error)
  }

  if (!shop) {
    notFound()
  }

  const { data: settings, error: settingsError } = await adminClient
    .from('shop_settings')
    .select(SETTINGS_COLUMNS)
    .eq('shop_id', shop.id)
    .maybeSingle()

  if (settingsError) {
    console.error('Failed to load public shop settings:', settingsError)
  }

  return <StorefrontApp shop={shop} settings={settings ?? null} token={token ?? null} />
}
