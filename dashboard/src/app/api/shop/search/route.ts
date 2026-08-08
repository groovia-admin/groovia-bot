import { NextResponse } from 'next/server'
import { requireShopRole } from '@/lib/auth/require-shop-role'

const RESULTS_PER_GROUP = 5

export async function GET(request: Request) {
  const authorization = await requireShopRole(['owner', 'manager', 'staff'])

  if ('error' in authorization) {
    return authorization.error
  }

  const { adminClient, shopId } = authorization
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') ?? '').trim()

  if (q.length < 2) {
    return NextResponse.json({ orders: [], products: [], customers: [] })
  }

  const like = `%${q}%`

  const [ordersRes, productsRes, customersRes] = await Promise.all([
    adminClient
      .from('orders')
      .select('id, order_number, status, total_amount, order_customer_details ( customer_name_snapshot, customer_phone_snapshot )')
      .eq('shop_id', shopId)
      .or(`order_number.ilike.${like}`)
      .order('created_at', { ascending: false })
      .limit(RESULTS_PER_GROUP),
    adminClient
      .from('products')
      .select('id, name, unit, price, sku')
      .eq('shop_id', shopId)
      .or(`name.ilike.${like},sku.ilike.${like}`)
      .limit(RESULTS_PER_GROUP),
    adminClient
      .from('customers')
      .select('id, full_name, phone')
      .eq('shop_id', shopId)
      .or(`full_name.ilike.${like},phone.ilike.${like}`)
      .limit(RESULTS_PER_GROUP),
  ])

  if (ordersRes.error) console.error('Search orders failed:', ordersRes.error)
  if (productsRes.error) console.error('Search products failed:', productsRes.error)
  if (customersRes.error) console.error('Search customers failed:', customersRes.error)

  // Order number search above only catches an exact-ish match on the order
  // number itself — also match by customer name/phone via a second query,
  // since that's at least as common a way to look an order up ("did Priya
  // order today?").
  const { data: customerMatchedOrders } = await adminClient
    .from('order_customer_details')
    .select('order_id, customer_name_snapshot, customer_phone_snapshot, orders!inner ( id, order_number, status, total_amount, shop_id )')
    .eq('orders.shop_id', shopId)
    .or(`customer_name_snapshot.ilike.${like},customer_phone_snapshot.ilike.${like}`)
    .limit(RESULTS_PER_GROUP)

  const orderResults = new Map(
    (ordersRes.data ?? []).map((o) => {
      const details = Array.isArray(o.order_customer_details) ? o.order_customer_details[0] : o.order_customer_details
      return [
        o.id,
        {
          id: o.id,
          order_number: o.order_number,
          status: o.status,
          total_amount: o.total_amount,
          customer_name: details?.customer_name_snapshot ?? null,
        },
      ]
    })
  )

  for (const row of customerMatchedOrders ?? []) {
    const order = Array.isArray(row.orders) ? row.orders[0] : row.orders
    if (!order || orderResults.has(order.id)) continue
    orderResults.set(order.id, {
      id: order.id,
      order_number: order.order_number,
      status: order.status,
      total_amount: order.total_amount,
      customer_name: row.customer_name_snapshot,
    })
  }

  return NextResponse.json(
    {
      orders: Array.from(orderResults.values()).slice(0, RESULTS_PER_GROUP),
      products: productsRes.data ?? [],
      customers: customersRes.data ?? [],
    },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  )
}
