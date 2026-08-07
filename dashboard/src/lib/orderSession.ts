import { createHash } from 'crypto'

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
