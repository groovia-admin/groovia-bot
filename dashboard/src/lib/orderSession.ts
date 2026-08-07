import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CartSnapshot } from './storefront/types'

// Server-only (imports Node's crypto) — API routes import from here.
// Plain types shared with client components live in
// lib/storefront/types.ts instead, which has no server-only imports.
//
// Shared between every /api/public/session/* route. wa-bot and this
// dashboard are separate deployments with no shared module, so this
// mirrors wa-bot/src/services/sessionService.js's hashing scheme (plain
// SHA-256, no secret) rather than importing it — keep both in sync if
// either ever changes. Only the hash is ever looked up: nothing stored
// in order_sessions can mint a valid session on its own.
export function hashSessionToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export const SESSION_TTL_MS = 30 * 60 * 1000

export type { CartItem, CartSnapshot } from './storefront/types'

export type ConsumedOrderSession = {
  id: string
  shop_id: string
  customer_phone: string
  cart_snapshot: CartSnapshot
}

/**
 * Mirrors wa-bot's consumeSession: flips status -> 'consumed' so the
 * same token can never place a second order, checking status='active'
 * AND not-yet-expired as part of the same atomic update rather than a
 * separate read-then-write — a session that expired between the
 * customer's last page load and their submit can't sneak an order
 * through just because nothing had called the resolve endpoint since to
 * flip it to 'expired'. Returns null if it wasn't a live active session;
 * callers must reject the submission, not proceed.
 */
export async function consumeOrderSession(
  adminClient: SupabaseClient,
  token: string
): Promise<ConsumedOrderSession | null> {
  const tokenHash = hashSessionToken(token)

  const { data, error } = await adminClient
    .from('order_sessions')
    .update({ status: 'consumed', updated_at: new Date().toISOString() })
    .eq('token_hash', tokenHash)
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())
    .select('id, shop_id, customer_phone, cart_snapshot')
    .maybeSingle()

  if (error) {
    console.error('Failed to consume order session:', error)
    return null
  }

  return data
}
