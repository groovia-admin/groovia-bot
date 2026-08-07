import { NextResponse } from 'next/server'
import { requirePlatformAdmin } from '@/lib/auth/require-platform-admin'
import { logAuditEvent } from '@/lib/audit/log'

type RouteContext = {
  params: Promise<{ id: string }>
}

type SyncBody = {
  masterCategoryId?: unknown
}

// Enabling a master category for a shop (see MasterCatalogClient) previously
// only wrote to shop_master_categories/shop_master_products — tables
// nothing else in the app reads. The shop owner's real Products page never
// saw the "enabled" products. This mirrors the enabled master category's
// products into the shop's actual categories/products tables so they show
// up in the dashboard and are orderable over WhatsApp. Matches by name
// (case-insensitive) rather than a master_product_id FK, since that bridge
// column doesn't exist on products/categories yet — safe because it only
// ever creates or leaves alone, never overwrites a shop's existing product.
export async function POST(request: Request, { params }: RouteContext) {
  const authorization = await requirePlatformAdmin()

  if ('error' in authorization) {
    return authorization.error
  }

  const { adminClient, userId, actorName } = authorization
  const { id: shopId } = await params

  let body: SyncBody

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const masterCategoryId = typeof body.masterCategoryId === 'string' ? body.masterCategoryId : ''

  if (!masterCategoryId) {
    return NextResponse.json({ error: 'masterCategoryId is required' }, { status: 400 })
  }

  const { data: masterCategory, error: masterCategoryError } = await adminClient
    .from('master_categories')
    .select('id, name, master_products ( id, name, unit, base_price )')
    .eq('id', masterCategoryId)
    .maybeSingle()

  if (masterCategoryError) {
    console.error('Master category lookup failed:', masterCategoryError)
    return NextResponse.json({ error: 'Failed to load master category' }, { status: 500 })
  }

  if (!masterCategory) {
    return NextResponse.json({ error: 'Master category not found' }, { status: 404 })
  }

  const { data: shop, error: shopError } = await adminClient
    .from('shops')
    .select('id, name')
    .eq('id', shopId)
    .maybeSingle()

  if (shopError || !shop) {
    return NextResponse.json({ error: 'Shop not found' }, { status: 404 })
  }

  // Find-or-create the shop's own category matching this master category's
  // name — reuses whichever category the shop already has if one matches,
  // rather than creating a parallel duplicate.
  const { data: existingCategories, error: categoriesError } = await adminClient
    .from('categories')
    .select('id, name')
    .eq('shop_id', shopId)

  if (categoriesError) {
    console.error('Failed to load shop categories:', categoriesError)
    return NextResponse.json({ error: 'Failed to sync category' }, { status: 500 })
  }

  let categoryId = (existingCategories ?? []).find(
    (c) => c.name.trim().toLowerCase() === masterCategory.name.trim().toLowerCase()
  )?.id

  if (!categoryId) {
    const { data: newCategory, error: createCategoryError } = await adminClient
      .from('categories')
      .insert({
        shop_id: shopId,
        name: masterCategory.name,
        display_order: existingCategories?.length ?? 0,
        is_active: true,
      })
      .select('id')
      .single()

    if (createCategoryError) {
      console.error('Failed to create shop category from master catalog:', createCategoryError)
      return NextResponse.json({ error: 'Failed to create category' }, { status: 500 })
    }

    categoryId = newCategory.id
  }

  const masterProducts = masterCategory.master_products ?? []

  const { data: existingProducts, error: existingProductsError } = await adminClient
    .from('products')
    .select('id, name')
    .eq('shop_id', shopId)
    .eq('category_id', categoryId)

  if (existingProductsError) {
    console.error('Failed to load shop products:', existingProductsError)
    return NextResponse.json({ error: 'Failed to sync products' }, { status: 500 })
  }

  const existingNames = new Set((existingProducts ?? []).map((p) => p.name.trim().toLowerCase()))
  const toCreate = masterProducts.filter((p) => !existingNames.has(p.name.trim().toLowerCase()))

  let createdCount = 0

  if (toCreate.length > 0) {
    const { error: insertError, count } = await adminClient
      .from('products')
      .insert(
        toCreate.map((p) => ({
          shop_id: shopId,
          category_id: categoryId,
          name: p.name,
          unit: p.unit,
          price: p.base_price ?? 0,
          stock_quantity: 0,
          low_stock_threshold: 5,
          is_available: true,
          last_updated_source: 'master_catalog',
        })),
        { count: 'exact' }
      )

    if (insertError) {
      console.error('Failed to create products from master catalog:', insertError)
      return NextResponse.json({ error: 'Failed to sync products' }, { status: 500 })
    }

    createdCount = count ?? toCreate.length
  }

  await logAuditEvent({
    shopId,
    actorUserId: userId,
    actorType: 'super_admin',
    action: 'catalog.master_category_synced',
    entityType: 'category',
    entityId: categoryId,
    newValues: { master_category: masterCategory.name, products_created: createdCount },
    metadata: { actor_name: actorName, target_name: shop.name },
  })

  return NextResponse.json({
    success: true,
    categoryId,
    productsCreated: createdCount,
    productsSkipped: masterProducts.length - createdCount,
  })
}
