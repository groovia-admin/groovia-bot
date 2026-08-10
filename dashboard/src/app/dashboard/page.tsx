import { createAdminClient } from '@/lib/supabase/admin'
import { getViewerContext } from '@/lib/auth/viewer-context'
import { redirect } from 'next/navigation'
import { Store, ShoppingBag, Users, AlertTriangle, Clock } from 'lucide-react'
import { startOfTodayUtc } from '@/lib/timezone'
import PauseOrdersToggle from '@/components/settings/PauseOrdersToggle'
import { getOrderAgeMinutes, getAgingLevel, formatAgeShort, AGING_COLOR } from '@/lib/orderAging'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const context = await getViewerContext()
  if (context.kind === 'unauthenticated') redirect('/login')

  // ── Super Admin Overview ───────────────────────────────────
  if (context.kind === 'super_admin') {
    const adminClient = createAdminClient()

    const [
      { count: totalShops },
      { count: activeShops },
      { count: trialShops },
      { count: paidShops },
    ] = await Promise.all([
      adminClient.from('shops').select('*', { count: 'exact', head: true }),
      adminClient.from('shops').select('*', { count: 'exact', head: true }).eq('is_active', true),
      adminClient.from('shops').select('*', { count: 'exact', head: true }).eq('subscription_status', 'trial'),
      adminClient.from('shops').select('*', { count: 'exact', head: true }).eq('subscription_status', 'active'),
    ])

    const { data: recentShops } = await adminClient
      .from('shops')
      .select('id, name, slug, city, subscription_status, is_active, created_at')
      .order('created_at', { ascending: false })
      .limit(6)

    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Platform Overview</h1>
          <p className="text-ink-muted text-sm mt-0.5">GrooVia Super Admin</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={Store}         label="Total Shops"  value={totalShops  ?? 0} color="text-ink" />
          <StatCard icon={Store}         label="Active"       value={activeShops ?? 0} color="text-brand" />
          <StatCard icon={AlertTriangle} label="On Trial"     value={trialShops  ?? 0} color="text-amber-600" />
          <StatCard icon={Store}         label="Paid"         value={paidShops   ?? 0} color="text-brand" />
        </div>

        {/* Recent shops */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-ink">Recently Added Shops</h2>
            <a href="/dashboard/shops" className="text-xs hover:underline" style={{ color: 'var(--brand)' }}>
              View all →
            </a>
          </div>

          {!recentShops?.length ? (
            <p className="text-ink-muted text-sm">No shops yet.</p>
          ) : (
            <div className="space-y-0">
              {recentShops.map((shop, i) => (
                <div
                  key={shop.id}
                  className="flex items-center justify-between py-3"
                  style={{ borderBottom: i < recentShops.length - 1 ? '1px solid var(--surface-border)' : 'none' }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold"
                      style={{ background: 'var(--brand-light)', color: 'var(--brand-dark)' }}
                    >
                      {shop.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-ink">{shop.name}</p>
                      <p className="text-xs text-ink-muted">{shop.city ?? '—'} · /{shop.slug}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <SubBadge status={shop.subscription_status} />
                    <span className="text-xs text-ink-muted hidden sm:block">
                      {new Date(shop.created_at).toLocaleDateString('en-IN', {
                        day: '2-digit', month: 'short', year: 'numeric'
                      })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Merchant Overview ──────────────────────────────────────
  // Admin client, not the session client: every other page in the dashboard
  // reads through the service role, and there's no RLS policy specifically
  // exercised/verified for this page's session-scoped reads — using the
  // same client as everywhere else removes that as a source of doubt.
  const adminClient = createAdminClient()
  const shopId = context.shopId
  const showRevenue = context.role !== 'staff'
  // "Today" in the shop's own timezone, not UTC — a naive UTC-midnight
  // boundary undercounts (or overcounts) by up to ~12 hours depending on
  // the shop's offset; confirmed live for an Asia/Kolkata (UTC+5:30) shop
  // where the UTC boundary was showing orders from the previous IST day.
  const todayStart = startOfTodayUtc(context.shopTimezone)

  const [
    { count: todayOrders },
    { count: pendingOrders },
    { count: totalCustomers },
    { data: recentOrders },
    { data: stockLevels },
    { data: shopSettings },
  ] = await Promise.all([
    adminClient.from('orders').select('*', { count: 'exact', head: true })
      .eq('shop_id', shopId).gte('created_at', todayStart),
    adminClient.from('orders').select('*', { count: 'exact', head: true })
      .eq('shop_id', shopId).eq('status', 'pending'),
    adminClient.from('customers').select('*', { count: 'exact', head: true })
      .eq('shop_id', shopId),
    adminClient.from('orders')
      .select('id, order_number, status, total_amount, created_at, pickup_slot_label')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false })
      .limit(5),
    // Fetched as rows rather than a count() because "low stock" is a
    // per-row comparison (stock_quantity <= low_stock_threshold) that
    // Postgres can't express as a simple .eq()/.lte() filter — matches
    // the same definition the Inventory and Products pages already use.
    adminClient.from('products').select('stock_quantity, low_stock_threshold')
      .eq('shop_id', shopId).eq('is_available', true),
    adminClient.from('shop_settings').select('order_acceptance_enabled').eq('shop_id', shopId).maybeSingle(),
  ])

  const lowStockCount = (stockLevels ?? []).filter((p) => p.stock_quantity <= p.low_stock_threshold).length

  // Same values as OrdersClient's STATUS_STYLE — this page used to run its
  // own lighter, Tailwind-400-weight palette (tuned for a dark background
  // this app no longer has), which read as washed-out next to every other
  // page's more saturated status colors.
  const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
    pending:   { bg: 'rgba(245,158,11,0.12)',  color: '#B7791F' },
    accepted:  { bg: 'rgba(59,130,246,0.12)',  color: '#1D4ED8' },
    preparing: { bg: 'rgba(139,92,246,0.12)',  color: '#6D28D9' },
    ready:     { bg: 'rgba(16,185,129,0.12)',  color: '#0F9D6B' },
    completed: { bg: 'rgba(107,114,128,0.12)', color: '#4B5563' },
    rejected:  { bg: 'rgba(239,68,68,0.12)',   color: '#C0392B' },
    cancelled: { bg: 'rgba(239,68,68,0.12)',   color: '#C0392B' },
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">
            Good {getGreeting()}, {context.fullName?.split(' ')[0] ?? 'there'}
          </h1>
          <p className="text-ink-muted text-sm mt-0.5">
            {context.shopName ?? 'Your store'} — here's today at a glance
          </p>
        </div>
        {context.role !== 'staff' && (
          <PauseOrdersToggle initialEnabled={shopSettings?.order_acceptance_enabled ?? true} />
        )}
      </div>

      {lowStockCount > 0 && (
        <a
          href="/dashboard/inventory"
          className="flex items-center gap-3 rounded-xl px-4 py-3 transition-colors hover:opacity-90"
          style={{ background: 'var(--error-light)', border: '1px solid rgba(186,26,26,0.3)' }}
        >
          <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--error)' }} />
          <p className="text-sm flex-1" style={{ color: 'var(--error)' }}>
            <span className="font-semibold">{lowStockCount} product{lowStockCount === 1 ? '' : 's'}</span> running low on stock.
          </p>
          <span className="text-xs font-medium flex-shrink-0" style={{ color: 'var(--error)' }}>Review inventory →</span>
        </a>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={ShoppingBag} label="Today's Orders" value={todayOrders   ?? 0} color="text-brand" />
        <StatCard icon={Clock}       label="Pending"        value={pendingOrders ?? 0} color="text-amber-600" urgent={!!pendingOrders && pendingOrders > 0} />
        <StatCard icon={Users}       label="Customers"      value={totalCustomers ?? 0} color="text-ink" />
        <StatCard
          icon={AlertTriangle}
          label="Low Stock"
          value={lowStockCount}
          color="text-red-600"
          urgent={lowStockCount > 0}
          href="/dashboard/inventory"
        />
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-ink">Recent Orders</h2>
          <a href="/dashboard/orders" className="text-xs hover:underline" style={{ color: 'var(--brand)' }}>
            View all →
          </a>
        </div>

        {!recentOrders?.length ? (
          <p className="text-ink-muted text-sm">No orders yet today.</p>
        ) : (
          <div>
            {recentOrders.map((order, i) => {
              const style = STATUS_STYLES[order.status] ?? STATUS_STYLES.pending
              return (
                <div
                  key={order.id}
                  className="flex items-center justify-between py-3"
                  style={{ borderBottom: i < recentOrders.length - 1 ? '1px solid var(--surface-border)' : 'none' }}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="text-xs font-medium px-2.5 py-0.5 rounded-full"
                      style={{ background: style.bg, color: style.color }}
                    >
                      {order.status}
                    </span>
                    {order.status === 'pending' && (() => {
                      const minutes = getOrderAgeMinutes(order.created_at)
                      const level = getAgingLevel(minutes)
                      if (level === 'normal') return null
                      const { color, background } = AGING_COLOR[level]
                      return (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background, color }}>
                          {formatAgeShort(minutes)}
                        </span>
                      )
                    })()}
                    <div>
                      <p className="text-sm font-medium text-ink">#{order.order_number}</p>
                      <p className="text-xs text-ink-muted">
                        {order.pickup_slot_label ?? new Date(order.created_at).toLocaleTimeString('en-IN', {
                          hour: '2-digit', minute: '2-digit'
                        })}
                      </p>
                    </div>
                  </div>
                  {showRevenue && (
                    <p className="text-sm font-medium text-ink">
                      ₹{Number(order.total_amount).toFixed(2)}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, color, urgent, href }: {
  icon: React.ElementType
  label: string
  value: number
  color: string
  urgent?: boolean
  href?: string
}) {
  const content = (
    <>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-ink-muted">{label}</p>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <p className={`text-2xl font-bold font-display ${color}`}>{value}</p>
      {urgent && value > 0 && (
        <p className="text-xs text-amber-600 mt-1">Needs attention</p>
      )}
    </>
  )

  const style = urgent && value > 0 ? { borderColor: 'rgba(217,119,6,0.35)' } : undefined

  if (href) {
    return (
      <a href={href} className="card block transition-shadow hover:shadow-md" style={style}>
        {content}
      </a>
    )
  }

  return (
    <div className="card" style={style}>
      {content}
    </div>
  )
}

function SubBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    trial:    { bg: 'rgba(245,158,11,0.12)',  color: '#B7791F', label: 'Trial' },
    active:   { bg: 'rgba(16,185,129,0.12)',  color: '#0F9D6B', label: 'Active' },
    past_due: { bg: 'rgba(249,115,22,0.12)',  color: '#C2410C', label: 'Past Due' },
    expired:  { bg: 'rgba(239,68,68,0.12)',   color: '#C0392B', label: 'Expired' },
    suspended:{ bg: 'rgba(239,68,68,0.12)',   color: '#C0392B', label: 'Suspended' },
    cancelled:{ bg: 'rgba(107,114,128,0.12)', color: '#4B5563', label: 'Cancelled' },
  }
  const cfg = map[status] ?? map.trial
  return (
    <span
      className="text-xs font-medium px-2 py-0.5 rounded-full"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      {cfg.label}
    </span>
  )
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}