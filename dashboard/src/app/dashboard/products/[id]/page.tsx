import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import ProductDetailClient from '@/components/products/ProductDetailClient'

export const dynamic = 'force-dynamic'

type ProductDetailPageProps = {
  params: Promise<{ id: string }>
}

export default async function ProductDetailPage({ params }: ProductDetailPageProps) {
  const context = await requireRole(['owner', 'manager', 'staff'])

  if (context.kind === 'super_admin') {
    return <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">Not applicable for super admins.</div>
  }

  const { id } = await params
  const adminClient = createAdminClient()

  const [{ data: product, error: productError }, { data: categories, error: categoriesError }] = await Promise.all([
    adminClient
      .from('products')
      .select('id, name, description, category_id, unit, price, cost_price, stock_quantity, low_stock_threshold, is_available, image_url, sku')
      .eq('id', id)
      .eq('shop_id', context.shopId)
      .maybeSingle(),
    adminClient
      .from('categories')
      .select('id, name')
      .eq('shop_id', context.shopId)
      .eq('is_active', true)
      .order('display_order', { ascending: true }),
  ])

  if (productError) {
    console.error('Failed to load product:', productError)
  }

  if (categoriesError) {
    console.error('Failed to load categories:', categoriesError)
  }

  if (!product) {
    notFound()
  }

  return <ProductDetailClient product={product} categories={categories ?? []} />
}
