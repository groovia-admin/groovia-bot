import { NextResponse } from 'next/server'
import { requireShopRole } from '@/lib/auth/require-shop-role'
import { logAuditEvent } from '@/lib/audit/log'

// Same set of columns the WhatsApp welcome message now reads
// (shopResolver.js resolveShopByPhoneNumberId/findShopBySlug) — keeping
// this route's shape in sync with that is what lets an owner see and
// edit exactly what a customer will be shown.
const PROFILE_COLUMNS = 'id, name, description, area, address_line_1, address_line_2, city, state, postal_code'

type UpdateProfileBody = Record<string, unknown>

function isNullableString(v: unknown): v is string | null {
  return v === null || typeof v === 'string'
}

export async function GET() {
  const authorization = await requireShopRole(['owner', 'manager'])

  if ('error' in authorization) {
    return authorization.error
  }

  const { adminClient, shopId } = authorization

  const { data: shop, error } = await adminClient
    .from('shops')
    .select(PROFILE_COLUMNS)
    .eq('id', shopId)
    .maybeSingle()

  if (error) {
    console.error('Failed to load shop profile:', error)
    return NextResponse.json({ error: 'Failed to load shop profile' }, { status: 500 })
  }

  return NextResponse.json(
    { shop },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  )
}

export async function PATCH(request: Request) {
  // Branding/identity, same bar as the logo upload above — an owner-level
  // decision, not a day-to-day staff task.
  const authorization = await requireShopRole(['owner'])

  if ('error' in authorization) {
    return authorization.error
  }

  const { adminClient, shopId, userId, actorName, role } = authorization

  let body: UpdateProfileBody

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key)
  const changes: Record<string, unknown> = {}

  if (has('name')) {
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      return NextResponse.json({ error: 'Shop name cannot be empty' }, { status: 400 })
    }
    changes.name = body.name.trim()
  }

  const nullableStringFields = ['description', 'area', 'address_line_1', 'address_line_2', 'city', 'state', 'postal_code']
  for (const field of nullableStringFields) {
    if (has(field)) {
      if (!isNullableString(body[field])) {
        return NextResponse.json({ error: `${field} must be a string or null` }, { status: 400 })
      }
      const value = body[field]
      changes[field] = typeof value === 'string' ? (value.trim() || null) : value
    }
  }

  if (Object.keys(changes).length === 0) {
    return NextResponse.json({ error: 'Provide at least one field to update' }, { status: 400 })
  }

  const { data: shop, error } = await adminClient
    .from('shops')
    .update(changes)
    .eq('id', shopId)
    .select(PROFILE_COLUMNS)
    .single()

  if (error) {
    console.error('Failed to save shop profile:', error)
    return NextResponse.json({ error: 'Failed to save shop profile' }, { status: 500 })
  }

  await logAuditEvent({
    shopId,
    actorUserId: userId,
    actorType: role,
    action: 'shop.profile_updated',
    entityType: 'shop',
    entityId: shopId,
    newValues: changes,
    metadata: { actor_name: actorName },
  })

  return NextResponse.json(
    { success: true, shop },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  )
}
