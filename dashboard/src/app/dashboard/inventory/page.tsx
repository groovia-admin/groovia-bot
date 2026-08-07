import Link from 'next/link'
import { format, isToday, isYesterday } from 'date-fns'
import { requireRole } from '@/lib/auth/require-role'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const MOVEMENT_LABEL: Record<string, string> = {
  initial_stock: 'Initial stock',
  sale: 'Sold (order accepted)',
  restock: 'Restocked',
  manual_adjustment: 'Manual edit',
  damaged: 'Damaged/written off',
  returned: 'Returned',
  cancelled_order: 'Order cancelled — stock restored',
}

function dayLabel(dateStr: string): string {
  const d = new Date(dateStr)
  if (isToday(d)) return 'Today'
  if (isYesterday(d)) return 'Yesterday'
  return format(d, 'MMMM d, yyyy')
}

export default async function InventoryPage() {
  const context = await requireRole(['owner', 'manager', 'staff'])

  if (context.kind === 'super_admin') {
    return <div style={{ background: '#FFFFFF', border: '1px solid #E9EDEF', borderRadius: 12, padding: 20, color: '#667781', fontSize: 13 }}>Not applicable for super admins.</div>
  }

  const adminClient = createAdminClient()

  const [{ data: products, error }, { data: movements, error: movementsError }] = await Promise.all([
    adminClient
      .from('products')
      .select('id, name, unit, stock_quantity, low_stock_threshold')
      .eq('shop_id', context.shopId)
      .eq('is_available', true),
    adminClient
      .from('inventory_movements')
      .select('id, quantity_delta, movement_type, notes, created_at, products ( name )')
      .eq('shop_id', context.shopId)
      .order('created_at', { ascending: false })
      .limit(200),
  ])

  if (error) {
    console.error('Failed to load inventory:', error)
  }

  if (movementsError) {
    console.error('Failed to load inventory movements:', movementsError)
  }

  // Column-to-column comparison isn't expressible via the query builder's
  // simple filters, so filter here — fine at this catalog scale.
  const lowStock = (products ?? []).filter((p) => p.stock_quantity <= p.low_stock_threshold)

  const movementGroups: { label: string; items: NonNullable<typeof movements> }[] = []
  for (const m of movements ?? []) {
    const label = dayLabel(m.created_at)
    const last = movementGroups[movementGroups.length - 1]
    if (last && last.label === label) {
      last.items.push(m)
    } else {
      movementGroups.push({ label, items: [m] })
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#111B21', margin: 0 }}>Inventory</h1>
        <p style={{ fontSize: 13, color: '#667781', marginTop: 4 }}>
          Products at or below their low-stock threshold.
        </p>
      </div>

      <div
        style={{
          background: '#FFFFFF',
          border: '1px solid #E9EDEF',
          borderRadius: 12,
          padding: 0,
          overflow: 'hidden',
          boxShadow: '0 1px 2px rgba(17,27,33,0.04)',
        }}
      >
        {lowStock.length === 0 ? (
          <p style={{ padding: 20, fontSize: 13, color: '#667781', margin: 0 }}>
            Nothing low on stock right now.
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Product</th>
                <th style={th}>Unit</th>
                <th style={th}>Stock</th>
                <th style={th}>Threshold</th>
                <th style={{ ...th, textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {lowStock.map((product) => (
                <tr key={product.id}>
                  <td style={{ ...td, color: '#111B21', fontWeight: 500 }}>{product.name}</td>
                  <td style={td}>{product.unit}</td>
                  <td style={{ ...td, color: '#D97706', fontWeight: 600 }}>{product.stock_quantity}</td>
                  <td style={td}>{product.low_stock_threshold}</td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    <Link href={`/dashboard/products/${product.id}`} style={{ color: '#128C7E', fontSize: 13, textDecoration: 'none' }}>
                      Restock →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#111B21', margin: 0 }}>Stock movements</h2>
        <p style={{ fontSize: 13, color: '#667781', marginTop: 4 }}>
          Every change to stock — sales, restocks, manual edits, and cancellations — most recent first.
        </p>
      </div>

      <div
        style={{
          background: '#FFFFFF',
          border: '1px solid #E9EDEF',
          borderRadius: 12,
          padding: movementGroups.length === 0 ? 20 : 16,
          boxShadow: '0 1px 2px rgba(17,27,33,0.04)',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
        }}
      >
        {movementGroups.length === 0 ? (
          <p style={{ fontSize: 13, color: '#667781', margin: 0 }}>No stock movements recorded yet.</p>
        ) : (
          movementGroups.map((group) => (
            <div key={group.label} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#667781', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {group.label}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {group.items.map((m, i) => {
                  const productRef = m.products as { name: string } | { name: string }[] | null
                  const productName = Array.isArray(productRef) ? productRef[0]?.name : productRef?.name
                  const positive = m.quantity_delta > 0
                  return (
                    <div
                      key={m.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                        padding: '8px 4px',
                        borderTop: i > 0 ? '1px solid #F0F2F5' : 'none',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 13, color: '#111B21', fontWeight: 500 }}>{productName ?? 'Unknown product'}</div>
                        <div style={{ fontSize: 12, color: '#8696A0' }}>
                          {MOVEMENT_LABEL[m.movement_type] ?? m.movement_type} · {format(new Date(m.created_at), 'HH:mm')}
                          {m.notes ? ` · ${m.notes}` : ''}
                        </div>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: positive ? '#128C7E' : '#C0392B', whiteSpace: 'nowrap' }}>
                        {positive ? '+' : ''}
                        {m.quantity_delta}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 16px',
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.7px',
  color: '#667781',
  fontWeight: 600,
  borderBottom: '1px solid #E9EDEF',
}

const td: React.CSSProperties = {
  padding: '12px 16px',
  fontSize: 13,
  color: '#667781',
  borderBottom: '1px solid #F0F2F5',
}
