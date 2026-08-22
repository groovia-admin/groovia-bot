import { requireRole } from '@/lib/auth/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import LogsClient from '@/components/logs/LogsClient'

export const dynamic = 'force-dynamic'

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  // Super admins see platform-wide audit logs; owners/managers see their
  // own shop's activity log. Staff has no access (matches Sidebar nav).
  const context = await requireRole(['owner', 'manager'])
  const { from, to } = await searchParams

  const adminClient = createAdminClient()

  // Previously a flat .limit(200) with no date awareness at all — a
  // search for something older than the 200th-most-recent event
  // platform-wide silently found nothing, since that row was never
  // fetched from the server in the first place. Once a date range is
  // active, query it for real instead of relying on the row cap: widened
  // by a day on each side (comfortably covers any timezone offset
  // between the UTC-stored boundary and a browser's local calendar day),
  // then LogsClient trims to the exact local day using the same
  // formatting the "When" column displays with.
  const hasDateFilter = Boolean(from || to)
  let baseQuery = adminClient
    .from('audit_logs')
    .select(
      'id, shop_id, actor_type, action, entity_type, entity_id, old_values, new_values, metadata, created_at, shops ( name )'
    )
    .order('created_at', { ascending: false })

  if (from) {
    baseQuery = baseQuery.gte('created_at', new Date(Date.parse(from) - 24 * 60 * 60 * 1000).toISOString())
  }
  if (to) {
    baseQuery = baseQuery.lt('created_at', new Date(Date.parse(to) + 2 * 24 * 60 * 60 * 1000).toISOString())
  }

  // No date filter: keep the fast default view capped at 200. A date
  // filter is a real, bounded query already — no need for a row cap on
  // top of it, just a generous safety ceiling.
  baseQuery = baseQuery.limit(hasDateFilter ? 2000 : 200)

  const isSuperAdmin = context.kind === 'super_admin'

  const [{ data: logs, error }, shopsResult, movementsResult] = await Promise.all([
    // Owners/managers see only their own shop's actors — platform-admin
    // actions (e.g. a super admin changing this shop's subscription) stay
    // out of the tenant-facing log, even when they touched this shop_id.
    isSuperAdmin
      ? baseQuery
      : baseQuery.eq('shop_id', context.shopId).neq('actor_type', 'super_admin'),
    isSuperAdmin
      ? adminClient.from('shops').select('id, name').order('name', { ascending: true })
      : Promise.resolve({ data: null, error: null }),
    // Stock movements live here now instead of on the Inventory page —
    // shop-scoped only, same as the activity log itself.
    isSuperAdmin
      ? Promise.resolve({ data: null, error: null })
      : adminClient
          .from('inventory_movements')
          .select('id, quantity_delta, movement_type, notes, created_at, products ( name )')
          .eq('shop_id', context.shopId)
          .order('created_at', { ascending: false })
          .limit(200),
  ])

  if (error) {
    console.error('Failed to load audit logs:', error)
  }

  if (shopsResult.error) {
    console.error('Failed to load shops for log filter:', shopsResult.error)
  }

  if (movementsResult.error) {
    console.error('Failed to load inventory movements:', movementsResult.error)
  }

  const movementRows = (movementsResult.data ?? []).map((m) => {
    const productRef = m.products as { name: string } | { name: string }[] | null
    const productName = Array.isArray(productRef) ? productRef[0]?.name : productRef?.name
    return {
      id: m.id,
      product_name: productName ?? null,
      quantity_delta: m.quantity_delta,
      movement_type: m.movement_type,
      notes: m.notes,
      created_at: m.created_at,
    }
  })

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

  return (
    <LogsClient
      initialLogs={rows}
      showShopColumn={isSuperAdmin}
      shops={isSuperAdmin ? (shopsResult.data ?? []) : null}
      movements={isSuperAdmin ? null : movementRows}
      truncated={!hasDateFilter && rows.length === 200}
    />
  )
}
