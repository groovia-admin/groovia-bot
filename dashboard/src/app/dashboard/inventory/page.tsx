import Link from 'next/link'
import { format } from 'date-fns'
import { PackageCheck, ScrollText, Boxes } from 'lucide-react'
import { requireRole } from '@/lib/auth/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import EmptyState from '@/components/ui/EmptyState'
import { S } from '@/lib/ui/dashboardStyles'

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

export default async function InventoryPage() {
  const context = await requireRole(['owner', 'manager', 'staff'])

  if (context.kind === 'super_admin') {
    return <div style={{ background: '#FFFFFF', border: '1px solid var(--surface-border)', borderRadius: 12, padding: 20, color: 'var(--ink-muted)', fontSize: "var(--text-base)" }}>Not applicable for super admins.</div>
  }

  const canSeeLogs = context.role === 'owner' || context.role === 'manager'
  const adminClient = createAdminClient()

  const { data: products, error } = await adminClient
    .from('products')
    .select('id, name, unit, stock_quantity, low_stock_threshold')
    .eq('shop_id', context.shopId)
    .eq('is_available', true)

  if (error) {
    console.error('Failed to load inventory:', error)
  }

  // Column-to-column comparison isn't expressible via the query builder's
  // simple filters, so filter here — fine at this catalog scale.
  const lowStock = (products ?? []).filter((p) => p.stock_quantity <= p.low_stock_threshold)

  let movements: { id: string; quantity_delta: number; movement_type: string; created_at: string; product_name: string | null }[] = []
  if (canSeeLogs) {
    const { data: recentMovements } = await adminClient
      .from('inventory_movements')
      .select('id, quantity_delta, movement_type, notes, created_at, products ( name )')
      .eq('shop_id', context.shopId)
      .order('created_at', { ascending: false })
      .limit(5)

    movements = (recentMovements ?? []).map((m) => {
      const productRef = m.products as { name: string } | { name: string }[] | null
      const productName = Array.isArray(productRef) ? productRef[0]?.name : productRef?.name
      return {
        id: m.id,
        quantity_delta: m.quantity_delta,
        movement_type: m.movement_type,
        created_at: m.created_at,
        product_name: productName ?? null,
      }
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: "var(--text-xl)", fontWeight: 800, color: 'var(--ink)', margin: 0 }}>Inventory</h1>
          <p style={{ fontSize: "var(--text-base)", color: 'var(--ink-muted)', marginTop: 4 }}>
            Products at or below their low-stock threshold.
          </p>
        </div>
        {canSeeLogs && (
          <Link href="/dashboard/logs" style={{ ...S.btn('var(--surface)', 'var(--ink)'), border: '1px solid var(--surface-border)', textDecoration: 'none' }}>
            <ScrollText size={15} />
            View logs
          </Link>
        )}
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
                    <Link href={`/dashboard/products?edit=${product.id}`} style={{ color: 'var(--brand-dark)', fontSize: "var(--text-base)", textDecoration: 'none' }}>
                      Restock →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {canSeeLogs && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <h2 style={{ fontSize: "var(--text-md)", fontWeight: 700, color: 'var(--ink)', margin: 0 }}>Recent stock changes</h2>
            <Link href="/dashboard/logs" style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: 'var(--brand-dark)', textDecoration: 'none' }}>
              View all →
            </Link>
          </div>
          {movements.length === 0 ? (
            <div style={S.card}>
              <EmptyState icon={Boxes} title="No stock movements yet" description="Sales, restocks, and manual edits will show up here." compact />
            </div>
          ) : (
            <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={S.th}>When</th>
                    <th style={S.th}>Product</th>
                    <th style={S.th}>Type</th>
                    <th style={{ ...S.th, textAlign: 'right' }}>Change</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m) => {
                    const positive = m.quantity_delta > 0
                    return (
                      <tr key={m.id}>
                        <td style={{ ...S.td, whiteSpace: 'nowrap', color: 'var(--ink-muted)' }}>
                          {format(new Date(m.created_at), 'MMM d, HH:mm')}
                        </td>
                        <td style={{ ...S.td, color: 'var(--ink)' }}>{m.product_name ?? 'Unknown product'}</td>
                        <td style={S.td}>{MOVEMENT_LABEL[m.movement_type] ?? m.movement_type}</td>
                        <td style={{ ...S.td, textAlign: 'right', fontWeight: 700, color: positive ? 'var(--brand-dark)' : 'var(--error)', whiteSpace: 'nowrap' }}>
                          {positive ? '+' : ''}{m.quantity_delta}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
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
