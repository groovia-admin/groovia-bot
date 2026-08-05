import { NextResponse } from 'next/server'
import { requireShopRole } from '@/lib/auth/require-shop-role'

type UpdateProductBody = {
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
  is_available?: unknown
}

type ProductRouteContext = {
  params: Promise<{ id: string }>
}

// Two FKs exist between products and categories (the plain id FK, and a
// composite one enforcing product.shop_id === category.shop_id), so
// PostgREST can't infer which to embed on without this being explicit —
// omitting it fails the whole query with PGRST201, not just the embed.
const PRODUCT_SELECT =
  'id, name, description, category_id, unit, price, cost_price, stock_quantity, low_stock_threshold, is_available, image_url, sku, created_at, categories!products_category_id_fkey ( name )'

export async function GET(_request: Request, { params }: ProductRouteContext) {
  const authorization = await requireShopRole(['owner', 'manager', 'staff'])

  if ('error' in authorization) {
    return authorization.error
  }

  const { adminClient, shopId } = authorization
  const { id } = await params

  const { data: product, error } = await adminClient
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('id', id)
    .eq('shop_id', shopId)
    .maybeSingle()

  if (error) {
    console.error('Failed to load product:', error)
    return NextResponse.json({ error: 'Failed to load product' }, { status: 500 })
  }

  if (!product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 })
  }

  return NextResponse.json(
    { product },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  )
}

export async function PATCH(request: Request, { params }: ProductRouteContext) {
  const authorization = await requireShopRole(['owner', 'manager', 'staff'])

  if ('error' in authorization) {
    return authorization.error
  }

  const { adminClient, shopId } = authorization
  const { id } = await params

  let body: UpdateProductBody

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const changes: Record<string, unknown> = {}

  if (Object.prototype.hasOwnProperty.call(body, 'name')) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 })
    }
    changes.name = body.name.trim()
  }

  if (Object.prototype.hasOwnProperty.call(body, 'description')) {
    changes.description = typeof body.description === 'string' ? body.description.trim() || null : null
  }

  if (Object.prototype.hasOwnProperty.call(body, 'unit')) {
    if (typeof body.unit !== 'string' || !body.unit.trim()) {
      return NextResponse.json({ error: 'Unit cannot be empty' }, { status: 400 })
    }
    changes.unit = body.unit.trim()
  }

  if (Object.prototype.hasOwnProperty.call(body, 'category_id')) {
    const categoryId = typeof body.category_id === 'string' ? body.category_id : ''
    if (!categoryId) {
      return NextResponse.json({ error: 'Category is required' }, { status: 400 })
    }

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

    changes.category_id = categoryId
  }

  if (Object.prototype.hasOwnProperty.call(body, 'price')) {
    const price = Number(body.price)
    if (!Number.isFinite(price) || price < 0) {
      return NextResponse.json({ error: 'Enter a valid price' }, { status: 400 })
    }
    changes.price = price
  }

  if (Object.prototype.hasOwnProperty.call(body, 'cost_price')) {
    if (body.cost_price === null || body.cost_price === '') {
      changes.cost_price = null
    } else {
      const costPrice = Number(body.cost_price)
      if (!Number.isFinite(costPrice) || costPrice < 0) {
        return NextResponse.json({ error: 'Enter a valid cost price' }, { status: 400 })
      }
      changes.cost_price = costPrice
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, 'stock_quantity')) {
    const stockQuantity = Number(body.stock_quantity)
    if (!Number.isInteger(stockQuantity) || stockQuantity < 0) {
      return NextResponse.json({ error: 'Enter a valid stock quantity' }, { status: 400 })
    }
    changes.stock_quantity = stockQuantity
  }

  if (Object.prototype.hasOwnProperty.call(body, 'low_stock_threshold')) {
    const threshold = Number(body.low_stock_threshold)
    if (!Number.isInteger(threshold) || threshold < 0) {
      return NextResponse.json({ error: 'Enter a valid low stock threshold' }, { status: 400 })
    }
    changes.low_stock_threshold = threshold
  }

  if (Object.prototype.hasOwnProperty.call(body, 'image_url')) {
    changes.image_url = typeof body.image_url === 'string' ? body.image_url.trim() || null : null
  }

  if (Object.prototype.hasOwnProperty.call(body, 'sku')) {
    changes.sku = typeof body.sku === 'string' ? body.sku.trim() || null : null
  }

  if (Object.prototype.hasOwnProperty.call(body, 'is_available')) {
    if (typeof body.is_available !== 'boolean') {
      return NextResponse.json({ error: 'is_available must be true or false' }, { status: 400 })
    }
    changes.is_available = body.is_available
  }

  if (Object.keys(changes).length === 0) {
    return NextResponse.json({ error: 'No changes provided' }, { status: 400 })
  }

  changes.last_updated_source = 'dashboard'

  const { data: product, error } = await adminClient
    .from('products')
    .update(changes)
    .eq('id', id)
    .eq('shop_id', shopId)
    .select(PRODUCT_SELECT)
    .maybeSingle()

  if (error) {
    console.error('Failed to update product:', error)
    return NextResponse.json({ error: 'Failed to update product' }, { status: 500 })
  }

  if (!product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 })
  }

  return NextResponse.json(
    { product },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  )
}
