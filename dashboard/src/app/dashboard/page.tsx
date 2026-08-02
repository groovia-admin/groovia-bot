import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getViewerContext } from '@/lib/auth/viewer-context'
import { redirect } from 'next/navigation'
import { Store, ShoppingBag, Users, AlertTriangle, Clock } from 'lucide-react'

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
          <h1 className="font-display text-2xl font-bold text-white">Platform Overview</h1>
          <p className="text-slate-400 text-sm mt-0.5">GrooVia Super Admin</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Store}         label="Total Shops"  value={totalShops  ?? 0} color="text-slate-300" />
          <StatCard icon={Store}         label="Active"       value={activeShops ?? 0} color="text-emerald-400" />
          <StatCard icon={AlertTriangle} label="On Trial"     value={trialShops  ?? 0} color="text-amber-400" />
          <StatCard icon={Store}         label="Paid"         value={paidShops   ?? 0} color="text-brand" />
        </div>

        {/* Recent shops */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-white">Recently Added Shops</h2>
            <a href="/dashboard/shops" className="text-xs hover:underline" style={{ color: 'var(--brand)' }}>
              View all →
            </a>
          </div>

          {!recentShops?.length ? (
            <p className="text-slate-500 text-sm">No shops yet.</p>
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
                      style={{ background: 'rgba(42,140,140,0.15)', color: 'var(--brand)' }}
                    >
                      {shop.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-200">{shop.name}</p>
                      <p className="text-xs text-slate-500">{shop.city ?? '—'} · /{shop.slug}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <SubBadge status={shop.subscription_status} />
                    <span className="text-xs text-slate-500 hidden sm:block">
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
  const supabase = await createClient()
  const shopId = context.shopId
  const showRevenue = context.role !== 'staff'
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD

  const [
    { count: todayOrders },
    { count: pendingOrders },
    { count: totalCustomers },
    { data: recentOrders },
  ] = await Promise.all([
    supabase.from('orders').select('*', { count: 'exact', head: true })
      .eq('shop_id', shopId).gte('created_at', today),
    supabase.from('orders').select('*', { count: 'exact', head: true })
      .eq('shop_id', shopId).eq('status', 'pending'),
    supabase.from('customers').select('*', { count: 'exact', head: true })
      .eq('shop_id', shopId),
    supabase.from('orders')
      .select('id, order_number, status, total_amount, created_at, pickup_slot_label')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
    pending:   { bg: 'rgba(245,158,11,0.15)',  color: '#f59e0b' },
    accepted:  { bg: 'rgba(59,130,246,0.15)',  color: '#60a5fa' },
    preparing: { bg: 'rgba(139,92,246,0.15)',  color: '#a78bfa' },
    ready:     { bg: 'rgba(16,185,129,0.15)',  color: '#34d399' },
    completed: { bg: 'rgba(107,114,128,0.15)', color: '#9ca3af' },
    rejected:  { bg: 'rgba(239,68,68,0.15)',   color: '#f87171' },
    cancelled: { bg: 'rgba(239,68,68,0.15)',   color: '#f87171' },
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">
          Good {getGreeting()}, {context.fullName?.split(' ')[0] ?? 'there'}
        </h1>
        <p className="text-slate-400 text-sm mt-0.5">
          {context.shopName ?? 'Your store'} — here's today at a glance
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard icon={ShoppingBag} label="Today's Orders" value={todayOrders   ?? 0} color="text-brand" />
        <StatCard icon={Clock}       label="Pending"        value={pendingOrders ?? 0} color="text-amber-400" urgent={!!pendingOrders && pendingOrders > 0} />
        <StatCard icon={Users}       label="Customers"      value={totalCustomers ?? 0} color="text-slate-300" />
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-white">Recent Orders</h2>
          <a href="/dashboard/orders" className="text-xs hover:underline" style={{ color: 'var(--brand)' }}>
            View all →
          </a>
        </div>

        {!recentOrders?.length ? (
          <p className="text-slate-500 text-sm">No orders yet today.</p>
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
                    <div>
                      <p className="text-sm font-medium text-slate-200">#{order.order_number}</p>
                      <p className="text-xs text-slate-500">
                        {order.pickup_slot_label ?? new Date(order.created_at).toLocaleTimeString('en-IN', {
                          hour: '2-digit', minute: '2-digit'
                        })}
                      </p>
                    </div>
                  </div>
                  {showRevenue && (
                    <p className="text-sm font-medium text-slate-200">
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

function StatCard({ icon: Icon, label, value, color, urgent }: {
  icon: React.ElementType
  label: string
  value: number
  color: string
  urgent?: boolean
}) {
  return (
    <div
      className="card"
      style={urgent && value > 0 ? { borderColor: 'rgba(245,158,11,0.4)' } : undefined}
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-slate-500">{label}</p>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <p className={`text-2xl font-bold font-display ${color}`}>{value}</p>
      {urgent && value > 0 && (
        <p className="text-xs text-amber-400 mt-1">Needs attention</p>
      )}
    </div>
  )
}

function SubBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    trial:    { bg: 'rgba(245,158,11,0.15)',  color: '#f59e0b', label: 'Trial' },
    active:   { bg: 'rgba(16,185,129,0.15)',  color: '#34d399', label: 'Active' },
    past_due: { bg: 'rgba(249,115,22,0.15)',  color: '#fb923c', label: 'Past Due' },
    expired:  { bg: 'rgba(239,68,68,0.15)',   color: '#f87171', label: 'Expired' },
    suspended:{ bg: 'rgba(239,68,68,0.15)',   color: '#f87171', label: 'Suspended' },
    cancelled:{ bg: 'rgba(107,114,128,0.15)', color: '#9ca3af', label: 'Cancelled' },
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