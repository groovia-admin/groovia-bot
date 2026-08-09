import { requireRole } from '@/lib/auth/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import CustomersClient from '@/components/customers/CustomersClient'

export const dynamic = 'force-dynamic'

export default async function CustomersPage() {
  const context = await requireRole(['owner', 'manager'])

  if (context.kind !== 'shop_user') {
    return <div style={{ background: '#FFFFFF', border: '1px solid var(--surface-border)', borderRadius: 12, padding: 20, color: 'var(--ink-muted)', fontSize: 13 }}>Not applicable for super admins.</div>
  }

  const adminClient = createAdminClient()

  const { data: customers, error } = await adminClient
    .from('customers')
    .select('id, full_name, phone, email, total_orders, total_spent, outstanding_credit, last_order_at, is_active, created_at')
    .eq('shop_id', context.shopId)
    .order('last_order_at', { ascending: false, nullsFirst: false })
    .limit(500)

  if (error) {
    console.error('Failed to load customers:', error)
  }

  return <CustomersClient initialCustomers={customers ?? []} showRevenue={context.role === 'owner'} />
}
