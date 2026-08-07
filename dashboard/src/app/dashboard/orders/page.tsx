import { requireRole } from '@/lib/auth/require-role'
import { viewerHasPermission } from '@/lib/auth/viewer-context'
import { createAdminClient } from '@/lib/supabase/admin'
import OrdersClient from '@/components/orders/OrdersClient'

export const dynamic = 'force-dynamic'

export default async function OrdersPage() {
  const context = await requireRole(['owner', 'manager', 'staff'])

  if (context.kind !== 'shop_user') {
    return <div style={{ background: '#FFFFFF', border: '1px solid #E9EDEF', borderRadius: 12, padding: 20, color: '#667781', fontSize: 13 }}>Not applicable for super admins.</div>
  }

  const adminClient = createAdminClient()

  const { data: orders, error } = await adminClient
    .from('orders')
    .select(
      'id, order_number, status, order_type, payment_method, payment_status, total_amount, pickup_slot_label, created_at, order_customer_details ( customer_name_snapshot, customer_phone_snapshot )'
    )
    .eq('shop_id', context.shopId)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    console.error('Failed to load orders:', error)
  }

  const rows = (orders ?? []).map((o) => {
    const details = Array.isArray(o.order_customer_details) ? o.order_customer_details[0] : o.order_customer_details
    return {
      id: o.id,
      order_number: o.order_number,
      status: o.status,
      order_type: o.order_type,
      payment_method: o.payment_method,
      payment_status: o.payment_status,
      total_amount: o.total_amount,
      pickup_slot_label: o.pickup_slot_label,
      created_at: o.created_at,
      customer_name: details?.customer_name_snapshot ?? null,
      customer_phone: details?.customer_phone_snapshot ?? null,
    }
  })

  return (
    <OrdersClient
      initialOrders={rows}
      showRevenue={context.role !== 'staff'}
      canManage={viewerHasPermission(context, 'manage_orders')}
    />
  )
}
