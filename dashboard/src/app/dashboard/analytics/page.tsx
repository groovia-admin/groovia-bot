import { requireRole } from '@/lib/auth/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { S } from '@/lib/ui/dashboardStyles'
import { TrendingUp, Package, ShoppingBag, XCircle } from 'lucide-react'

export const dynamic = 'force-dynamic'

const PERIOD_DAYS = 30

const STATUS_COLOR: Record<string, string> = {
  pending: '#B7791F',
  accepted: '#1D4ED8',
  preparing: '#6D28D9',
  ready: '#0F9D6B',
  completed: '#4B5563',
  rejected: '#C0392B',
  cancelled: '#C0392B',
}

export default async function AnalyticsPage() {
  // Owner sees revenue figures; manager sees volume/operational metrics
  // only — matches the permission matrix used elsewhere in the dashboard.
  const context = await requireRole(['owner', 'manager'])

  if (context.kind !== 'shop_user') {
    return <div style={{ background: '#FFFFFF', border: '1px solid #E9EDEF', borderRadius: 12, padding: 20, color: '#667781', fontSize: 13 }}>Not applicable for super admins.</div>
  }

  const showRevenue = context.role === 'owner'
  const adminClient = createAdminClient()
  const since = new Date(Date.now() - PERIOD_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const [{ data: orders, error: ordersError }, { data: items, error: itemsError }] = await Promise.all([
    adminClient
      .from('orders')
      .select('id, status, total_amount, created_at')
      .eq('shop_id', context.shopId)
      .gte('created_at', since),
    adminClient
      .from('order_items')
      .select('product_name_snapshot, quantity, subtotal, orders!inner ( shop_id, status, created_at )')
      .eq('orders.shop_id', context.shopId)
      .gte('orders.created_at', since),
  ])

  if (ordersError) console.error('Failed to load orders for analytics:', ordersError)
  if (itemsError) console.error('Failed to load order items for analytics:', itemsError)

  const allOrders = orders ?? []
  const fulfilledOrders = allOrders.filter((o) => o.status === 'completed')
  const failedOrders = allOrders.filter((o) => o.status === 'rejected' || o.status === 'cancelled')
  const totalRevenue = fulfilledOrders.reduce((sum, o) => sum + Number(o.total_amount), 0)
  const avgOrderValue = fulfilledOrders.length > 0 ? totalRevenue / fulfilledOrders.length : 0

  const statusCounts: Record<string, number> = {}
  for (const o of allOrders) statusCounts[o.status] = (statusCounts[o.status] ?? 0) + 1
  const maxStatusCount = Math.max(1, ...Object.values(statusCounts))

  // Revenue/order volume by day, oldest → newest, for the trend strip.
  const dayBuckets = new Map<string, { revenue: number; count: number }>()
  for (let i = PERIOD_DAYS - 1; i >= 0; i--) {
    const key = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    dayBuckets.set(key, { revenue: 0, count: 0 })
  }
  for (const o of allOrders) {
    const key = o.created_at.slice(0, 10)
    const bucket = dayBuckets.get(key)
    if (bucket) {
      bucket.count += 1
      if (o.status === 'completed') bucket.revenue += Number(o.total_amount)
    }
  }
  const trend = Array.from(dayBuckets.entries()).map(([date, v]) => ({ date, ...v }))
  const maxDayRevenue = Math.max(1, ...trend.map((d) => d.revenue))
  const maxDayCount = Math.max(1, ...trend.map((d) => d.count))

  // Top products by quantity sold (all viewers) / revenue (owner only),
  // counted only from orders that actually completed.
  const productTotals = new Map<string, { qty: number; revenue: number }>()
  for (const item of items ?? []) {
    const order = Array.isArray(item.orders) ? item.orders[0] : item.orders
    if (!order || order.status !== 'completed') continue
    const existing = productTotals.get(item.product_name_snapshot) ?? { qty: 0, revenue: 0 }
    existing.qty += Number(item.quantity)
    existing.revenue += Number(item.subtotal)
    productTotals.set(item.product_name_snapshot, existing)
  }
  const topProducts = Array.from(productTotals.entries())
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => (showRevenue ? b.revenue - a.revenue : b.qty - a.qty))
    .slice(0, 5)
  const maxProductValue = Math.max(1, ...topProducts.map((p) => (showRevenue ? p.revenue : p.qty)))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#111B21', margin: 0 }}>Analytics</h1>
        <p style={{ fontSize: 13, color: '#667781', marginTop: 4 }}>Last {PERIOD_DAYS} days.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
        <StatCard icon={ShoppingBag} label="Orders" value={String(allOrders.length)} />
        <StatCard icon={Package} label="Completed" value={String(fulfilledOrders.length)} />
        <StatCard icon={XCircle} label="Rejected / cancelled" value={String(failedOrders.length)} accent="#C0392B" />
        {showRevenue && <StatCard icon={TrendingUp} label="Revenue" value={`₹${totalRevenue.toFixed(0)}`} accent="#128C7E" />}
        {showRevenue && <StatCard icon={TrendingUp} label="Avg order value" value={`₹${avgOrderValue.toFixed(0)}`} />}
      </div>

      <div style={S.card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#111B21', marginBottom: 14 }}>
          {showRevenue ? 'Revenue' : 'Orders'} — last {PERIOD_DAYS} days
        </div>
        {allOrders.length === 0 ? (
          <p style={{ fontSize: 13, color: '#667781', margin: 0 }}>No orders in this period yet.</p>
        ) : (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 120 }}>
            {trend.map((d) => {
              const value = showRevenue ? d.revenue : d.count;
              const max = showRevenue ? maxDayRevenue : maxDayCount;
              const pct = Math.max(2, (value / max) * 100);
              return (
                <div
                  key={d.date}
                  title={`${d.date}: ${showRevenue ? '₹' + d.revenue.toFixed(0) : d.count + ' orders'}`}
                  style={{
                    flex: 1,
                    height: `${pct}%`,
                    background: value > 0 ? '#25D366' : '#E9EDEF',
                    borderRadius: '3px 3px 0 0',
                    minWidth: 2,
                  }}
                />
              )
            })}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div style={S.card}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#111B21', marginBottom: 14 }}>Orders by status</div>
          {allOrders.length === 0 ? (
            <p style={{ fontSize: 13, color: '#667781', margin: 0 }}>No orders yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Object.entries(statusCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([status, count]) => (
                  <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 80, fontSize: 12, color: '#667781', textTransform: 'capitalize' }}>{status}</div>
                    <div style={{ flex: 1, background: '#F0F2F5', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                      <div style={{ width: `${(count / maxStatusCount) * 100}%`, height: '100%', background: STATUS_COLOR[status] ?? '#8696A0' }} />
                    </div>
                    <div style={{ width: 24, fontSize: 12, color: '#111B21', fontWeight: 600, textAlign: 'right' }}>{count}</div>
                  </div>
                ))}
            </div>
          )}
        </div>

        <div style={S.card}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#111B21', marginBottom: 14 }}>
            Top products {showRevenue ? '(by revenue)' : '(by quantity)'}
          </div>
          {topProducts.length === 0 ? (
            <p style={{ fontSize: 13, color: '#667781', margin: 0 }}>No completed orders yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {topProducts.map((p) => {
                const value = showRevenue ? p.revenue : p.qty;
                return (
                  <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 100, fontSize: 12, color: '#667781', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                    <div style={{ flex: 1, background: '#F0F2F5', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                      <div style={{ width: `${(value / maxProductValue) * 100}%`, height: '100%', background: '#128C7E' }} />
                    </div>
                    <div style={{ width: 50, fontSize: 12, color: '#111B21', fontWeight: 600, textAlign: 'right' }}>
                      {showRevenue ? `₹${p.revenue.toFixed(0)}` : p.qty}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, accent }: { icon: React.ElementType; label: string; value: string; accent?: string }) {
  return (
    <div style={S.card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: '#667781' }}>{label}</span>
        <Icon size={15} color={accent ?? '#8696A0'} />
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: accent ?? '#111B21' }}>{value}</div>
    </div>
  )
}
