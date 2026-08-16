import { NextResponse } from 'next/server'
import { requireShopRole, hasStaffPermission } from '@/lib/auth/require-shop-role'
import { logAuditEvent } from '@/lib/audit/log'

type ItemRouteContext = {
  params: Promise<{ id: string; itemId: string }>
}

type UpdateItemBody = {
  quantity?: unknown
}

// Dashboard equivalent of the WhatsApp staff Edit flow (orderEditor.js /
// messageHandler.js in wa-bot) — same rules, same shape of change, just a
// second front door onto the same pending-order edit, matching how the
// order status PATCH route already mirrors the WhatsApp ACCEPT/REJECT
// commands rather than inventing its own rules.
//
// quantity <= 0 removes the item entirely (mirrors adjustItemQuantity's
// "0 means remove" convention in orderEditor.js), unless it's the last
// item left on the order — an order needs at least one item; Reject is
// the right tool for "none of this is available," not an empty order.
export async function PATCH(request: Request, { params }: ItemRouteContext) {
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
  const { id: orderId, itemId } = await params

  let body: UpdateItemBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const quantity = body.quantity
  if (typeof quantity !== 'number' || !Number.isFinite(quantity) || !Number.isInteger(quantity)) {
    return NextResponse.json({ error: 'quantity must be a whole number' }, { status: 400 })
  }

  const { data: order, error: orderError } = await adminClient
    .from('orders')
    .select('id, order_number, status, delivery_fee, tax_amount, discount_amount')
    .eq('id', orderId)
    .eq('shop_id', shopId)
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
  // right after that first one. Matches the same widened check the
  // WhatsApp edit flow makes (messageHandler.js sendEditPrompt).
  if (order.status !== 'pending' && order.status !== 'accepted') {
    return NextResponse.json(
      { error: `Order can no longer be edited (already ${order.status}).` },
      { status: 409 }
    )
  }

  const wasPending = order.status === 'pending'

  const { data: allItems, error: allItemsError } = await adminClient
    .from('order_items')
    .select('id, product_id, product_name_snapshot, quantity, unit_price')
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
  const targetQuantity = removing ? 0 : quantity

  // Stock is reserved at order placement now, for the quantities the
  // order actually had then — editing a quantity while still pending/
  // accepted has to keep that reservation in sync by the delta, not just
  // trust the total gets fixed some other way. Increasing a quantity
  // needs *more* stock held (can fail if there isn't enough); decreasing
  // or removing releases the difference back (always succeeds). Done
  // before touching order_items so a failed reservation leaves nothing
  // half-changed.
  if (item.product_id) {
    const delta = previousQuantity - targetQuantity
    if (delta > 0) {
      const { error: restoreError } = await adminClient.rpc('adjust_product_stock', {
        p_product_id: item.product_id,
        p_delta: delta,
      })
      if (restoreError) {
        console.error('Failed to restore stock for edited item:', restoreError)
        return NextResponse.json({ error: 'Failed to update item' }, { status: 500 })
      }
    } else if (delta < 0) {
      const { data: newQuantity, error: reserveError } = await adminClient.rpc('reserve_product_stock', {
        p_product_id: item.product_id,
        p_qty: -delta,
      })
      if (reserveError) {
        console.error('Failed to reserve additional stock for edited item:', reserveError)
        return NextResponse.json({ error: 'Failed to update item' }, { status: 500 })
      }
      if (newQuantity === null) {
        return NextResponse.json(
          { error: `Not enough stock to increase ${item.product_name_snapshot} to ${targetQuantity}.` },
          { status: 409 }
        )
      }
    }
    if (delta !== 0) {
      await adminClient.from('inventory_movements').insert({
        shop_id: shopId,
        product_id: item.product_id,
        quantity_delta: delta,
        movement_type: delta > 0 ? 'cancelled_order' : 'sale',
        reference_id: orderId,
        notes: `Order #${order.order_number} — ${item.product_name_snapshot} (edited)`,
        created_by: authorization.userId,
      })
    }
  }

  if (removing) {
    const { error: deleteError } = await adminClient.from('order_items').delete().eq('id', itemId)
    if (deleteError) {
      console.error('Failed to remove order item:', deleteError)
      return NextResponse.json({ error: 'Failed to remove item' }, { status: 500 })
    }
  } else {
    const newSubtotal = Number(item.unit_price) * quantity
    const { error: updateItemError } = await adminClient
      .from('order_items')
      .update({ quantity, subtotal: newSubtotal })
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
  // the customer. Auto-accepts on the first edit only (order.status
  // captured before this request's own change, guarded again here by
  // .eq('status','pending') so two racing edits can't both "win" this).
  // Stock is not touched here — it's already reserved at placement and
  // was just kept in sync by the delta adjustment above, independent of
  // whether this particular edit happens to be the accepting one.
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
    shopId,
    actorUserId: authorization.userId,
    actorType: authorization.role,
    action: 'order.item_edited',
    entityType: 'order',
    entityId: orderId,
    oldValues: { quantity: previousQuantity },
    newValues: removing ? { removed: true } : { quantity },
    metadata: {
      actor_name: authorization.actorName,
      target_name: `Order #${order.order_number} — ${item.product_name_snapshot}`,
    },
  })

  if (autoAccepted) {
    await logAuditEvent({
      shopId,
      actorUserId: authorization.userId,
      actorType: authorization.role,
      action: 'order.status_changed',
      entityType: 'order',
      entityId: orderId,
      oldValues: { status: 'pending' },
      newValues: { status: 'accepted' },
      metadata: { actor_name: authorization.actorName, target_name: `Order #${order.order_number}`, via: 'item_edit' },
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
        body: JSON.stringify({ status: 'accepted', shopId }),
      })
        .then(async (res) => {
          if (!res.ok) console.error('wa-bot rejected the accept notify:', res.status, await res.text().catch(() => ''))
        })
        .catch((err) => console.error('Failed to notify wa-bot of order auto-accept:', err))

      // Staff-facing confirmation + "Mark ready" button — without this,
      // the shop had no visible sign the order was accepted at all, and
      // no way to advance it to ready/complete short of typing a raw
      // WhatsApp command they'd have no reason to know existed.
      fetch(`${base}/internal/orders/${orderId}/notify-staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': internalSecret },
        body: JSON.stringify({ status: 'accepted', shopId, actorName: authorization.actorName, via: 'an item edit' }),
      })
        .then(async (res) => {
          if (!res.ok) console.error('wa-bot rejected the staff notify:', res.status, await res.text().catch(() => ''))
        })
        .catch((err) => console.error('Failed to notify wa-bot staff of order auto-accept:', err))
    }

    // Best-effort: same "here's what changed" WhatsApp message the
    // WhatsApp-side Edit flow sends the customer — must never fail the
    // edit itself if wa-bot is unreachable or unconfigured. Sent
    // alongside the accept notification above (not instead of it) when
    // this was the accepting edit, so the customer both gets the
    // formal confirmation and sees exactly what changed.
    const diffLine = removing
      ? `❌ ${item.product_name_snapshot} — removed`
      : `✏️ ${item.product_name_snapshot} — quantity ${previousQuantity} → ${quantity}`

    fetch(`${base}/internal/orders/${orderId}/notify-edit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': internalSecret },
      body: JSON.stringify({ shopId, diffLines: [diffLine], newTotal }),
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
