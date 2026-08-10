import { requireRole } from '@/lib/auth/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { S } from '@/lib/ui/dashboardStyles'
import { TrendingUp, TrendingDown, Minus, Package, ShoppingBag, XCircle, PiggyBank } from 'lucide-react'

export const dynamic = 'force-dynamic'

const PERIOD_DAYS = 30

const STATUS_COLOR: Record<string, string> = {
  pending: '#B7791F',
  accepted: '#1D4ED8',
  preparing: '#6D28D9',
  ready: '#0F9D6B',
  completed: '#4B5563',
  rejected: 'var(--error)',
  cancelled: 'var(--error)',
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

export default async function AnalyticsPage() {
  // Owner sees revenue figures; manager sees volume/operational metrics
  // only — matches the permission matrix used elsewhere in the dashboard.
  const context = await requireRole(['owner', 'manager'])

  if (context.kind !== 'shop_user') {
    return <div style={{ background: '#FFFFFF', border: '1px solid var(--surface-border)', borderRadius: 12, padding: 20, color: 'var(--ink-muted)', fontSize: "var(--text-base)" }}>Not applicable for super admins.</div>
  }

  const showRevenue = context.role === 'owner'
  const adminClient = createAdminClient()
  const since = daysAgoIso(PERIOD_DAYS)
  const prevSince = daysAgoIso(PERIOD_DAYS * 2)

  const [{ data: orders, error: ordersError }, { data: items, error: itemsError }, { data: prevOrders, error: prevOrdersError }] = await Promise.all([
    adminClient
      .from('orders')
      .select('id, status, total_amount, payment_method, created_at')
      .eq('shop_id', context.shopId)
      .gte('created_at', since),
    adminClient
      .from('order_items')
      .select('product_id, product_name_snapshot, quantity, unit_price, subtotal, orders!inner ( shop_id, status, created_at )')
      .eq('orders.shop_id', context.shopId)
      .gte('orders.created_at', since),
    // Previous 30-day window (days 31-60 ago) — purely for the vs-last-period
    // deltas on the stat cards below. A raw "₹12,400" tells an owner nothing
    // about whether that's a good week without something to compare it to.
    adminClient
      .from('orders')
      .select('id, status, total_amount, created_at')
      .eq('shop_id', context.shopId)
      .gte('created_at', prevSince)
      .lt('created_at', since),
  ])

  if (ordersError) console.error('Failed to load orders for analytics:', ordersError)
  if (itemsError) console.error('Failed to load order items for analytics:', itemsError)
  if (prevOrdersError) console.error('Failed to load previous-period orders for analytics:', prevOrdersError)

  const allOrders = orders ?? []
  const fulfilledOrders = allOrders.filter((o) => o.status === 'completed')
  const failedOrders = allOrders.filter((o) => o.status === 'rejected' || o.status === 'cancelled')
  const totalRevenue = fulfilledOrders.reduce((sum, o) => sum + Number(o.total_amount), 0)
  const avgOrderValue = fulfilledOrders.length > 0 ? totalRevenue / fulfilledOrders.length : 0

  const prevAllOrders = prevOrders ?? []
  const prevFulfilledOrders = prevAllOrders.filter((o) => o.status === 'completed')
  const prevFailedOrders = prevAllOrders.filter((o) => o.status === 'rejected' || o.status === 'cancelled')
  const prevTotalRevenue = prevFulfilledOrders.reduce((sum, o) => sum + Number(o.total_amount), 0)
  const prevAvgOrderValue = prevFulfilledOrders.length > 0 ? prevTotalRevenue / prevFulfilledOrders.length : 0

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

  // Gross margin — order_items only snapshots unit_price, not cost_price at
  // time of sale, so this joins back to products' CURRENT cost_price. That's
  // an approximation if a cost has changed since the sale, which is why the
  // card is explicit about "at today's cost prices" rather than presenting
  // it as an exact historical figure.
  let grossMargin: number | null = null
  let marginPct: number | null = null
  if (showRevenue) {
    const completedItems = (items ?? []).filter((item) => {
      const order = Array.isArray(item.orders) ? item.orders[0] : item.orders
      return order?.status === 'completed' && item.product_id
    })
    const productIds = Array.from(new Set(completedItems.map((item) => item.product_id as string)))

    if (productIds.length > 0) {
      const { data: costRows, error: costError } = await adminClient
        .from('products')
        .select('id, cost_price')
        .in('id', productIds)

      if (costError) {
        console.error('Failed to load cost prices for margin calc:', costError)
      } else {
        const costById = new Map((costRows ?? []).map((p) => [p.id, p.cost_price]))
        let marginTotal = 0
        let revenueWithKnownCost = 0
        for (const item of completedItems) {
          const cost = costById.get(item.product_id as string)
          if (cost === null || cost === undefined) continue
          marginTotal += (Number(item.unit_price) - Number(cost)) * Number(item.quantity)
          revenueWithKnownCost += Number(item.subtotal)
        }
        grossMargin = marginTotal
        marginPct = revenueWithKnownCost > 0 ? (marginTotal / revenueWithKnownCost) * 100 : null
      }
    } else {
      grossMargin = 0
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 style={{ fontSize: "var(--text-xl)", fontWeight: 800, color: 'var(--ink)', margin: 0 }}>Analytics</h1>
        <p style={{ fontSize: "var(--text-base)", color: 'var(--ink-muted)', marginTop: 4 }}>Last {PERIOD_DAYS} days, vs the {PERIOD_DAYS} days before that.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
        <StatCard icon={ShoppingBag} label="Orders" value={String(allOrders.length)} prevValue={prevAllOrders.length} />
        <StatCard icon={Package} label="Completed" value={String(fulfilledOrders.length)} prevValue={prevFulfilledOrders.length} />
        <StatCard icon={XCircle} label="Rejected / cancelled" value={String(failedOrders.length)} prevValue={prevFailedOrders.length} accent="var(--error)" invertDelta />
        {showRevenue && <StatCard icon={TrendingUp} label="Revenue" value={`₹${totalRevenue.toFixed(0)}`} prevValue={prevTotalRevenue} rawValue={totalRevenue} accent="var(--brand-dark)" />}
        {showRevenue && <StatCard icon={TrendingUp} label="Avg order value" value={`₹${avgOrderValue.toFixed(0)}`} prevValue={prevAvgOrderValue} rawValue={avgOrderValue} />}
        {showRevenue && grossMargin !== null && (
          <StatCard
            icon={PiggyBank}
            label="Gross margin"
            value={`₹${grossMargin.toFixed(0)}${marginPct !== null ? ` (${marginPct.toFixed(0)}%)` : ''}`}
            accent="var(--brand-dark)"
            hint="At today's cost prices — order items don't snapshot cost at time of sale"
          />
        )}
      </div>

      <div style={S.card}>
        <div style={{ fontSize: "var(--text-base)", fontWeight: 700, color: 'var(--ink)', marginBottom: 14 }}>
          {showRevenue ? 'Revenue' : 'Orders'} — last {PERIOD_DAYS} days
        </div>
        {allOrders.length === 0 ? (
          <p style={{ fontSize: "var(--text-base)", color: 'var(--ink-muted)', margin: 0 }}>No orders in this period yet.</p>
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
                    background: value > 0 ? 'var(--brand)' : 'var(--surface-border)',
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
          <div style={{ fontSize: "var(--text-base)", fontWeight: 700, color: 'var(--ink)', marginBottom: 14 }}>Orders by status</div>
          {allOrders.length === 0 ? (
            <p style={{ fontSize: "var(--text-base)", color: 'var(--ink-muted)', margin: 0 }}>No orders yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Object.entries(statusCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([status, count]) => (
                  <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 80, fontSize: "var(--text-sm)", color: 'var(--ink-muted)', textTransform: 'capitalize' }}>{status}</div>
                    <div style={{ flex: 1, background: 'var(--surface)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                      <div style={{ width: `${(count / maxStatusCount) * 100}%`, height: '100%', background: STATUS_COLOR[status] ?? 'var(--ink-faint)' }} />
                    </div>
                    <div style={{ width: 24, fontSize: "var(--text-sm)", color: 'var(--ink)', fontWeight: 600, textAlign: 'right' }}>{count}</div>
                  </div>
                ))}
            </div>
          )}
        </div>

        <div style={S.card}>
          <div style={{ fontSize: "var(--text-base)", fontWeight: 700, color: 'var(--ink)', marginBottom: 14 }}>
            Top products {showRevenue ? '(by revenue)' : '(by quantity)'}
          </div>
          {topProducts.length === 0 ? (
            <p style={{ fontSize: "var(--text-base)", color: 'var(--ink-muted)', margin: 0 }}>No completed orders yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {topProducts.map((p) => {
                const value = showRevenue ? p.revenue : p.qty;
                return (
                  <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 100, fontSize: "var(--text-sm)", color: 'var(--ink-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                    <div style={{ flex: 1, background: 'var(--surface)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                      <div style={{ width: `${(value / maxProductValue) * 100}%`, height: '100%', background: 'var(--brand-dark)' }} />
                    </div>
                    <div style={{ width: 50, fontSize: "var(--text-sm)", color: 'var(--ink)', fontWeight: 600, textAlign: 'right' }}>
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

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
  prevValue,
  rawValue,
  invertDelta,
  hint,
}: {
  icon: React.ElementType
  label: string
  value: string
  accent?: string
  prevValue?: number
  rawValue?: number
  invertDelta?: boolean
  hint?: string
}) {
  const current = rawValue ?? Number(value.replace(/[^0-9.-]/g, ''))
  const hasComparison = prevValue !== undefined
  const delta = hasComparison && prevValue! > 0 ? ((current - prevValue!) / prevValue!) * 100 : null
  const noChange = hasComparison && prevValue === 0 && current === 0

  // "More orders" is good; "more rejected" is bad — invertDelta flips which
  // direction reads as green vs red without duplicating the whole card.
  const isGood = delta === null ? null : invertDelta ? delta < 0 : delta > 0

  return (
    <div style={S.card} title={hint}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: "var(--text-sm)", color: 'var(--ink-muted)' }}>{label}</span>
        <Icon size={15} color={accent ?? 'var(--ink-faint)'} />
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <div style={{ fontSize: "var(--text-xl)", fontWeight: 800, color: accent ?? 'var(--ink)' }}>{value}</div>
        {hasComparison && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: "var(--text-xs)", fontWeight: 700, color: noChange || delta === null ? 'var(--ink-faint)' : isGood ? 'var(--brand-dark)' : 'var(--error)' }}>
            {noChange || delta === null ? <Minus size={11} /> : delta > 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {noChange ? '—' : delta === null ? 'new' : `${Math.abs(delta).toFixed(0)}%`}
          </span>
        )}
      </div>
      {hasComparison && <div style={{ fontSize: "var(--text-xs)", color: 'var(--ink-faint)', marginTop: 2 }}>vs {prevValue} last period</div>}
    </div>
  )
}
