import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Only browse-relevant fields — cost_price, sku, low_stock_threshold,
// last_updated_source/by are internal and never leave the authenticated
// /api/shop/* routes. is_available is the shop owner's own manual
// on/off toggle, enough to hide something that shouldn't be orderable
// at all; stock_quantity is included so the webview can cap the
// quantity stepper at what's actually on the shelf (order submission
// re-validates this server-side too — see order/route.ts — since stock
// can change between browsing and checkout).
const PRODUCT_COLUMNS = 'id, category_id, name, description, unit, price, image_url, stock_quantity'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const categoryId = new URL(request.url).searchParams.get('category_id')
  const adminClient = createAdminClient()

  const { data: shop, error: shopError } = await adminClient
    .from('shops')
    .select('id')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle()

  if (shopError) {
    console.error('Public product lookup — shop resolve failed:', shopError)
    return NextResponse.json({ error: 'Failed to load products' }, { status: 500 })
  }

  if (!shop) {
    return NextResponse.json({ error: 'Shop not found' }, { status: 404 })
  }

  let query = adminClient
    .from('products')
    .select(PRODUCT_COLUMNS)
    .eq('shop_id', shop.id)
    .eq('is_available', true)

  if (categoryId) {
    query = query.eq('category_id', categoryId)
  }

  const { data: products, error } = await query.order('name', { ascending: true })

  if (error) {
    console.error('Public product lookup failed:', error)
    return NextResponse.json({ error: 'Failed to load products' }, { status: 500 })
  }

  return NextResponse.json(
    { products: products ?? [] },
    { headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=60' } }
  )
}
