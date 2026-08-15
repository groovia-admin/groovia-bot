import { requireRole } from '@/lib/auth/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import StaffClient from '@/components/staff/StaffClient'

export const dynamic = 'force-dynamic'

export default async function StaffPage() {
  const context = await requireRole(['owner'])

  // Super admins have no shop of their own to manage staff for.
  if (context.kind === 'super_admin') {
    return <div style={{ background: '#FFFFFF', border: '1px solid var(--surface-border)', borderRadius: 12, padding: 20, color: 'var(--ink-muted)', fontSize: "var(--text-base)" }}>Not applicable for super admins.</div>
  }

  const adminClient = createAdminClient()

  const [{ data: staff, error }, { data: staffLogsRaw, error: logsError }] = await Promise.all([
    adminClient
      .from('shop_users')
      .select('id, full_name, phone_number, role, is_active, permissions, created_at')
      .eq('shop_id', context.shopId)
      .order('created_at', { ascending: false }),
    adminClient
      .from('audit_logs')
      .select('id, action, metadata, created_at')
      .eq('shop_id', context.shopId)
      .eq('entity_type', 'shop_user')
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  if (error) {
    console.error('Failed to load staff:', error)
  }
  if (logsError) {
    console.error('Failed to load staff logs:', logsError)
  }

  const staffLogs = (staffLogsRaw ?? []).map((log) => {
    const metadata = (log.metadata ?? {}) as { actor_name?: string; target_name?: string }
    return {
      id: log.id,
      action: log.action,
      actor_name: metadata.actor_name ?? null,
      target_name: metadata.target_name ?? null,
      created_at: log.created_at,
    }
  })

  return <StaffClient initialStaff={staff ?? []} staffLogs={staffLogs} />
}
