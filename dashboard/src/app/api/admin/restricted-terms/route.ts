import { NextResponse } from 'next/server'
import { requirePlatformAdmin } from '@/lib/auth/require-platform-admin'
import { logAuditEvent } from '@/lib/audit/log'

// Platform-wide restricted-product-name list — super admin only. See
// dashboard/src/lib/restrictedProducts.ts for where this is enforced
// (shop product creation) and the migration for why RLS has no
// policies here (service-role-only access, same as platform_admins).
export async function GET() {
  const authorization = await requirePlatformAdmin()
  if ('error' in authorization) return authorization.error

  const { adminClient } = authorization

  const { data: terms, error } = await adminClient
    .from('restricted_product_terms')
    .select('id, term, created_at')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Failed to load restricted terms:', error)
    return NextResponse.json({ error: 'Failed to load restricted terms' }, { status: 500 })
  }

  return NextResponse.json(
    { terms: terms ?? [] },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  )
}

export async function POST(request: Request) {
  const authorization = await requirePlatformAdmin()
  if ('error' in authorization) return authorization.error

  const { adminClient, userId, actorName } = authorization

  let body: { term?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const term = typeof body.term === 'string' ? body.term.trim() : ''
  if (!term) {
    return NextResponse.json({ error: 'Term is required' }, { status: 400 })
  }

  const { data: created, error } = await adminClient
    .from('restricted_product_terms')
    .insert({ term, created_by: userId })
    .select('id, term, created_at')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: `"${term}" is already on the list` }, { status: 409 })
    }
    console.error('Failed to add restricted term:', error)
    return NextResponse.json({ error: 'Failed to add restricted term' }, { status: 500 })
  }

  await logAuditEvent({
    shopId: null,
    actorUserId: userId,
    actorType: 'super_admin',
    action: 'restricted_term.added',
    entityType: 'restricted_product_term',
    entityId: created.id,
    newValues: { term },
    metadata: { actor_name: actorName },
  })

  return NextResponse.json(
    { success: true, term: created },
    { status: 201, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  )
}
