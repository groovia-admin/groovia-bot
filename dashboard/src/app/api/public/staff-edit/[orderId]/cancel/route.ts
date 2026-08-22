import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { validateEditLink } from '@/lib/orderEditLink'
import { logAuditEvent } from '@/lib/audit/log'
import { adjustOrderStock } from '@/lib/orderStock'
import { notifyWaBot } from '@/lib/notifyWaBot'

type CancelRouteContext = {
  params: Promise<{ orderId: string }>
}

type CancelBody = {
  token?: unknown
  reason?: unknown
}

// Token-authenticated twin of the WhatsApp CANCEL command
// (messageHandler.js handleOrderCommand) — same rules: only an already-
// accepted order can be cancelled here (a still-pending one has REJECT
// for that, sent with the original Accept/Reject/Edit alert, not this
// edit screen), a reason is required since the customer already
// believes the order is being prepared, and stock gets restored the
// same way it was decremented on accept.
export async function POST(request: Request, { params }: CancelRouteContext) {
  const { orderId } = await params

  let body: CancelBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const token = typeof body.token === 'string' ? body.token : undefined
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''

  if (!reason) {
    return NextResponse.json({ error: 'A reason is required so the customer knows why.' }, { status: 400 })
  }

  const adminClient = createAdminClient()
  const link = await validateEditLink(adminClient, orderId, token)
  if (!link) {
    return NextResponse.json({ error: 'This edit link has expired.' }, { status: 401 })
  }

  const { data: order, error } = await adminClient
    .from('orders')
    .select('order_number, status')
    .eq('id', orderId)
    .eq('shop_id', link.shop_id)
    .maybeSingle()

  if (error || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  if (order.status !== 'accepted') {
    return NextResponse.json(
      { error: `Order can't be cancelled from here (currently ${order.status}).` },
      { status: 409 }
    )
  }

  // Checked via .select() + null rather than trusting "no error" — a
  // zero-row match (e.g. staff already cancelled/completed it via
  // WhatsApp in the moment between the read above and this write) still
  // returns success, and without this check the request would go on to
  // restore stock and send cancel notifications for a transition it
  // didn't actually cause.
  const { data: cancelledRow, error: cancelError } = await adminClient
    .from('orders')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancellation_reason: reason })
    .eq('id', orderId)
    .eq('status', 'accepted')
    .select('id')
    .maybeSingle()

  if (cancelError) {
    console.error('Failed to cancel order:', cancelError)
    return NextResponse.json({ error: 'Failed to cancel order' }, { status: 500 })
  }

  if (!cancelledRow) {
    return NextResponse.json(
      { error: 'This order was already updated by someone else — refresh to see its current status.' },
      { status: 409 }
    )
  }

  // Stock restore — mirror image of the accept-time decrement.
  await adjustOrderStock(adminClient, {
    orderId,
    shopId: link.shop_id,
    orderNumber: order.order_number,
    direction: 'restore',
  })

  await logAuditEvent({
    shopId: link.shop_id,
    actorUserId: null,
    actorType: 'whatsapp',
    action: 'order.status_changed',
    entityType: 'order',
    entityId: orderId,
    oldValues: { status: 'accepted' },
    newValues: { status: 'cancelled', cancellation_reason: reason },
    metadata: { target_name: `Order #${order.order_number}`, via: 'staff_edit_link' },
  })

  const waBotUrl = process.env.WA_BOT_INTERNAL_URL
  const internalSecret = process.env.INTERNAL_API_SECRET
  if (waBotUrl && internalSecret) {
    const base = waBotUrl.replace(/\/$/, '')

    notifyWaBot(base, internalSecret, `/internal/orders/${orderId}/notify`, { status: 'cancelled', shopId: link.shop_id }, 'the cancel notify')

    notifyWaBot(
      base,
      internalSecret,
      `/internal/orders/${orderId}/notify-staff`,
      { status: 'cancelled', shopId: link.shop_id, reason, via: 'the edit screen' },
      'the staff cancel notify'
    )
  }

  return NextResponse.json({ success: true })
}
