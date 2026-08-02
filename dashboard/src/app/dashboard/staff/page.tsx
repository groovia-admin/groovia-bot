import { requireRole } from '@/lib/auth/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import StaffClient from '@/components/staff/StaffClient'

export const dynamic = 'force-dynamic'

export default async function StaffPage() {
  const context = await requireRole(['owner'])

  // Super admins have no shop of their own to manage staff for.
  if (context.kind === 'super_admin') {
    return <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">Not applicable for super admins.</div>
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
