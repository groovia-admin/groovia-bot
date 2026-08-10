import Link from 'next/link'
import { format, isToday, isYesterday } from 'date-fns'
import { PackageCheck, Boxes } from 'lucide-react'
import { requireRole } from '@/lib/auth/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import EmptyState from '@/components/ui/EmptyState'

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
    return <div style={{ background: '#FFFFFF', border: '1px solid var(--surface-border)', borderRadius: 12, padding: 20, color: 'var(--ink-muted)', fontSize: "var(--text-base)" }}>Not applicable for super admins.</div>
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
        <h1 style={{ fontSize: "var(--text-xl)", fontWeight: 800, color: 'var(--ink)', margin: 0 }}>Inventory</h1>
        <p style={{ fontSize: "var(--text-base)", color: 'var(--ink-muted)', marginTop: 4 }}>
          Products at or below their low-stock threshold.
        </p>
      </div>

      <div
        style={{
          background: '#FFFFFF',
          border: '1px solid var(--surface-border)',
          borderRadius: 12,
          padding: 0,
          overflow: 'hidden',
          boxShadow: '0 1px 2px rgba(11,28,48,0.04)',
        }}
      >
        {lowStock.length === 0 ? (
          <EmptyState icon={PackageCheck} title="Nothing low on stock" description="Every available product is above its low-stock threshold." compact />
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
                  <td style={{ ...td, color: 'var(--ink)', fontWeight: 500 }}>{product.name}</td>
                  <td style={td}>{product.unit}</td>
                  <td style={{ ...td, color: '#D97706', fontWeight: 600 }}>{product.stock_quantity}</td>
                  <td style={td}>{product.low_stock_threshold}</td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    <Link href={`/dashboard/products/${product.id}`} style={{ color: 'var(--brand-dark)', fontSize: "var(--text-base)", textDecoration: 'none' }}>
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
        <h2 style={{ fontSize: "var(--text-md)", fontWeight: 700, color: 'var(--ink)', margin: 0 }}>Stock movements</h2>
        <p style={{ fontSize: "var(--text-base)", color: 'var(--ink-muted)', marginTop: 4 }}>
          Every change to stock — sales, restocks, manual edits, and cancellations — most recent first.
        </p>
      </div>

      <div
        style={{
          background: '#FFFFFF',
          border: '1px solid var(--surface-border)',
          borderRadius: 12,
          padding: movementGroups.length === 0 ? 20 : 16,
          boxShadow: '0 1px 2px rgba(11,28,48,0.04)',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
        }}
      >
        {movementGroups.length === 0 ? (
          <EmptyState icon={Boxes} title="No stock movements yet" description="Sales, restocks, and manual edits will show up here." compact />
        ) : (
          movementGroups.map((group) => (
            <div key={group.label} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
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
                        borderTop: i > 0 ? '1px solid var(--surface)' : 'none',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: "var(--text-base)", color: 'var(--ink)', fontWeight: 500 }}>{productName ?? 'Unknown product'}</div>
                        <div style={{ fontSize: "var(--text-sm)", color: 'var(--ink-faint)' }}>
                          {MOVEMENT_LABEL[m.movement_type] ?? m.movement_type} · {format(new Date(m.created_at), 'HH:mm')}
                          {m.notes ? ` · ${m.notes}` : ''}
                        </div>
                      </div>
                      <div style={{ fontSize: "var(--text-base)", fontWeight: 700, color: positive ? 'var(--brand-dark)' : 'var(--error)', whiteSpace: 'nowrap' }}>
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
  fontSize: "var(--text-xs)",
  textTransform: 'uppercase',
  letterSpacing: '0.7px',
  color: 'var(--ink-muted)',
  fontWeight: 600,
  borderBottom: '1px solid var(--surface-border)',
}

const td: React.CSSProperties = {
  padding: '12px 16px',
  fontSize: "var(--text-base)",
  color: 'var(--ink-muted)',
  borderBottom: '1px solid var(--surface)',
}
