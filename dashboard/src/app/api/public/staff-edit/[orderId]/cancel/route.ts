import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { validateEditLink } from '@/lib/orderEditLink'
import { logAuditEvent } from '@/lib/audit/log'

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

  const { error: cancelError } = await adminClient
    .from('orders')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancellation_reason: reason })
    .eq('id', orderId)
    .eq('status', 'accepted')

  if (cancelError) {
    console.error('Failed to cancel order:', cancelError)
    return NextResponse.json({ error: 'Failed to cancel order' }, { status: 500 })
  }

  // Stock restore — mirror image of the accept-time decrement (see the
  // /done route's twin of this block).
  const { data: itemsForStock, error: itemsForStockError } = await adminClient
    .from('order_items')
    .select('product_id, product_name_snapshot, quantity')
    .eq('order_id', orderId)

  if (itemsForStockError) {
    console.error('Failed to load order items for stock restore:', itemsForStockError)
  } else {
    for (const stockItem of itemsForStock ?? []) {
      if (!stockItem.product_id) continue

      const { error: rpcError } = await adminClient.rpc('adjust_product_stock', {
        p_product_id: stockItem.product_id,
        p_delta: stockItem.quantity,
      })

      if (rpcError) {
        console.error('Failed to restore stock for product', stockItem.product_id, rpcError)
        continue
      }

      await adminClient.from('inventory_movements').insert({
        shop_id: link.shop_id,
        product_id: stockItem.product_id,
        quantity_delta: stockItem.quantity,
        movement_type: 'cancelled_order',
        reference_id: orderId,
        notes: `Order #${order.order_number} — ${stockItem.product_name_snapshot}`,
        created_by: null,
      })
    }
  }

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

    fetch(`${base}/internal/orders/${orderId}/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': internalSecret },
      body: JSON.stringify({ status: 'cancelled', shopId: link.shop_id }),
    })
      .then(async (res) => {
        if (!res.ok) console.error('wa-bot rejected the cancel notify:', res.status, await res.text().catch(() => ''))
      })
      .catch((err) => console.error('Failed to notify wa-bot of order cancel:', err))

    fetch(`${base}/internal/orders/${orderId}/notify-staff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': internalSecret },
      body: JSON.stringify({ status: 'cancelled', shopId: link.shop_id, reason, via: 'the edit screen' }),
    })
      .then(async (res) => {
        if (!res.ok) console.error('wa-bot rejected the staff cancel notify:', res.status, await res.text().catch(() => ''))
      })
      .catch((err) => console.error('Failed to notify wa-bot staff of order cancel:', err))
  }

  return NextResponse.json({ success: true })
}
