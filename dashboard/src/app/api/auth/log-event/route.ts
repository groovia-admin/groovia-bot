import { NextResponse } from 'next/server'
import { getViewerContext } from '@/lib/auth/viewer-context'
import { logAuditEvent } from '@/lib/audit/log'

type LogEventBody = {
  event?: unknown
  method?: unknown
}

// Called explicitly by the client right after a successful sign-in, and
// right before sign-out (while the session is still valid — signOut()
// clears the cookies this route needs to identify who's logging out).
export async function POST(request: Request) {
  let body: LogEventBody

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (body.event !== 'login' && body.event !== 'logout') {
    return NextResponse.json({ error: 'event must be "login" or "logout"' }, { status: 400 })
  }

  const method = typeof body.method === 'string' ? body.method : undefined

  const context = await getViewerContext()

  if (context.kind === 'unauthenticated') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const shopId = context.kind === 'shop_user' ? context.shopId : null
  const actorType = context.kind === 'super_admin' ? 'super_admin' : context.role
  const actorName = context.kind === 'super_admin' ? 'Super Admin' : context.fullName

  await logAuditEvent({
    shopId,
    actorUserId: context.userId,
    actorType,
    action: body.event === 'login' ? 'auth.login' : 'auth.logout',
    entityType: 'session',
    metadata: { actor_name: actorName, ...(method ? { method } : {}) },
  })

  return NextResponse.json({ success: true })
}
