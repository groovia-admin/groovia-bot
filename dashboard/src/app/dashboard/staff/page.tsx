import { requireRole } from '@/lib/auth/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import StaffClient from '@/components/staff/StaffClient'

export const dynamic = 'force-dynamic'

export default async function StaffPage() {
  const context = await requireRole(['owner'])

  // Super admins have no shop of their own to manage staff for.
  if (context.kind === 'super_admin') {
    return <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: 20, color: '#94a3b8', fontSize: 13 }}>Not applicable for super admins.</div>
  }

  const adminClient = createAdminClient()

  const { data: staff, error } = await adminClient
    .from('shop_users')
    .select('id, full_name, phone_number, role, is_active, created_at')
    .eq('shop_id', context.shopId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Failed to load staff:', error)
  }

  return <StaffClient initialStaff={staff ?? []} />
}
