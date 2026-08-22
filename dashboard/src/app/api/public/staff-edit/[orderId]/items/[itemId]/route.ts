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

  // 'accepted' stays editable too, alongside 'pending' — acceptance now
  // happens on "Done" (see the /done route), not on this first edit, so
  // there's no first-edit transition here to worry about racing.
  if (order.status !== 'pending' && order.status !== 'accepted') {
    return NextResponse.json(
      { error: `Order can no longer be edited (already ${order.status}).` },
      { status: 409 }
    )
  }

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

  // Stock for this item was already reserved at order placement for
  // previousQuantity — keep the reservation in sync with the edit before
  // touching order_items, same as the dashboard's twin of this route.
  // Decreasing releases the difference back; increasing reserves more
  // atomically, which can genuinely fail if stock sold out elsewhere
  // since placement.
  const stockDelta = previousQuantity - targetQuantity
  const stockProductId = item.product_id
  const stockProductName = item.product_name_snapshot

  if (stockProductId && stockDelta < 0) {
    const { data: newQuantity, error: reserveError } = await adminClient.rpc('reserve_product_stock', {
      p_product_id: stockProductId,
      p_qty: -stockDelta,
    })

    if (reserveError) {
      console.error('Failed to reserve additional stock for product', stockProductId, reserveError)
      return NextResponse.json({ error: 'Failed to update item' }, { status: 500 })
    }

    if (newQuantity === null) {
      return NextResponse.json(
        { error: `Not enough stock to increase ${stockProductName} to ${targetQuantity}.` },
        { status: 409 }
      )
    }
  }

  if (removing) {
    const { error: deleteError } = await adminClient.from('order_items').delete().eq('id', itemId)
    if (deleteError) {
      console.error('Failed to remove order item:', deleteError)
      if (stockProductId && stockDelta < 0) {
        await adminClient.rpc('adjust_product_stock', { p_product_id: stockProductId, p_delta: -stockDelta })
      }
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
      if (stockProductId && stockDelta < 0) {
        await adminClient.rpc('adjust_product_stock', { p_product_id: stockProductId, p_delta: -stockDelta })
      }
      return NextResponse.json({ error: 'Failed to update item' }, { status: 500 })
    }
  }

  // Stock reservation is now in sync with order_items.quantity — release
  // the difference back if the edit decreased quantity, and record the
  // movement either way.
  if (stockProductId && stockDelta !== 0) {
    if (stockDelta > 0) {
      const { error: releaseError } = await adminClient.rpc('adjust_product_stock', {
        p_product_id: stockProductId,
        p_delta: stockDelta,
      })
      if (releaseError) console.error('Failed to release stock for product', stockProductId, releaseError)
    }

    const { error: movementError } = await adminClient.from('inventory_movements').insert({
      shop_id: link.shop_id,
      product_id: stockProductId,
      quantity_delta: -stockDelta,
      movement_type: stockDelta > 0 ? 'cancelled_order' : 'sale',
      reference_id: orderId,
      notes: `Order #${order.order_number} — ${stockProductName}`,
      created_by: null,
    })
    if (movementError) console.error('Failed to record inventory movement:', movementError)
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

  // No accept/notify logic here on purpose — reported as feeling wrong
  // for the order to silently flip to "accepted" the moment the first
  // quantity got tapped, while the shopkeeper was still mid-edit and
  // hadn't tapped Done. Status change and staff/customer notify happen
  // once, from the /done route, exactly when the shopkeeper actually
  // finishes. Stock is different: it's kept in sync with
  // order_items.quantity on every edit (above), not deferred to Done —
  // otherwise multiple edits before Done would each need their own delta
  // against whatever the previous edit left behind, which Done has no
  // way to reconstruct after the fact.

  return NextResponse.json(
    { subtotal: newSubtotal, total: newTotal, removed: removing },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  )
}
