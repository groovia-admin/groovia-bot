import { NextResponse } from 'next/server'
import { requireShopRole, hasStaffPermission } from '@/lib/auth/require-shop-role'

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

  if (!hasStaffPermission(authorization, 'manage_products')) {
    return NextResponse.json(
      { error: "You don't have permission to manage products. Ask the shop owner to grant it." },
      { status: 403 }
    )
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
    const name = body.name.trim()

    const { data: existingCategories } = await adminClient
      .from('categories')
      .select('id, name')
      .eq('shop_id', shopId)

    const isDuplicate = (existingCategories ?? []).some(
      (c) => c.id !== id && c.name.trim().toLowerCase() === name.toLowerCase()
    )

    if (isDuplicate) {
      return NextResponse.json({ error: 'A category with this name already exists' }, { status: 409 })
    }

    changes.name = name
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

  // Deleting a category out from under products that still reference it
  // would either orphan them or silently untag them — neither is a call
  // this endpoint should make on the owner's behalf. Require the products
  // to be reassigned (or removed) first, same as most e-commerce catalogs.
  const { count: productCount, error: countError } = await adminClient
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', id)
    .eq('shop_id', shopId)

  if (countError) {
    console.error('Failed to check products before category deletion:', countError)
    return NextResponse.json({ error: 'Failed to remove category' }, { status: 500 })
  }

  if (productCount && productCount > 0) {
    return NextResponse.json(
      {
        error: `Move or delete the ${productCount} product${productCount > 1 ? 's' : ''} in this category before deleting it.`,
        productCount,
      },
      { status: 409 }
    )
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
