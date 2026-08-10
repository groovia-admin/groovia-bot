import { requireRole } from '@/lib/auth/require-role'
import { viewerHasPermission } from '@/lib/auth/viewer-context'
import { createAdminClient } from '@/lib/supabase/admin'
import ProductsClient from '@/components/products/ProductsClient'

export const dynamic = 'force-dynamic'

export default async function ProductsPage() {
  const context = await requireRole(['owner', 'manager', 'staff'])

  if (context.kind === 'super_admin') {
    return <div style={{ background: '#FFFFFF', border: '1px solid var(--surface-border)', borderRadius: 12, padding: 20, color: 'var(--ink-muted)', fontSize: 13 }}>Not applicable for super admins.</div>
  }

  const adminClient = createAdminClient()

  const [{ data: categories, error: categoriesError }, { data: products, error: productsError }] = await Promise.all([
    adminClient
      .from('categories')
      .select('id, name, description, display_order, is_active')
      .eq('shop_id', context.shopId)
      .order('display_order', { ascending: true }),
    adminClient
      .from('products')
      .select(
        'id, name, description, category_id, unit, price, cost_price, stock_quantity, low_stock_threshold, is_available, image_url, sku, categories!products_category_id_fkey ( name )'
      )
      .eq('shop_id', context.shopId)
      .order('created_at', { ascending: false }),
  ])

  if (categoriesError) {
    console.error('Failed to load categories:', categoriesError)
  }

  if (productsError) {
    console.error('Failed to load products:', productsError)
  }

  return (
    <ProductsClient
      initialCategories={categories ?? []}
      initialProducts={products ?? []}
      canManage={viewerHasPermission(context, 'manage_products')}
    />
  )
}
