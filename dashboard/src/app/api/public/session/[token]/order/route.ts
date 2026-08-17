import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { consumeOrderSession, hashSessionToken } from '@/lib/orderSession'
import { haversineDistanceKm } from '@/lib/storefront/geo'
import { isShopCurrentlyOpen } from '@/lib/storefront/slots'
import { adjustOrderStock } from '@/lib/orderStock'
import type { SubmitOrderBody, CartItem } from '@/lib/storefront/types'

function generateOrderNumber() {
  return `ORD-${randomBytes(4).toString('hex').toUpperCase()}`
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}

// Turns a built cart into a real order — the webview's equivalent of
// wa-bot's createOrderFromSession, called once at the very end of
// checkout. The cart itself is never trusted from this request's body:
// it's re-read from the session that was just consumed (persisted
// server-side by every PUT .../cart call along the way), so a tampered
// client can't submit different items/prices than what it actually
// browsed and saved.
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!token) {
    return NextResponse.json({ success: false, error: 'Invalid session' }, { status: 400 })
  }

  let body: SubmitOrderBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 })
  }

  if (body.orderType !== 'pickup' && body.orderType !== 'delivery') {
    return NextResponse.json({ success: false, error: 'Invalid order type' }, { status: 400 })
  }
  if (!isNonEmptyString(body.customerName)) {
    return NextResponse.json({ success: false, error: 'Your name is required' }, { status: 400 })
  }
  if (!isNonEmptyString(body.paymentMethod)) {
    return NextResponse.json({ success: false, error: 'Payment method is required' }, { status: 400 })
  }
  if (body.orderType === 'pickup' && !isNonEmptyString(body.pickupSlotLabel)) {
    return NextResponse.json({ success: false, error: 'Pickup time is required' }, { status: 400 })
  }
  if (body.orderType === 'delivery' && !isNonEmptyString(body.deliveryAddress?.address_line_1)) {
    return NextResponse.json({ success: false, error: 'Delivery address is required' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  // Everything through the settings checks below runs against this
  // non-destructive peek, not the consumed session — reported gap: the
  // old order used to consume the session FIRST and only discover the
  // shop had gone inactive/closed/stopped-accepting-orders afterward,
  // which burned the customer's one-time link on a failure that was
  // never theirs to begin with (no way to retry once the shop reopened,
  // short of a brand new WhatsApp message). Consuming the session is
  // now the last gate before actually writing the order, not the first
  // check performed.
  const { data: peekedSession } = await adminClient
    .from('order_sessions')
    .select('shop_id, cart_snapshot')
    .eq('token_hash', hashSessionToken(token))
    .eq('status', 'active')
    .maybeSingle()

  if (!peekedSession) {
    return NextResponse.json({ success: false, error: 'Session expired or already used' }, { status: 410 })
  }

  // Reported gap: nothing anywhere validated a cart quantity against
  // products.stock_quantity, so a customer could order more than a shop
  // actually had on the shelf. Checked non-destructively for the same
  // reason as above — a rejected order shouldn't burn the link either.
  const cartItemsPreview: CartItem[] = peekedSession.cart_snapshot?.items ?? []
  if (cartItemsPreview.length === 0) {
    return NextResponse.json({ success: false, error: 'Your cart is empty' }, { status: 400 })
  }

  const { data: stockRows, error: stockError } = await adminClient
    .from('products')
    .select('id, name, stock_quantity')
    .in('id', cartItemsPreview.map((i) => i.product_id))

  if (stockError) {
    console.error('Failed to check stock before order submission:', stockError)
    return NextResponse.json({ success: false, error: 'Something went wrong' }, { status: 500 })
  }

  const stockById = new Map((stockRows ?? []).map((p) => [p.id, p]))
  const shortages = cartItemsPreview
    .map((item) => {
      const product = stockById.get(item.product_id)
      const available = product?.stock_quantity ?? 0
      return item.quantity > available ? { name: product?.name ?? item.name, available } : null
    })
    .filter((s): s is { name: string; available: number } => s !== null)

  if (shortages.length > 0) {
    const detail = shortages.map((s) => `${s.name} (only ${s.available} left)`).join(', ')
    return NextResponse.json(
      { success: false, error: `Not enough stock for: ${detail}. Please adjust the quantity and try again.` },
      { status: 409 }
    )
  }

  const cartTotalPreview = peekedSession.cart_snapshot?.total ?? cartItemsPreview.reduce((sum, i) => sum + i.subtotal, 0)

  const { data: shop, error: shopError } = await adminClient
    .from('shops')
    .select('id, latitude, longitude, timezone')
    .eq('id', peekedSession.shop_id)
    .eq('is_active', true)
    .maybeSingle()

  if (shopError || !shop) {
    return NextResponse.json({ success: false, error: 'Shop not found' }, { status: 404 })
  }

  const { data: settings, error: settingsError } = await adminClient
    .from('shop_settings')
    .select(
      'allow_pickup, allow_delivery, minimum_order_amount, delivery_fee, delivery_radius_km, free_delivery_above, accepted_payment_methods, order_acceptance_enabled, business_hours'
    )
    .eq('shop_id', shop.id)
    .maybeSingle()

  if (settingsError) {
    console.error('Failed to load shop settings for order submission:', settingsError)
    return NextResponse.json({ success: false, error: 'Something went wrong' }, { status: 500 })
  }

  if (settings && !settings.order_acceptance_enabled) {
    return NextResponse.json({ success: false, error: 'This shop is not accepting orders right now' }, { status: 409 })
  }
  if (body.orderType === 'pickup' && settings && !settings.allow_pickup) {
    return NextResponse.json({ success: false, error: 'Pickup is not available at this shop' }, { status: 409 })
  }
  if (body.orderType === 'delivery' && settings && !settings.allow_delivery) {
    return NextResponse.json({ success: false, error: 'Delivery is not available at this shop' }, { status: 409 })
  }
  // Pickup only ever had this indirectly (the UI just doesn't offer a
  // slot outside business hours); delivery had no time gate at all,
  // since it doesn't go through slots — reported as a real gap, a
  // delivery order could be placed at 2am while the shop was closed.
  // Checked here, server-side, for both order types, not just relied
  // on the UI not offering the option.
  if (!isShopCurrentlyOpen(settings?.business_hours, shop.timezone)) {
    return NextResponse.json({ success: false, error: "We're closed right now — please check back during business hours." }, { status: 409 })
  }
  if (settings?.minimum_order_amount && cartTotalPreview < settings.minimum_order_amount) {
    return NextResponse.json(
      { success: false, error: `Minimum order amount is ${settings.minimum_order_amount}` },
      { status: 409 }
    )
  }
  if (settings?.accepted_payment_methods?.length && !settings.accepted_payment_methods.includes(body.paymentMethod)) {
    return NextResponse.json({ success: false, error: 'Payment method not accepted at this shop' }, { status: 400 })
  }

  // Single-use from here on — a retry after this point (network blip,
  // double-tap) must fail cleanly rather than place a second order. This
  // is now the LAST gate, not the first — everything above ran against
  // the non-destructive peek, so a failure on any of those checks never
  // burns the link.
  const session = await consumeOrderSession(adminClient, token)
  if (!session) {
    return NextResponse.json({ success: false, error: 'Session expired or already used' }, { status: 410 })
  }

  const cartItems = session.cart_snapshot?.items ?? []
  if (cartItems.length === 0) {
    return NextResponse.json({ success: false, error: 'Your cart is empty' }, { status: 400 })
  }
  const cartTotal = session.cart_snapshot?.total ?? cartItems.reduce((sum, i) => sum + i.subtotal, 0)

  // Find-or-create the customer row (shop_id, phone) — mirrors wa-bot's
  // createOrderFromSession. session.customer_phone is already in the raw
  // webhook phone shape (bare digits) it was created with, matching what
  // the rest of this schema stores customer phone numbers as.
  const { data: existingCustomer, error: customerLookupError } = await adminClient
    .from('customers')
    .select('id')
    .eq('shop_id', shop.id)
    .eq('phone', session.customer_phone)
    .maybeSingle()

  if (customerLookupError) {
    console.error('Customer lookup failed:', customerLookupError)
    return NextResponse.json({ success: false, error: 'Something went wrong' }, { status: 500 })
  }

  let customerId = existingCustomer?.id ?? null
  if (customerId) {
    await adminClient
      .from('customers')
      .update({ last_order_at: new Date().toISOString(), full_name: body.customerName.trim() })
      .eq('id', customerId)
  } else {
    const { data: createdCustomer, error: createCustomerError } = await adminClient
      .from('customers')
      .insert({
        shop_id: shop.id,
        phone: session.customer_phone,
        full_name: body.customerName.trim(),
        last_order_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (createCustomerError || !createdCustomer) {
      console.error('Failed to create customer:', createCustomerError)
      return NextResponse.json({ success: false, error: 'Something went wrong' }, { status: 500 })
    }
    customerId = createdCustomer.id
  }

  let deliveryAddressId: string | null = null
  let deliveryDistanceKm: number | null = null
  let deliveryFee = 0
  let deliveryAddressSnapshot: Record<string, unknown> | null = null

  if (body.orderType === 'delivery' && body.deliveryAddress) {
    const addr = body.deliveryAddress

    if (
      settings?.delivery_radius_km &&
      shop.latitude != null &&
      shop.longitude != null &&
      addr.latitude != null &&
      addr.longitude != null
    ) {
      deliveryDistanceKm = haversineDistanceKm(shop.latitude, shop.longitude, addr.latitude, addr.longitude)
      if (deliveryDistanceKm > settings.delivery_radius_km) {
        return NextResponse.json(
          { success: false, error: `This address is outside the shop's ${settings.delivery_radius_km}km delivery area` },
          { status: 409 }
        )
      }
    }

    deliveryFee =
      settings?.free_delivery_above && cartTotal >= settings.free_delivery_above ? 0 : settings?.delivery_fee ?? 0

    const { count: existingAddressCount } = await adminClient
      .from('customer_addresses')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', customerId)

    const { data: createdAddress, error: addressError } = await adminClient
      .from('customer_addresses')
      .insert({
        customer_id: customerId,
        label: addr.label || null,
        address_line_1: addr.address_line_1.trim(),
        address_line_2: addr.address_line_2?.trim() || null,
        landmark: addr.landmark?.trim() || null,
        city: addr.city?.trim() || null,
        state: addr.state?.trim() || null,
        postal_code: addr.postal_code?.trim() || null,
        latitude: addr.latitude ?? null,
        longitude: addr.longitude ?? null,
        is_default: (existingAddressCount ?? 0) === 0,
      })
      .select('id')
      .single()

    if (addressError || !createdAddress) {
      console.error('Failed to save delivery address:', addressError)
      return NextResponse.json({ success: false, error: 'Something went wrong saving your address' }, { status: 500 })
    }

    deliveryAddressId = createdAddress.id
    deliveryAddressSnapshot = { ...addr }
  }

  const totalAmount = cartTotal + deliveryFee

  const { data: order, error: orderError } = await adminClient
    .from('orders')
    .insert({
      order_number: generateOrderNumber(),
      shop_id: shop.id,
      customer_id: customerId,
      status: 'pending',
      order_type: body.orderType,
      payment_method: body.paymentMethod,
      payment_status: 'pending',
      subtotal: cartTotal,
      delivery_fee: deliveryFee,
      tax_amount: 0,
      discount_amount: 0,
      total_amount: totalAmount,
      pickup_slot_label: body.orderType === 'pickup' ? body.pickupSlotLabel : null,
      delivery_address_id: deliveryAddressId,
      delivery_distance_km: deliveryDistanceKm,
      notes: body.specialInstructions?.trim() || null,
      created_via: 'webview',
    })
    .select('id, order_number')
    .single()

  if (orderError || !order) {
    console.error('Failed to create order:', orderError)
    return NextResponse.json({ success: false, error: 'Something went wrong placing your order' }, { status: 500 })
  }

  const orderItems = cartItems.map((item) => ({
    order_id: order.id,
    product_id: item.product_id,
    product_name_snapshot: item.name,
    unit_snapshot: item.unit,
    quantity: item.quantity,
    unit_price: item.unit_price,
    subtotal: item.subtotal,
  }))

  const [{ error: itemsError }, { error: detailsError }] = await Promise.all([
    adminClient.from('order_items').insert(orderItems),
    adminClient.from('order_customer_details').insert({
      order_id: order.id,
      customer_id: customerId,
      customer_name_snapshot: body.customerName.trim(),
      customer_phone_snapshot: session.customer_phone,
      delivery_address_snapshot: deliveryAddressSnapshot,
    }),
  ])

  if (itemsError) console.error('Failed to insert order items:', itemsError)
  if (detailsError) console.error('Failed to insert order customer details:', detailsError)

  // Reserved here, at placement, not later at accept — closes a real
  // overselling race: the stock check above (against the session's cart
  // snapshot) only proves availability at the instant it ran, so two
  // customers checking out the last unit near-simultaneously could both
  // pass it before either order was ever triaged by a human. Reserving
  // immediately means the second one now correctly fails at its own
  // check. Accept no longer decrements at all (see messageHandler.js/
  // the dashboard status route); reject and cancel both restore this
  // same reservation, whichever happens.
  if (!itemsError) {
    await adjustOrderStock(adminClient, {
      orderId: order.id,
      shopId: shop.id,
      orderNumber: order.order_number,
      direction: 'decrement',
    })
  }

  // Best-effort: ask wa-bot to send the same "order placed, cancel
  // within 5 min" WhatsApp message the native-catalog flow sends inline.
  // Never fails the request itself — the order already exists in
  // Supabase regardless of whether this ping goes out. Both branches log
  // clearly rather than going silent — a missing env var here used to
  // mean the customer just never got the message or the cancel button,
  // with nothing in any log to say why.
  const waBotUrl = process.env.WA_BOT_INTERNAL_URL
  const internalSecret = process.env.INTERNAL_API_SECRET
  if (waBotUrl && internalSecret) {
    fetch(`${waBotUrl.replace(/\/$/, '')}/internal/orders/${order.id}/confirm-placement`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': internalSecret },
      body: JSON.stringify({ shopId: shop.id }),
    })
      .then(async (res) => {
        if (!res.ok) {
          console.error('wa-bot rejected the order-placement confirmation:', res.status, await res.text().catch(() => ''))
        }
      })
      .catch((err) => console.error('Failed to reach wa-bot for the order-placement confirmation:', err))
  } else {
    console.error(
      'WA_BOT_INTERNAL_URL / INTERNAL_API_SECRET not configured — skipping the customer order-placement WhatsApp message and cancel button entirely for order',
      order.id
    )
  }

  return NextResponse.json({ success: true, orderNumber: order.order_number })
}
