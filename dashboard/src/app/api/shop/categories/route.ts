import { NextResponse } from 'next/server'
import { requireShopRole } from '@/lib/auth/require-shop-role'

type CreateCategoryBody = {
  name?: unknown
  description?: unknown
}

function getText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export async function GET() {
  const authorization = await requireShopRole(['owner', 'manager', 'staff'])

  if ('error' in authorization) {
    return authorization.error
  }

  const { adminClient, shopId } = authorization

  const { data: categories, error } = await adminClient
    .from('categories')
    .select('id, name, description, image_url, display_order, is_active, created_at')
    .eq('shop_id', shopId)
    .order('display_order', { ascending: true })

  if (error) {
    console.error('Failed to load categories:', error)
    return NextResponse.json({ error: 'Failed to load categories' }, { status: 500 })
  }

  return NextResponse.json(
    { categories: categories ?? [] },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  )
}

export async function POST(request: Request) {
  const authorization = await requireShopRole(['owner', 'manager', 'staff'])

  if ('error' in authorization) {
    return authorization.error
  }

  const { adminClient, shopId } = authorization

  let body: CreateCategoryBody

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const name = getText(body.name)
  const description = getText(body.description)

  if (!name) {
    return NextResponse.json({ error: 'Category name is required' }, { status: 400 })
  }

  const { count: existingCount } = await adminClient
    .from('categories')
    .select('*', { count: 'exact', head: true })
    .eq('shop_id', shopId)

  const { data: category, error } = await adminClient
    .from('categories')
    .insert({
      shop_id: shopId,
      name,
      description: description || null,
      display_order: existingCount ?? 0,
      is_active: true,
    })
    .select('id, name, description, image_url, display_order, is_active, created_at')
    .single()

  if (error) {
    console.error('Failed to create category:', error)
    return NextResponse.json({ error: 'Failed to create category' }, { status: 500 })
  }

  return NextResponse.json(
    { success: true, category },
    { status: 201, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  )
}
