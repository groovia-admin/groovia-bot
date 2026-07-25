import { createClient } from '@/lib/supabase/server'

export default async function DashboardPage() {
  const supabase = await createClient()

  // Fetch real stats in parallel
  const [shopsResult, ordersResult, activeShopsResult] = await Promise.all([
    supabase.from('shops').select('*', { count: 'exact', head: true }),
    supabase.from('orders').select('*', { count: 'exact', head: true }),
    supabase.from('shops').select('*', { count: 'exact', head: true }).eq('is_active', true),
  ])

  // Today's orders
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const { count: todayOrders } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', today.toISOString())

  // Trial vs paying shops
  const { count: trialShops } = await supabase
    .from('shops')
    .select('*', { count: 'exact', head: true })
    .eq('subscription_status', 'trial')

  const { count: payingShops } = await supabase
    .from('shops')
    .select('*', { count: 'exact', head: true })
    .eq('subscription_status', 'active')

  const stats = {
    totalShops:   shopsResult.count       ?? 0,
    activeShops:  activeShopsResult.count ?? 0,
    totalOrders:  ordersResult.count      ?? 0,
    todayOrders:  todayOrders             ?? 0,
    trialShops:   trialShops              ?? 0,
    payingShops:  payingShops             ?? 0,
    estMRR:       (payingShops ?? 0) * 599,
  }

  const cards = [
    { label: 'Total Shops',    value: stats.totalShops,  sub: `${stats.activeShops} active`,    icon: '🏪', color: '#3b82f6' },
    { label: 'Paying Shops',   value: stats.payingShops, sub: `${stats.trialShops} on trial`,   icon: '✅', color: '#22c55e' },
    { label: 'Total Orders',   value: stats.totalOrders, sub: `${stats.todayOrders} today`,     icon: '📦', color: '#f59e0b' },
    { label: 'Est. MRR',       value: `₹${stats.estMRR.toLocaleString('en-IN')}`, sub: '@ ₹599/shop', icon: '💰', color: '#a855f7' },
  ]

  return (
    <div>
      {/* Page header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#f1f5f9', marginBottom: '4px' }}>
          Platform Overview
        </h1>
        <p style={{ fontSize: '13px', color: '#94a3b8' }}>
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px' }}>
        {cards.map(card => (
          <div key={card.label} style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '12px',
            padding: '20px',
            transition: 'border-color 0.15s',
          }}>
            <div style={{ fontSize: '24px', marginBottom: '8px' }}>{card.icon}</div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: card.color, lineHeight: 1.2 }}>
              {card.value}
            </div>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>{card.label}</div>
            <div style={{ fontSize: '11px', color: '#475569', marginTop: '4px' }}>{card.sub}</div>
          </div>
        ))}
      </div>

      {/* Quick links */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <a href="/dashboard/shops" style={{ textDecoration: 'none' }}>
          <div style={{
            background: '#1e293b',
            border: '1px solid #3b82f633',
            borderRadius: '12px',
            padding: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            cursor: 'pointer',
          }}>
            <div style={{ fontSize: '32px' }}>🏪</div>
            <div>
              <div style={{ fontWeight: 700, color: '#f1f5f9', marginBottom: '4px' }}>Manage Shops</div>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>View, activate, suspend shops</div>
            </div>
            <div style={{ marginLeft: 'auto', color: '#94a3b8' }}>→</div>
          </div>
        </a>
        <a href="/dashboard/logs" style={{ textDecoration: 'none' }}>
          <div style={{
            background: '#1e293b',
            border: '1px solid #a855f733',
            borderRadius: '12px',
            padding: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            cursor: 'pointer',
          }}>
            <div style={{ fontSize: '32px' }}>📋</div>
            <div>
              <div style={{ fontWeight: 700, color: '#f1f5f9', marginBottom: '4px' }}>Audit Logs</div>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>All platform activity</div>
            </div>
            <div style={{ marginLeft: 'auto', color: '#94a3b8' }}>→</div>
          </div>
        </a>
      </div>
    </div>
  )
}