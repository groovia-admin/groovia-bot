import { NextResponse } from 'next/server'
import { requirePlatformAdmin } from '@/lib/auth/require-platform-admin'
import { logAuditEvent } from '@/lib/audit/log'
import { FLAG_DEFINITIONS, FLAG_KEYS } from '@/lib/featureFlags'

type RouteContext = {
  params: Promise<{ id: string }>
}

// Per-shop feature flags, controlled by Super Admin only — a shop owner
// has no visibility into or control over these. Backed by dedicated
// boolean columns on shop_settings (see FLAG_DEFINITIONS), not a shop-
// facing settings surface.
export async function GET(_request: Request, { params }: RouteContext) {
  const authorization = await requirePlatformAdmin()

  if ('error' in authorization) {
    return authorization.error
  }

  const { adminClient } = authorization
  const { id: shopId } = await params

  const { data: settings, error } = await adminClient
    .from('shop_settings')
    .select(FLAG_KEYS.join(', '))
    .eq('shop_id', shopId)
    .maybeSingle()

  if (error) {
    console.error('Failed to load feature flags:', error)
    return NextResponse.json({ error: 'Failed to load feature flags' }, { status: 500 })
  }

  // A shop predating shop_settings auto-seeding could still have no row —
  // every flag defaults to off in that case, matching the column defaults.
  const flags = settings ?? Object.fromEntries(FLAG_KEYS.map((key) => [key, false]))

  return NextResponse.json(
    { flags },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  )
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const authorization = await requirePlatformAdmin()

  if ('error' in authorization) {
    return authorization.error
  }

  const { adminClient, userId, actorName } = authorization
  const { id: shopId } = await params

  let body: Record<string, unknown>

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const changes: Record<string, boolean> = {}
  for (const flag of FLAG_DEFINITIONS) {
    if (Object.prototype.hasOwnProperty.call(body, flag.key)) {
      if (typeof body[flag.key] !== 'boolean') {
        return NextResponse.json({ error: `${flag.label} must be true or false` }, { status: 400 })
      }
      changes[flag.key] = body[flag.key] as boolean
    }
  }

  if (Object.keys(changes).length === 0) {
    return NextResponse.json({ error: 'No changes provided' }, { status: 400 })
  }

  const { data: shop, error: shopError } = await adminClient
    .from('shops')
    .select('id, name')
    .eq('id', shopId)
    .maybeSingle()

  if (shopError) {
    console.error('Shop lookup failed:', shopError)
    return NextResponse.json({ error: 'Failed to update feature flags' }, { status: 500 })
  }

  if (!shop) {
    return NextResponse.json({ error: 'Shop not found' }, { status: 404 })
  }

  // Upsert rather than update — shop_settings is seeded at creation time
  // going forward, but a shop that predates that (or an unlikely missed
  // insert) shouldn't make flipping a flag fail outright.
  const { data: updated, error } = await adminClient
    .from('shop_settings')
    .upsert({ shop_id: shopId, ...changes }, { onConflict: 'shop_id' })
    .select(FLAG_KEYS.join(', '))
    .single()

  if (error) {
    console.error('Failed to update feature flags:', error)
    return NextResponse.json({ error: 'Failed to update feature flags' }, { status: 500 })
  }

  await logAuditEvent({
    shopId,
    actorUserId: userId,
    actorType: 'super_admin',
    action: 'shop.feature_flags_updated',
    entityType: 'shop',
    entityId: shopId,
    newValues: changes,
    metadata: { actor_name: actorName, target_name: shop.name },
  })

  return NextResponse.json(
    { flags: updated },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  )
}
