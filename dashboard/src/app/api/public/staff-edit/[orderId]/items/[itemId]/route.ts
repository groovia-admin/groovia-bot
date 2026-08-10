import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { validateEditLink } from '@/lib/orderEditLink'
import { logAuditEvent } from '@/lib/audit/log'

type ItemRouteContext = {
  params: Promise<{ orderId: string; itemId: string }>
}

type UpdateItemBody = {
  token?: unknown
  quantity?: unknown
}

// Token-authenticated twin of /api/shop/orders/[id]/items/[itemId] —
// same rules (quantity <= 0 removes, can't empty the last item, order
// must still be 'pending', same customer-notify call), just gated by a
// signed link (see lib/orderEditLink.ts) instead of a logged-in
// dashboard session. Kept as a fully separate route rather than adding
// token auth as an alternative path on the existing one, so the two
// access models never risk getting tangled in the same handler.
export async function PATCH(request: Request, { params }: ItemRouteContext) {
  const { orderId, itemId } = await params

  let body: UpdateItemBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const token = typeof body.token === 'string' ? body.token : undefined
  const adminClient = createAdminClient()

  const link = await validateEditLink(adminClient, orderId, token)
  if (!link) {
    return NextResponse.json({ error: 'This edit link has expired. Ask the shop to tap Edit again from WhatsApp.' }, { status: 401 })
  }

  const quantity = body.quantity
  if (typeof quantity !== 'number' || !Number.isFinite(quantity) || !Number.isInteger(quantity)) {
    return NextResponse.json({ error: 'quantity must be a whole number' }, { status: 400 })
  }

  const { data: order, error: orderError } = await adminClient
    .from('orders')
    .select('id, order_number, status, delivery_fee, tax_amount, discount_amount')
    .eq('id', orderId)
    .eq('shop_id', link.shop_id)
    .maybeSingle()

  if (orderError) {
    console.error('Order lookup failed:', orderError)
    return NextResponse.json({ error: 'Failed to load order' }, { status: 500 })
  }

  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  // 'accepted' stays editable too — a still-'pending' order now
  // auto-accepts on its first edit (below), so this can't require
  // 'pending' specifically without locking out any further changes
  // right after that first one.
  if (order.status !== 'pending' && order.status !== 'accepted') {
    return NextResponse.json(
      { error: `Order can no longer be edited (already ${order.status}).` },
      { status: 409 }
    )
  }

  const wasPending = order.status === 'pending'

  const { data: allItems, error: allItemsError } = await adminClient
    .from('order_items')
    .select('id, product_name_snapshot, quantity, unit_price')
    .eq('order_id', orderId)

  if (allItemsError) {
    console.error('Failed to load order items:', allItemsError)
    return NextResponse.json({ error: 'Failed to load order items' }, { status: 500 })
  }

  const item = (allItems ?? []).find((i) => i.id === itemId)
  if (!item) {
    return NextResponse.json({ error: 'Item not found on this order' }, { status: 404 })
  }

  const removing = quantity <= 0
  if (removing && (allItems ?? []).length <= 1) {
    return NextResponse.json(
      { error: "Can't remove every item — an order needs at least one. Use Reject instead if none of these are available." },
      { status: 409 }
    )
  }

  const previousQuantity = item.quantity

  if (removing) {
    const { error: deleteError } = await adminClient.from('order_items').delete().eq('id', itemId)
    if (deleteError) {
      console.error('Failed to remove order item:', deleteError)
      return NextResponse.json({ error: 'Failed to remove item' }, { status: 500 })
    }
  } else {
    const newItemSubtotal = Number(item.unit_price) * quantity
    const { error: updateItemError } = await adminClient
      .from('order_items')
      .update({ quantity, subtotal: newItemSubtotal })
      .eq('id', itemId)

    if (updateItemError) {
      console.error('Failed to update item quantity:', updateItemError)
      return NextResponse.json({ error: 'Failed to update item' }, { status: 500 })
    }
  }

  const { data: remaining, error: remainingError } = await adminClient
    .from('order_items')
    .select('subtotal')
    .eq('order_id', orderId)

  if (remainingError) {
    console.error('Failed to reload order items after edit:', remainingError)
    return NextResponse.json({ error: 'Item was updated, but failed to recompute order total' }, { status: 500 })
  }

  const newSubtotal = (remaining ?? []).reduce((sum, i) => sum + Number(i.subtotal), 0)
  const newTotal =
    newSubtotal + Number(order.delivery_fee || 0) + Number(order.tax_amount || 0) - Number(order.discount_amount || 0)

  const { error: updateOrderError } = await adminClient
    .from('orders')
    .update({ subtotal: newSubtotal, total_amount: newTotal })
    .eq('id', orderId)

  if (updateOrderError) {
    console.error('Failed to update order totals:', updateOrderError)
    return NextResponse.json({ error: 'Item was updated, but failed to recompute order total' }, { status: 500 })
  }

  // Editing a still-pending order is the shop actively reviewing it —
  // reported as a gap that this never actually accepted the order, so
  // it silently stayed 'pending' with no formal confirmation reaching
  // the customer. Auto-accepts on the first edit only, guarded by
  // .eq('status','pending') so two racing edits can't both "win" this.
  // Deliberately NOT tied to stock decrement here — see the dashboard
  // route's twin of this comment for why.
  let autoAccepted = false
  if (wasPending) {
    const { error: acceptError } = await adminClient
      .from('orders')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('id', orderId)
      .eq('status', 'pending')

    if (acceptError) {
      console.error('Failed to auto-accept order on edit:', acceptError)
    } else {
      autoAccepted = true
    }
  }

  await logAuditEvent({
    shopId: link.shop_id,
    actorUserId: null,
    actorType: 'whatsapp',
    action: 'order.item_edited',
    entityType: 'order',
    entityId: orderId,
    oldValues: { quantity: previousQuantity },
    newValues: removing ? { removed: true } : { quantity },
    metadata: { target_name: `Order #${order.order_number} — ${item.product_name_snapshot}`, via: 'staff_edit_link' },
  })

  if (autoAccepted) {
    await logAuditEvent({
      shopId: link.shop_id,
      actorUserId: null,
      actorType: 'whatsapp',
      action: 'order.status_changed',
      entityType: 'order',
      entityId: orderId,
      oldValues: { status: 'pending' },
      newValues: { status: 'accepted' },
      metadata: { target_name: `Order #${order.order_number}`, via: 'staff_edit_link' },
    })
  }

  const waBotUrl = process.env.WA_BOT_INTERNAL_URL
  const internalSecret = process.env.INTERNAL_API_SECRET
  if (waBotUrl && internalSecret) {
    const base = waBotUrl.replace(/\/$/, '')

    if (autoAccepted) {
      fetch(`${base}/internal/orders/${orderId}/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': internalSecret },
        body: JSON.stringify({ status: 'accepted', shopId: link.shop_id }),
      })
        .then(async (res) => {
          if (!res.ok) console.error('wa-bot rejected the accept notify:', res.status, await res.text().catch(() => ''))
        })
        .catch((err) => console.error('Failed to notify wa-bot of order auto-accept:', err))

      // Staff-facing confirmation + "Mark ready" button — without this,
      // the shop had no visible sign the order was accepted at all, and
      // no way to advance it to ready/complete short of typing a raw
      // WhatsApp command they'd have no reason to know existed. No
      // actorName here — this route has no logged-in user, just a
      // signed link.
      fetch(`${base}/internal/orders/${orderId}/notify-staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': internalSecret },
        body: JSON.stringify({ status: 'accepted', shopId: link.shop_id, via: 'an item edit' }),
      })
        .then(async (res) => {
          if (!res.ok) console.error('wa-bot rejected the staff notify:', res.status, await res.text().catch(() => ''))
        })
        .catch((err) => console.error('Failed to notify wa-bot staff of order auto-accept:', err))
    }

    // Best-effort: same "here's what changed" WhatsApp message every
    // other edit path already sends the customer — must never fail the
    // edit itself if wa-bot is unreachable or unconfigured. Sent
    // alongside the accept notification above (not instead of it) when
    // this was the accepting edit.
    const diffLine = removing
      ? `❌ ${item.product_name_snapshot} — removed`
      : `✏️ ${item.product_name_snapshot} — quantity ${previousQuantity} → ${quantity}`

    fetch(`${base}/internal/orders/${orderId}/notify-edit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': internalSecret },
      body: JSON.stringify({ shopId: link.shop_id, diffLines: [diffLine], newTotal }),
    })
      .then(async (res) => {
        if (!res.ok) console.error('wa-bot rejected the edit notify:', res.status, await res.text().catch(() => ''))
      })
      .catch((err) => console.error('Failed to notify wa-bot of order item edit:', err))
  }

  return NextResponse.json(
    { subtotal: newSubtotal, total: newTotal, removed: removing, autoAccepted },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  )
}
