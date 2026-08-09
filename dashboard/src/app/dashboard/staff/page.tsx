import { requireRole } from '@/lib/auth/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import StaffClient from '@/components/staff/StaffClient'

export const dynamic = 'force-dynamic'

export default async function StaffPage() {
  const context = await requireRole(['owner'])

  // Super admins have no shop of their own to manage staff for.
  if (context.kind === 'super_admin') {
    return <div style={{ background: '#FFFFFF', border: '1px solid var(--surface-border)', borderRadius: 12, padding: 20, color: 'var(--ink-muted)', fontSize: 13 }}>Not applicable for super admins.</div>
  }

  const adminClient = createAdminClient()

  const { data: staff, error } = await adminClient
    .from('shop_users')
    .select('id, full_name, phone_number, role, is_active, permissions, created_at')
    .eq('shop_id', context.shopId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Failed to load staff:', error)
  }

  return <StaffClient initialStaff={staff ?? []} />
}
