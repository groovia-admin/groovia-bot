import Link from 'next/link'
import { PackageCheck } from 'lucide-react'
import { requireRole } from '@/lib/auth/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import EmptyState from '@/components/ui/EmptyState'

export const dynamic = 'force-dynamic'

export default async function InventoryPage() {
  const context = await requireRole(['owner', 'manager', 'staff'])

  if (context.kind === 'super_admin') {
    return <div style={{ background: '#FFFFFF', border: '1px solid var(--surface-border)', borderRadius: 12, padding: 20, color: 'var(--ink-muted)', fontSize: "var(--text-base)" }}>Not applicable for super admins.</div>
  }

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

      <p style={{ fontSize: "var(--text-base)", color: 'var(--ink-muted)' }}>
        {context.role === 'owner' || context.role === 'manager' ? (
          <>
            Looking for stock movement history (sales, restocks, manual edits)?{' '}
            <Link href="/dashboard/logs" style={{ color: 'var(--brand-dark)', textDecoration: 'none', fontWeight: 600 }}>
              It's moved to Logs →
            </Link>
          </>
        ) : (
          'Looking for stock movement history? Ask an owner or manager — it now lives in Logs.'
        )}
      </p>
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
