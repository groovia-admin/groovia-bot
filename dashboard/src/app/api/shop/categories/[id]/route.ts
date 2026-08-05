import { NextResponse } from 'next/server'
import { requireShopRole } from '@/lib/auth/require-shop-role'

type UpdateCategoryBody = {
  name?: unknown
  description?: unknown
  display_order?: unknown
  is_active?: unknown
}

type CategoryRouteContext = {
  params: Promise<{ id: string }>
}

export async function PATCH(request: Request, { params }: CategoryRouteContext) {
  const authorization = await requireShopRole(['owner', 'manager', 'staff'])

  if ('error' in authorization) {
    return authorization.error
  }

  const { adminClient, shopId } = authorization
  const { id } = await params

  let body: UpdateCategoryBody

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const changes: Record<string, unknown> = {}

  if (Object.prototype.hasOwnProperty.call(body, 'name')) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      return NextResponse.json({ error: 'Category name cannot be empty' }, { status: 400 })
    }
    changes.name = body.name.trim()
  }

  if (Object.prototype.hasOwnProperty.call(body, 'description')) {
    changes.description = typeof body.description === 'string' ? body.description.trim() || null : null
  }

  if (Object.prototype.hasOwnProperty.call(body, 'display_order')) {
    if (typeof body.display_order !== 'number') {
      return NextResponse.json({ error: 'display_order must be a number' }, { status: 400 })
    }
    changes.display_order = body.display_order
  }

  if (Object.prototype.hasOwnProperty.call(body, 'is_active')) {
    if (typeof body.is_active !== 'boolean') {
      return NextResponse.json({ error: 'is_active must be true or false' }, { status: 400 })
    }
    changes.is_active = body.is_active
  }

  if (Object.keys(changes).length === 0) {
    return NextResponse.json({ error: 'No changes provided' }, { status: 400 })
  }

  const { data: category, error } = await adminClient
    .from('categories')
    .update(changes)
    .eq('id', id)
    .eq('shop_id', shopId)
    .select('id, name, description, image_url, display_order, is_active, created_at')
    .maybeSingle()

  if (error) {
    console.error('Failed to update category:', error)
    return NextResponse.json({ error: 'Failed to update category' }, { status: 500 })
  }

  if (!category) {
    return NextResponse.json({ error: 'Category not found' }, { status: 404 })
  }

  return NextResponse.json(
    { category },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  )
}

export async function DELETE(request: Request, { params }: CategoryRouteContext) {
  // Deletion is permanent (unlike the is_active toggle above), so it's
  // restricted to owner/manager rather than the broader staff access PATCH
  // allows.
  const authorization = await requireShopRole(['owner', 'manager'])

  if ('error' in authorization) {
    return authorization.error
  }

  const { adminClient, shopId } = authorization
  const { id } = await params

  // Untag every product in this category first — category_id is nullable
  // specifically so a category can be removed without deleting or
  // orphaning the products that were in it.
  const { error: untagError } = await adminClient
    .from('products')
    .update({ category_id: null })
    .eq('category_id', id)
    .eq('shop_id', shopId)

  if (untagError) {
    console.error('Failed to untag products before category deletion:', untagError)
    return NextResponse.json({ error: 'Failed to remove category' }, { status: 500 })
  }

  const { error, count } = await adminClient
    .from('categories')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('shop_id', shopId)

  if (error) {
    console.error('Failed to delete category:', error)
    return NextResponse.json({ error: 'Failed to remove category' }, { status: 500 })
  }

  if (!count) {
    return NextResponse.json({ error: 'Category not found' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
