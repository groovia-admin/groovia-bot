import { NextResponse } from 'next/server'
import { requireShopRole, hasStaffPermission } from '@/lib/auth/require-shop-role'

type CreateProductBody = {
  name?: unknown
  description?: unknown
  category_id?: unknown
  unit?: unknown
  price?: unknown
  cost_price?: unknown
  stock_quantity?: unknown
  low_stock_threshold?: unknown
  image_url?: unknown
  sku?: unknown
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

  const { data: products, error } = await adminClient
    .from('products')
    .select(
      'id, name, description, category_id, unit, price, cost_price, stock_quantity, low_stock_threshold, is_available, image_url, sku, created_at, categories!products_category_id_fkey ( name )'
    )
    .eq('shop_id', shopId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Failed to load products:', error)
    return NextResponse.json({ error: 'Failed to load products' }, { status: 500 })
  }

  return NextResponse.json(
    { products: products ?? [] },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  )
}

export async function POST(request: Request) {
  const authorization = await requireShopRole(['owner', 'manager', 'staff'])

  if ('error' in authorization) {
    return authorization.error
  }

  if (!hasStaffPermission(authorization, 'manage_products')) {
    return NextResponse.json(
      { error: "You don't have permission to manage products. Ask the shop owner to grant it." },
      { status: 403 }
    )
  }

  const { adminClient, shopId } = authorization

  let body: CreateProductBody

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const name = getText(body.name)
  const unit = getText(body.unit)
  const categoryId = getText(body.category_id)
  const price = Number(body.price)
  const stockQuantity = Number(body.stock_quantity ?? 0)
  const lowStockThreshold = Number(body.low_stock_threshold ?? 5)
  const costPrice = body.cost_price === undefined || body.cost_price === '' || body.cost_price === null
    ? null
    : Number(body.cost_price)

  if (!name || !unit || !categoryId) {
    return NextResponse.json(
      { error: 'Name, unit, and category are required' },
      { status: 400 }
    )
  }

  if (!Number.isFinite(price) || price < 0) {
    return NextResponse.json({ error: 'Enter a valid price' }, { status: 400 })
  }

  if (!Number.isInteger(stockQuantity) || stockQuantity < 0) {
    return NextResponse.json({ error: 'Enter a valid stock quantity' }, { status: 400 })
  }

  // The category must belong to this shop — never trust a client-supplied
  // category_id across shops.
  const { data: category, error: categoryError } = await adminClient
    .from('categories')
    .select('id')
    .eq('id', categoryId)
    .eq('shop_id', shopId)
    .maybeSingle()

  if (categoryError) {
    console.error('Category validation failed:', categoryError)
    return NextResponse.json({ error: 'Unable to validate category' }, { status: 500 })
  }

  if (!category) {
    return NextResponse.json({ error: 'Category not found' }, { status: 404 })
  }

  const { data: product, error } = await adminClient
    .from('products')
    .insert({
      shop_id: shopId,
      category_id: categoryId,
      name,
      description: getText(body.description) || null,
      unit,
      price,
      cost_price: costPrice !== null && Number.isFinite(costPrice) ? costPrice : null,
      stock_quantity: stockQuantity,
      low_stock_threshold: Number.isFinite(lowStockThreshold) ? lowStockThreshold : 5,
      image_url: getText(body.image_url) || null,
      sku: getText(body.sku) || null,
      is_available: true,
      last_updated_source: 'dashboard',
    })
    .select(
      'id, name, description, category_id, unit, price, cost_price, stock_quantity, low_stock_threshold, is_available, image_url, sku, created_at, categories!products_category_id_fkey ( name )'
    )
    .single()

  if (error) {
    console.error('Failed to create product:', error)
    return NextResponse.json({ error: 'Failed to create product' }, { status: 500 })
  }

  return NextResponse.json(
    { success: true, product },
    { status: 201, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  )
}
