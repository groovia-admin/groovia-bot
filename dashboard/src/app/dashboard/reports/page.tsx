import { requireRole } from '@/lib/auth/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import ReportsClient from '@/components/reports/ReportsClient'
import AdminReportsClient from '@/components/reports/AdminReportsClient'

export const dynamic = 'force-dynamic'

// Bounds every report to the same rolling window, same tradeoff as
// Orders' 200-row cap and Logs' movements fetch — client-side filtering
// over a bounded server fetch, not full-history pagination. 90 days
// comfortably covers every Tier 1 (today) and Tier 2 (default 30-day,
// extendable to 90) report in the plan; a shop wanting a longer lookback
// is a real but separate ask (server-side date-range querying).
const WINDOW_DAYS = 90

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

export default async function ReportsPage() {
  // Same permission matrix as the old Analytics page this replaces —
  // owner sees revenue/margin figures, manager sees volume/operational
  // reports only. Super admins get a separate platform-wide report set
  // below, since none of the per-shop reports above make sense across
  // shop boundaries.
  const context = await requireRole(['owner', 'manager'])

  if (context.kind === 'super_admin') {
    const adminClient = createAdminClient()
    const since = daysAgoIso(WINDOW_DAYS)

    const [
      { data: shops, error: shopsError },
      { data: ordersRaw, error: ordersError },
      { data: connections, error: connectionsError },
      { data: productsRaw, error: productsError },
    ] = await Promise.all([
      adminClient
        .from('shops')
        .select('id, name, slug, city, subscription_status, is_active, created_at, trial_ends_at')
        .order('created_at', { ascending: false }),
      adminClient
        .from('orders')
        .select('shop_id, status, total_amount, created_at')
        .gte('created_at', since),
      adminClient.from('whatsapp_connections').select('shop_id'),
      adminClient.from('products').select('shop_id'),
    ])

    if (shopsError) console.error('Admin reports: failed to load shops:', shopsError)
    if (ordersError) console.error('Admin reports: failed to load orders:', ordersError)
    if (connectionsError) console.error('Admin reports: failed to load whatsapp connections:', connectionsError)
    if (productsError) console.error('Admin reports: failed to load products:', productsError)

    const productCountByShop: Record<string, number> = {}
    for (const p of productsRaw ?? []) {
      productCountByShop[p.shop_id] = (productCountByShop[p.shop_id] ?? 0) + 1
    }

    return (
      <AdminReportsClient
        windowDays={WINDOW_DAYS}
        shops={shops ?? []}
        orders={ordersRaw ?? []}
        connectedShopIds={(connections ?? []).map((c) => c.shop_id)}
        productCountByShop={productCountByShop}
      />
    )
  }

  const showRevenue = context.role === 'owner'
  const adminClient = createAdminClient()
  const since = daysAgoIso(WINDOW_DAYS)

  const [
    { data: orders, error: ordersError },
    { data: orderItemsRaw, error: itemsError },
    { data: products, error: productsError },
    { data: categories, error: categoriesError },
    { data: movements, error: movementsError },
    { data: auditLogs, error: auditError },
    { data: customers, error: customersError },
  ] = await Promise.all([
    adminClient
      .from('orders')
      .select(
        'id, order_number, status, order_type, payment_method, total_amount, subtotal, created_via, last_updated_via, customer_id, created_at, accepted_at, preparing_at, ready_at, completed_at, rejected_at, cancelled_at, rejection_reason, cancellation_reason'
      )
      .eq('shop_id', context.shopId)
      .gte('created_at', since)
      .order('created_at', { ascending: false }),
    adminClient
      .from('order_items')
      .select('product_id, product_name_snapshot, quantity, unit_price, subtotal, orders!inner ( shop_id, status, created_at )')
      .eq('orders.shop_id', context.shopId)
      .gte('orders.created_at', since),
    adminClient
      .from('products')
      .select('id, name, category_id, unit, cost_price, stock_quantity, low_stock_threshold')
      .eq('shop_id', context.shopId),
    adminClient.from('categories').select('id, name').eq('shop_id', context.shopId),
    adminClient
      .from('inventory_movements')
      .select('id, product_id, quantity_delta, movement_type, notes, created_at, created_by')
      .eq('shop_id', context.shopId)
      .gte('created_at', since)
      .order('created_at', { ascending: false }),
    adminClient
      .from('audit_logs')
      .select('id, actor_type, action, entity_type, metadata, created_at')
      .eq('shop_id', context.shopId)
      .eq('entity_type', 'order')
      .eq('action', 'order.status_changed')
      .gte('created_at', since),
    adminClient.from('customers').select('id, full_name, phone').eq('shop_id', context.shopId),
  ])

  if (ordersError) console.error('Reports: failed to load orders:', ordersError)
  if (itemsError) console.error('Reports: failed to load order items:', itemsError)
  if (productsError) console.error('Reports: failed to load products:', productsError)
  if (categoriesError) console.error('Reports: failed to load categories:', categoriesError)
  if (movementsError) console.error('Reports: failed to load inventory movements:', movementsError)
  if (auditError) console.error('Reports: failed to load audit logs:', auditError)
  if (customersError) console.error('Reports: failed to load customers:', customersError)

  // orders!inner comes back as an array or object depending on the PostgREST
  // version/relationship shape — normalize once here instead of in every
  // report's compute function.
  const orderItems = (orderItemsRaw ?? []).map((item) => {
    const order = Array.isArray(item.orders) ? item.orders[0] : item.orders
    return {
      product_id: item.product_id,
      product_name_snapshot: item.product_name_snapshot,
      quantity: item.quantity,
      unit_price: item.unit_price,
      subtotal: item.subtotal,
      order_status: order?.status ?? null,
      order_created_at: order?.created_at ?? null,
    }
  })

  return (
    <ReportsClient
      showRevenue={showRevenue}
      windowDays={WINDOW_DAYS}
      orders={orders ?? []}
      orderItems={orderItems}
      products={products ?? []}
      categories={categories ?? []}
      movements={movements ?? []}
      auditLogs={auditLogs ?? []}
      customers={customers ?? []}
    />
  )
}
