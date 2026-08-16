import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Phone, Mail, CreditCard, ShoppingBag } from 'lucide-react'
import { requireRole } from '@/lib/auth/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { S } from '@/lib/ui/dashboardStyles'
import EmptyState from '@/components/ui/EmptyState'

export const dynamic = 'force-dynamic'

const STATUS_STYLE: Record<string, [string, string]> = {
  pending: ['#B7791F', 'rgba(245,158,11,0.12)'],
  accepted: ['#1D4ED8', 'rgba(59,130,246,0.12)'],
  preparing: ['#6D28D9', 'rgba(139,92,246,0.12)'],
  ready: ['#0F9D6B', 'rgba(16,185,129,0.12)'],
  completed: ['#4B5563', 'rgba(107,114,128,0.12)'],
  rejected: ['var(--error)', 'rgba(239,68,68,0.12)'],
  cancelled: ['var(--error)', 'rgba(239,68,68,0.12)'],
}

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireRole(['owner', 'manager'])
  const { id } = await params

  if (context.kind !== 'shop_user') {
    return <div style={{ background: '#FFFFFF', border: '1px solid var(--surface-border)', borderRadius: 12, padding: 20, color: 'var(--ink-muted)', fontSize: "var(--text-base)" }}>Not applicable for super admins.</div>
  }

  const showRevenue = context.role === 'owner'
  const adminClient = createAdminClient()

  const { data: customer, error } = await adminClient
    .from('customers')
    .select('id, full_name, phone, email, total_orders, total_spent, outstanding_credit, last_order_at, is_active, created_at')
    .eq('id', id)
    .eq('shop_id', context.shopId)
    .maybeSingle()

  if (error) {
    console.error('Failed to load customer:', error)
  }

  if (!customer) {
    notFound()
  }

  const { data: orders, error: ordersError } = await adminClient
    .from('orders')
    .select('id, order_number, status, total_amount, created_at')
    .eq('shop_id', context.shopId)
    .eq('customer_id', id)
    .order('created_at', { ascending: false })
    .limit(50)

  if (ordersError) {
    console.error('Failed to load customer orders:', ordersError)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 760 }}>
      <Link href="/dashboard/customers" style={{ ...S.btn('transparent', 'var(--ink-muted)'), padding: 0, width: 'fit-content' }}>
        <ArrowLeft size={15} />
        Back to customers
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: "var(--text-xl)", fontWeight: 800, color: 'var(--ink)', margin: 0 }}>{customer.full_name || 'Unnamed customer'}</h1>
          <div style={{ display: 'flex', gap: 14, marginTop: 6, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: "var(--text-base)", color: 'var(--ink-muted)' }}>
              <Phone size={13} /> {customer.phone}
            </span>
            {customer.email && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: "var(--text-base)", color: 'var(--ink-muted)' }}>
                <Mail size={13} /> {customer.email}
              </span>
            )}
          </div>
        </div>
        {customer.outstanding_credit > 0 && showRevenue && (
          <span style={S.badge('var(--error)', 'rgba(186,26,26,0.1)')}>
            <CreditCard size={12} /> ₹{Number(customer.outstanding_credit).toFixed(0)} owed
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 14 }}>
        <div style={S.card}>
          <div style={{ fontSize: "var(--text-sm)", color: 'var(--ink-muted)' }}>Total orders</div>
          <div style={{ fontSize: "var(--text-xl)", fontWeight: 800, color: 'var(--ink)', marginTop: 4 }}>{customer.total_orders}</div>
        </div>
        {showRevenue && (
          <div style={S.card}>
            <div style={{ fontSize: "var(--text-sm)", color: 'var(--ink-muted)' }}>Total spent</div>
            <div style={{ fontSize: "var(--text-xl)", fontWeight: 800, color: 'var(--ink)', marginTop: 4 }}>₹{Number(customer.total_spent).toFixed(0)}</div>
          </div>
        )}
        <div style={S.card}>
          <div style={{ fontSize: "var(--text-sm)", color: 'var(--ink-muted)' }}>Customer since</div>
          <div style={{ fontSize: "var(--text-md)", fontWeight: 600, color: 'var(--ink)', marginTop: 6 }}>
            {new Date(customer.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
          </div>
        </div>
      </div>

      <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--surface-border)', fontSize: "var(--text-base)", fontWeight: 700, color: 'var(--ink)' }}>Order history</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={S.th}>Order</th>
              <th style={S.th}>Status</th>
              <th style={S.th}>Placed</th>
              {showRevenue && <th style={{ ...S.th, textAlign: 'right' }}>Total</th>}
            </tr>
          </thead>
          <tbody>
            {(orders ?? []).length === 0 ? (
              <tr>
                <td style={S.td} colSpan={showRevenue ? 4 : 3}>
                  <EmptyState icon={ShoppingBag} title="No orders yet" compact />
                </td>
              </tr>
            ) : (
              (orders ?? []).map((o) => {
                const [color, background] = STATUS_STYLE[o.status] ?? STATUS_STYLE.pending
                return (
                  <tr key={o.id}>
                    <td style={{ ...S.td, color: 'var(--ink)', fontWeight: 500 }}>
                      <Link href={`/dashboard/orders/${o.id}`} style={{ color: 'var(--brand-dark)', textDecoration: 'none' }}>
                        #{o.order_number}
                      </Link>
                    </td>
                    <td style={S.td}>
                      <span style={{ ...S.badge(color, background), textTransform: 'capitalize' }}>{o.status}</span>
                    </td>
                    <td style={{ ...S.td, whiteSpace: 'nowrap' }}>
                      {new Date(o.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                    </td>
                    {showRevenue && <td style={{ ...S.td, textAlign: 'right', color: 'var(--ink)', fontWeight: 600 }}>₹{Number(o.total_amount).toFixed(0)}</td>}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
