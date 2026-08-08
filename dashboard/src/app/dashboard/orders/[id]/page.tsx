import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { requireRole } from '@/lib/auth/require-role'
import { viewerHasPermission } from '@/lib/auth/viewer-context'
import { createAdminClient } from '@/lib/supabase/admin'
import { S } from '@/lib/ui/dashboardStyles'
import OrderActions from '@/components/orders/OrderActions'
import OrderItemsEditor from '@/components/orders/OrderItemsEditor'
import { getOrderAgeMinutes, getAgingLevel, formatAgeShort, AGING_COLOR } from '@/lib/orderAging'

export const dynamic = 'force-dynamic'

const STATUS_STYLE: Record<string, [string, string]> = {
  pending: ['#B7791F', 'rgba(245,158,11,0.12)'],
  accepted: ['#1D4ED8', 'rgba(59,130,246,0.12)'],
  preparing: ['#6D28D9', 'rgba(139,92,246,0.12)'],
  ready: ['#0F9D6B', 'rgba(16,185,129,0.12)'],
  completed: ['#4B5563', 'rgba(107,114,128,0.12)'],
  rejected: ['#C0392B', 'rgba(239,68,68,0.12)'],
  cancelled: ['#C0392B', 'rgba(239,68,68,0.12)'],
}

const TIMELINE_STEPS: { key: string; label: string }[] = [
  { key: 'created_at', label: 'Placed' },
  { key: 'accepted_at', label: 'Accepted' },
  { key: 'preparing_at', label: 'Preparing' },
  { key: 'ready_at', label: 'Ready' },
  { key: 'completed_at', label: 'Completed' },
]

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireRole(['owner', 'manager', 'staff'])
  const { id } = await params

  if (context.kind !== 'shop_user') {
    return <div style={{ background: '#FFFFFF', border: '1px solid #E9EDEF', borderRadius: 12, padding: 20, color: '#667781', fontSize: 13 }}>Not applicable for super admins.</div>
  }

  const adminClient = createAdminClient()

  const { data: order, error } = await adminClient
    .from('orders')
    .select(
      'id, order_number, status, order_type, payment_method, payment_status, subtotal, delivery_fee, tax_amount, discount_amount, total_amount, pickup_slot_label, notes, rejection_reason, cancellation_reason, created_at, accepted_at, preparing_at, ready_at, completed_at, order_items ( id, product_name_snapshot, unit_snapshot, quantity, unit_price, subtotal ), order_customer_details ( customer_name_snapshot, customer_phone_snapshot, delivery_address_snapshot )'
    )
    .eq('id', id)
    .eq('shop_id', context.shopId)
    .maybeSingle()

  if (error) {
    console.error('Failed to load order:', error)
  }

  if (!order) {
    notFound()
  }

  const details = Array.isArray(order.order_customer_details) ? order.order_customer_details[0] : order.order_customer_details
  const items = order.order_items ?? []
  const [statusColor, statusBg] = STATUS_STYLE[order.status] ?? STATUS_STYLE.pending
  const showRevenue = context.role !== 'staff'
  const isTerminalFail = order.status === 'rejected' || order.status === 'cancelled'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 760 }}>
      <Link href="/dashboard/orders" style={{ ...S.btn('transparent', '#667781'), padding: 0, width: 'fit-content' }}>
        <ArrowLeft size={15} />
        Back to orders
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#111B21', margin: 0 }}>Order #{order.order_number}</h1>
          <p style={{ fontSize: 13, color: '#667781', marginTop: 4 }}>
            {details?.customer_name_snapshot || details?.customer_phone_snapshot || 'Unknown customer'}
            {details?.customer_phone_snapshot && details?.customer_name_snapshot ? ` · ${details.customer_phone_snapshot}` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={S.badge(statusColor, statusBg)}>{order.status}</span>
          {order.status === 'pending' && (() => {
            const minutes = getOrderAgeMinutes(order.created_at)
            const level = getAgingLevel(minutes)
            const { color, background } = AGING_COLOR[level]
            return <span style={S.badge(color, background)}>Waiting {formatAgeShort(minutes)}</span>
          })()}
        </div>
      </div>

      {isTerminalFail && (order.rejection_reason || order.cancellation_reason) && (
        <div style={{ color: '#C0392B', background: '#FDECEA', border: '1px solid #F5C6C2', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>
          {order.status === 'rejected' ? 'Rejection reason: ' : 'Cancellation reason: '}
          {order.rejection_reason || order.cancellation_reason}
        </div>
      )}

      {viewerHasPermission(context, 'manage_orders') && <OrderActions orderId={order.id} status={order.status} />}

      {!isTerminalFail && (
        <div style={{ ...S.card, display: 'flex', alignItems: 'center', gap: 0 }}>
          {TIMELINE_STEPS.map((step, i) => {
            const value = (order as Record<string, unknown>)[step.key] as string | null
            const reached = Boolean(value)
            return (
              <div key={step.key} style={{ display: 'flex', alignItems: 'center', flex: i < TIMELINE_STEPS.length - 1 ? 1 : undefined }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 90 }}>
                  <div
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      background: reached ? '#25D366' : '#E9EDEF',
                    }}
                  />
                  <div style={{ fontSize: 11, color: reached ? '#111B21' : '#8696A0', fontWeight: reached ? 600 : 400, textAlign: 'center' }}>
                    {step.label}
                  </div>
                  {value && (
                    <div style={{ fontSize: 10, color: '#8696A0' }}>
                      {new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                </div>
                {i < TIMELINE_STEPS.length - 1 && (
                  <div style={{ flex: 1, height: 2, background: reached ? '#25D366' : '#E9EDEF', margin: '0 4px 20px' }} />
                )}
              </div>
            )
          })}
        </div>
      )}

      {order.status === 'pending' && viewerHasPermission(context, 'manage_orders') ? (
        <OrderItemsEditor orderId={order.id} initialItems={items} showRevenue={showRevenue} />
      ) : (
        <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={S.th}>Item</th>
                <th style={S.th}>Qty</th>
                {showRevenue && <th style={S.th}>Unit price</th>}
                {showRevenue && <th style={{ ...S.th, textAlign: 'right' }}>Subtotal</th>}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td style={S.td} colSpan={showRevenue ? 4 : 2}>No items recorded.</td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id}>
                    <td style={{ ...S.td, color: '#111B21', fontWeight: 500 }}>{item.product_name_snapshot}</td>
                    <td style={S.td}>{item.quantity} {item.unit_snapshot}</td>
                    {showRevenue && <td style={S.td}>₹{Number(item.unit_price).toFixed(2)}</td>}
                    {showRevenue && <td style={{ ...S.td, textAlign: 'right' }}>₹{Number(item.subtotal).toFixed(2)}</td>}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {showRevenue && (
        <div style={{ ...S.card, display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 320, marginLeft: 'auto' }}>
          <Row label="Subtotal" value={order.subtotal} />
          {order.delivery_fee > 0 && <Row label="Delivery fee" value={order.delivery_fee} />}
          {order.tax_amount > 0 && <Row label="Tax" value={order.tax_amount} />}
          {order.discount_amount > 0 && <Row label="Discount" value={-order.discount_amount} />}
          <div style={{ borderTop: '1px solid #E9EDEF', marginTop: 4, paddingTop: 6 }}>
            <Row label="Total" value={order.total_amount} bold />
          </div>
          <div style={{ fontSize: 12, color: '#667781', marginTop: 4 }}>
            {order.payment_method ?? 'Payment method not set'} · {order.payment_status}
          </div>
        </div>
      )}

      {order.notes && (
        <div style={{ ...S.card }}>
          <div style={{ fontSize: 12, color: '#667781', fontWeight: 600, marginBottom: 4 }}>Order notes</div>
          <div style={{ fontSize: 13, color: '#111B21' }}>{order.notes}</div>
        </div>
      )}
    </div>
  )
}

function Row({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: bold ? 14 : 13, fontWeight: bold ? 700 : 400, color: '#111B21' }}>
      <span style={{ color: bold ? '#111B21' : '#667781' }}>{label}</span>
      <span>₹{Number(value).toFixed(2)}</span>
    </div>
  )
}
