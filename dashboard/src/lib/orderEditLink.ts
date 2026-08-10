import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

// Mirrors lib/orderSession.ts's hashing scheme exactly (plain SHA-256,
// no secret) and wa-bot/src/services/orderEditor.js's createEditLink,
// which is what actually mints these tokens. wa-bot and this dashboard
// are separate deployments with no shared module, so this is a second
// copy of the same scheme kept in sync by hand — same tradeoff already
// accepted for order_sessions.
function hashEditToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export type OrderEditLink = {
  id: string
  order_id: string
  shop_id: string
  expires_at: string
}

/**
 * Validates a staff order-edit link: token must hash-match a row for
 * this specific orderId and not be past its expiry. Returns null for
 * every failure case (wrong order, unknown token, expired) rather than
 * distinguishing them, same "don't leak which case it was" reasoning as
 * the customer webview's session validation.
 */
export async function validateEditLink(
  adminClient: SupabaseClient,
  orderId: string,
  token: string | undefined
): Promise<OrderEditLink | null> {
  if (!token) return null

  const tokenHash = hashEditToken(token)

  const { data, error } = await adminClient
    .from('order_edit_links')
    .select('id, order_id, shop_id, expires_at')
    .eq('token_hash', tokenHash)
    .eq('order_id', orderId)
    .maybeSingle()

  if (error || !data) return null
  if (new Date(data.expires_at).getTime() < Date.now()) return null

  return data
}
