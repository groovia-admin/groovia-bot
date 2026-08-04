import { requireRole } from '@/lib/auth/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import LogsClient from '@/components/logs/LogsClient'

export const dynamic = 'force-dynamic'

export default async function LogsPage() {
  // Super admins see platform-wide audit logs; owners/managers see their
  // own shop's activity log. Staff has no access (matches Sidebar nav).
  const context = await requireRole(['owner', 'manager'])

  const adminClient = createAdminClient()

  const baseQuery = adminClient
    .from('audit_logs')
    .select(
      'id, shop_id, actor_type, action, entity_type, entity_id, old_values, new_values, metadata, created_at, shops ( name )'
    )
    .order('created_at', { ascending: false })
    .limit(200)

  const { data: logs, error } =
    context.kind === 'super_admin'
      ? await baseQuery
      : await baseQuery.eq('shop_id', context.shopId)

  if (error) {
    console.error('Failed to load audit logs:', error)
  }

  const rows = (logs ?? []).map((log) => {
    const shop = Array.isArray(log.shops) ? log.shops[0] : log.shops
    return {
      id: log.id,
      shop_id: log.shop_id,
      shop_name: shop?.name ?? null,
      actor_type: log.actor_type,
      action: log.action,
      entity_type: log.entity_type,
      entity_id: log.entity_id,
      old_values: log.old_values,
      new_values: log.new_values,
      metadata: log.metadata,
      created_at: log.created_at,
    }
  })

  return <LogsClient initialLogs={rows} showShopColumn={context.kind === 'super_admin'} />
}
