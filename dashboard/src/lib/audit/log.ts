import { createAdminClient } from '@/lib/supabase/admin'
import type { ActorType } from '@/types/database'

type LogAuditEventParams = {
  shopId: string | null
  actorUserId: string | null
  actorType: ActorType
  action: string
  entityType: string
  entityId?: string | null
  oldValues?: Record<string, unknown> | null
  newValues?: Record<string, unknown> | null
  metadata?: Record<string, unknown>
}

/**
 * Fire-and-forget audit trail write. Never throws — a logging failure must
 * not block the mutation it's describing, so errors are only console.error'd.
 */
export async function logAuditEvent(params: LogAuditEventParams): Promise<void> {
  const adminClient = createAdminClient()

  const { error } = await adminClient.from('audit_logs').insert({
    shop_id: params.shopId,
    actor_user_id: params.actorUserId,
    actor_type: params.actorType,
    action: params.action,
    entity_type: params.entityType,
    entity_id: params.entityId ?? null,
    old_values: params.oldValues ?? null,
    new_values: params.newValues ?? null,
    metadata: params.metadata ?? {},
  })

  if (error) {
    console.error('Failed to write audit log:', error)
  }
}
