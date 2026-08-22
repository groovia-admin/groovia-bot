import { NextResponse } from 'next/server'
import { requirePlatformAdmin } from '@/lib/auth/require-platform-admin'
import { logAuditEvent } from '@/lib/audit/log'

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const authorization = await requirePlatformAdmin()
  if ('error' in authorization) return authorization.error

  const { adminClient, userId, actorName } = authorization
  const { id } = await params

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

  const { data: existing, error: fetchError } = await adminClient
    .from('restricted_product_terms')
    .select('id, term')
    .eq('id', id)
    .maybeSingle()

  if (fetchError) {
    console.error('Failed to load restricted term:', fetchError)
    return NextResponse.json({ error: 'Failed to update term' }, { status: 500 })
  }
  if (!existing) {
    return NextResponse.json({ error: 'Term not found' }, { status: 404 })
  }

  const { data: updated, error } = await adminClient
    .from('restricted_product_terms')
    .update({ term })
    .eq('id', id)
    .select('id, term, created_at')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: `"${term}" is already on the list` }, { status: 409 })
    }
    console.error('Failed to update restricted term:', error)
    return NextResponse.json({ error: 'Failed to update term' }, { status: 500 })
  }

  await logAuditEvent({
    shopId: null,
    actorUserId: userId,
    actorType: 'super_admin',
    action: 'restricted_term.updated',
    entityType: 'restricted_product_term',
    entityId: id,
    oldValues: { term: existing.term },
    newValues: { term },
    metadata: { actor_name: actorName },
  })

  return NextResponse.json(
    { success: true, term: updated },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  )
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const authorization = await requirePlatformAdmin()
  if ('error' in authorization) return authorization.error

  const { adminClient, userId, actorName } = authorization
  const { id } = await params

  const { data: term, error: fetchError } = await adminClient
    .from('restricted_product_terms')
    .select('id, term')
    .eq('id', id)
    .maybeSingle()

  if (fetchError) {
    console.error('Failed to load restricted term:', fetchError)
    return NextResponse.json({ error: 'Failed to remove term' }, { status: 500 })
  }
  if (!term) {
    return NextResponse.json({ error: 'Term not found' }, { status: 404 })
  }

  const { error } = await adminClient.from('restricted_product_terms').delete().eq('id', id)

  if (error) {
    console.error('Failed to remove restricted term:', error)
    return NextResponse.json({ error: 'Failed to remove term' }, { status: 500 })
  }

  await logAuditEvent({
    shopId: null,
    actorUserId: userId,
    actorType: 'super_admin',
    action: 'restricted_term.removed',
    entityType: 'restricted_product_term',
    entityId: id,
    oldValues: { term: term.term },
    metadata: { actor_name: actorName },
  })

  return NextResponse.json({ success: true })
}
