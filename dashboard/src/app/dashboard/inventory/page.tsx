import Link from 'next/link'
import { requireRole } from '@/lib/auth/require-role'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export default async function InventoryPage() {
  const context = await requireRole(['owner', 'manager', 'staff'])

  if (context.kind === 'super_admin') {
    return <div style={{ background: '#FFFFFF', border: '1px solid #E9EDEF', borderRadius: 12, padding: 20, color: '#667781', fontSize: 13 }}>Not applicable for super admins.</div>
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
