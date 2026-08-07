import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const adminClient = createAdminClient()

  const { data: shop, error: shopError } = await adminClient
    .from('shops')
    .select('id')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle()

  if (shopError) {
    console.error('Public category lookup — shop resolve failed:', shopError)
    return NextResponse.json({ error: 'Failed to load categories' }, { status: 500 })
  }

  if (!shop) {
    return NextResponse.json({ error: 'Shop not found' }, { status: 404 })
  }

  const { data: categories, error } = await adminClient
    .from('categories')
    .select('id, name, description, image_url, display_order')
    .eq('shop_id', shop.id)
    .eq('is_active', true)
    .order('display_order', { ascending: true })

  if (error) {
    console.error('Public category lookup failed:', error)
    return NextResponse.json({ error: 'Failed to load categories' }, { status: 500 })
  }

  return NextResponse.json(
    { categories: categories ?? [] },
    { headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=60' } }
  )
}
