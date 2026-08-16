import { NextResponse } from 'next/server'
import { requirePlatformAdmin } from '@/lib/auth/require-platform-admin'
import { logAuditEvent } from '@/lib/audit/log'

type RouteContext = {
  params: Promise<{ id: string }>
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
