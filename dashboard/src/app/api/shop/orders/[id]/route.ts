import { NextResponse } from 'next/server'
import { requireShopRole, hasStaffPermission } from '@/lib/auth/require-shop-role'
import { logAuditEvent } from '@/lib/audit/log'
import { adjustOrderStock } from '@/lib/orderStock'
import type { OrderStatus } from '@/types/database'

type OrderRouteContext = {
  params: Promise<{ id: string }>
}

type UpdateOrderBody = {
  status?: unknown
  reason?: unknown
}

// Which transitions are allowed from a given status, and which timestamp
// column each target status stamps. Mirrors the lifecycle the WhatsApp
// staff-command flow (ACCEPT/REJECT/etc.) already drives — the dashboard is
// just a second front door onto the same state machine, not a new one.
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['accepted', 'rejected'],
  accepted: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['completed', 'cancelled'],
  completed: [],
  rejected: [],
  cancelled: [],
}

const TIMESTAMP_COLUMN: Partial<Record<OrderStatus, string>> = {
  accepted: 'accepted_at',
  preparing: 'preparing_at',
  ready: 'ready_at',
  completed: 'completed_at',
  rejected: 'rejected_at',
  cancelled: 'cancelled_at',
}

const REASON_REQUIRED: OrderStatus[] = ['rejected', 'cancelled']

// Backs the Orders-list detail drawer — same fields the old standalone
// /dashboard/orders/[id] server page fetched, just returned as JSON so a
// client component can pull them without navigating away from the list.
export async function GET(_request: Request, { params }: OrderRouteContext) {
  const authorization = await requireShopRole(['owner', 'manager', 'staff'])

  if ('error' in authorization) {
    return authorization.error
  }

  const { adminClient, shopId } = authorization
  const { id } = await params

  const [{ data: order, error }, { data: settings }] = await Promise.all([
    adminClient
      .from('orders')
      .select(
        'id, order_number, status, order_type, payment_method, payment_status, subtotal, delivery_fee, tax_amount, discount_amount, total_amount, pickup_slot_label, notes, rejection_reason, cancellation_reason, created_at, accepted_at, preparing_at, ready_at, completed_at, order_items ( id, product_name_snapshot, unit_snapshot, quantity, unit_price, subtotal ), order_customer_details ( customer_name_snapshot, customer_phone_snapshot, delivery_address_snapshot )'
      )
      .eq('id', id)
      .eq('shop_id', shopId)
      // Not yet visible to staff — same guard as the orders list, so a
      // guessed/stale link can't open an order early either. Treated as
      // "not found," indistinguishable from a real 404.
      .or('status.neq.pending,shop_alert_sent_at.not.is.null')
      .maybeSingle(),
    adminClient.from('shop_settings').select('order_decline_reasons').eq('shop_id', shopId).maybeSingle(),
  ])

  if (error) {
    console.error('Failed to load order:', error)
    return NextResponse.json({ error: 'Failed to load order' }, { status: 500 })
  }

  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  return NextResponse.json(
    { order, declineReasons: settings?.order_decline_reasons ?? [] },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  )
}

export async function PATCH(request: Request, { params }: OrderRouteContext) {
  const authorization = await requireShopRole(['owner', 'manager', 'staff'])

  if ('error' in authorization) {
    return authorization.error
  }

  if (!hasStaffPermission(authorization, 'manage_orders')) {
    return NextResponse.json(
      { error: "You don't have permission to update orders. Ask the shop owner to grant it." },
      { status: 403 }
    )
  }

  const { adminClient, shopId } = authorization
  const { id } = await params

  let body: UpdateOrderBody

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const nextStatus = body.status
  if (typeof nextStatus !== 'string' || !(nextStatus in ALLOWED_TRANSITIONS)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''

  if (REASON_REQUIRED.includes(nextStatus as OrderStatus) && !reason) {
    return NextResponse.json(
      { error: `A reason is required to mark an order as ${nextStatus}` },
      { status: 400 }
    )
  }

  const { data: order, error: orderError } = await adminClient
    .from('orders')
    .select('id, status, order_number')
    .eq('id', id)
    .eq('shop_id', shopId)
    // Not yet visible to staff — an order still inside the customer's
    // 5-minute self-cancel window can't be actioned early just because
    // its id was guessed or a stale link was revisited.
    .or('status.neq.pending,shop_alert_sent_at.not.is.null')
    .maybeSingle()

  if (orderError) {
    console.error('Order lookup failed:', orderError)
    return NextResponse.json({ error: 'Failed to load order' }, { status: 500 })
  }

  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  const allowedNext = ALLOWED_TRANSITIONS[order.status as OrderStatus] ?? []
  if (!allowedNext.includes(nextStatus as OrderStatus)) {
    return NextResponse.json(
      { error: `Cannot move an order from ${order.status} to ${nextStatus}` },
      { status: 409 }
    )
  }

  const changes: Record<string, unknown> = { status: nextStatus }
  const timestampColumn = TIMESTAMP_COLUMN[nextStatus as OrderStatus]
  if (timestampColumn) changes[timestampColumn] = new Date().toISOString()
  if (nextStatus === 'rejected') changes.rejection_reason = reason
  if (nextStatus === 'cancelled') changes.cancellation_reason = reason

  // Guarded by .eq('status', order.status) — the specific status just
  // read above, not just the id — so a second actor racing this one
  // (another staff member tapping Accept/Reject on the same order via
  // the dashboard or WhatsApp at nearly the same moment, which is
  // completely normal with 2+ staff) can't silently overwrite a
  // transition that already happened. Checked via .select() + null
  // rather than trusting "no error", since PostgREST returns success
  // with zero rows affected when the WHERE clause simply matches
  // nothing — same pattern already used correctly elsewhere (e.g.
  // reminderService.js's autoRejectOrder, the staff-edit cancel route).
  const { data: updatedOrder, error: updateError } = await adminClient
    .from('orders')
    .update(changes)
    .eq('id', id)
    .eq('shop_id', shopId)
    .eq('status', order.status)
    .select('id, status, order_number')
    .maybeSingle()

  if (updateError) {
    console.error('Failed to update order status:', updateError)
    return NextResponse.json({ error: 'Failed to update order' }, { status: 500 })
  }

  if (!updatedOrder) {
    return NextResponse.json(
      { error: 'This order was already updated by someone else — refresh to see its current status.' },
      { status: 409 }
    )
  }

  // Stock is reserved at order PLACEMENT now (see the webview's
  // order-creation route), not at acceptance — closes a real
  // overselling race where two customers could both pass the
  // availability check on the last unit before either order was ever
  // triaged. 'accepted' is therefore a no-op for stock (already
  // reserved). Both 'rejected' and 'cancelled' restore it, since either
  // one means the reservation never turns into a real sale.
  if (nextStatus === 'rejected' || nextStatus === 'cancelled') {
    await adjustOrderStock(adminClient, {
      orderId: order.id,
      shopId,
      orderNumber: order.order_number,
      direction: 'restore',
      createdBy: authorization.userId,
    })
  }

  await logAuditEvent({
    shopId,
    actorUserId: authorization.userId,
    actorType: authorization.role,
    action: 'order.status_changed',
    entityType: 'order',
    entityId: order.id,
    oldValues: { status: order.status },
    newValues: { status: nextStatus, reason: reason || undefined },
    metadata: { actor_name: authorization.actorName, target_name: `Order #${order.order_number}` },
  })

  // Best-effort: tell wa-bot to notify the customer over WhatsApp, matching
  // what the ACCEPT/REJECT staff-command flow already does. Not configured
  // in every environment yet, so a missing config/network failure here must
  // never fail the status update itself — the dashboard's own state is the
  // source of truth regardless of whether the WhatsApp ping went out.
  const waBotUrl = process.env.WA_BOT_INTERNAL_URL
  const internalSecret = process.env.INTERNAL_API_SECRET
  if (waBotUrl && internalSecret) {
    const base = waBotUrl.replace(/\/$/, '')

    fetch(`${base}/internal/orders/${order.id}/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': internalSecret },
      body: JSON.stringify({ status: nextStatus, shopId }),
    })
      .then(async (res) => {
        if (!res.ok) console.error('wa-bot rejected the customer notify:', res.status, await res.text().catch(() => ''))
      })
      .catch((err) => console.error('Failed to notify wa-bot of order status change:', err))

    // Proactive visibility for staff still watching WhatsApp — the
    // original alert message's Accept/Reject/Edit buttons never gray
    // out, so without this a teammate has no way to know this order was
    // just handled here instead, short of tapping a stale button.
    fetch(`${base}/internal/orders/${order.id}/notify-staff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': internalSecret },
      body: JSON.stringify({ status: nextStatus, shopId, actorName: authorization.actorName, reason: reason || undefined }),
    })
      .then(async (res) => {
        if (!res.ok) console.error('wa-bot rejected the staff notify:', res.status, await res.text().catch(() => ''))
      })
      .catch((err) => console.error('Failed to notify wa-bot staff of order status change:', err))
  } else {
    console.error(
      'WA_BOT_INTERNAL_URL / INTERNAL_API_SECRET not configured — skipping both the customer and staff WhatsApp notifications for order',
      order.id
    )
  }

  return NextResponse.json(
    { order: updatedOrder },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  )
}
