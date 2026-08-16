import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { validateEditLink } from '@/lib/orderEditLink'
import { logAuditEvent } from '@/lib/audit/log'

type DoneRouteContext = {
  params: Promise<{ orderId: string }>
}

type DoneBody = {
  token?: unknown
  diffLines?: unknown
}

// Fires once, when the shopkeeper taps "Done" on the edit webview.
// Two independent things happen here, not tied to each other:
//
// 1. If the order was still 'pending', it's accepted now (not on the
//    first quantity tap like before — reported as feeling wrong for the
//    order to silently flip to "accepted" while the shopkeeper was
//    still mid-edit, before they'd actually finished). Stock itself is
//    NOT touched here — it's reserved at order placement and each item
//    PATCH during this session already kept that reservation in sync by
//    its own delta, so there's nothing left to decrement on acceptance.
// 2. If any items were actually changed this session (diffLines from
//    StaffOrderEditApp.tsx's client-side accumulation), the customer
//    gets one consolidated "here's what changed" message — the
//    consolidated twin of what each item PATCH used to send on its own.
//
// An order that was already 'accepted' before this session (a second
// edit pass) only does #2, since there's nothing left to accept.
export async function POST(request: Request, { params }: DoneRouteContext) {
  const { orderId } = await params

  let body: DoneBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const token = typeof body.token === 'string' ? body.token : undefined
  const diffLines = Array.isArray(body.diffLines) ? body.diffLines.filter((l): l is string => typeof l === 'string') : []

  const adminClient = createAdminClient()
  const link = await validateEditLink(adminClient, orderId, token)
  if (!link) {
    return NextResponse.json({ error: 'This edit link has expired.' }, { status: 401 })
  }

  const { data: order, error } = await adminClient
    .from('orders')
    .select('order_number, status, total_amount')
    .eq('id', orderId)
    .eq('shop_id', link.shop_id)
    .maybeSingle()

  if (error || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  const waBotUrl = process.env.WA_BOT_INTERNAL_URL
  const internalSecret = process.env.INTERNAL_API_SECRET
  const base = waBotUrl ? waBotUrl.replace(/\/$/, '') : null

  let accepted = false
  if (order.status === 'pending') {
    // Guarded by .eq('status','pending') so a racing request (e.g. the
    // customer's own self-cancel, or staff accepting via WhatsApp at the
    // same moment) can't double-accept.
    const { error: acceptError } = await adminClient
      .from('orders')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('id', orderId)
      .eq('status', 'pending')

    if (acceptError) {
      console.error('Failed to accept order on Done:', acceptError)
    } else {
      accepted = true
    }
  }

  if (accepted) {
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

    if (base && internalSecret) {
      fetch(`${base}/internal/orders/${orderId}/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': internalSecret },
        body: JSON.stringify({ status: 'accepted', shopId: link.shop_id }),
      })
        .then(async (res) => {
          if (!res.ok) console.error('wa-bot rejected the accept notify:', res.status, await res.text().catch(() => ''))
        })
        .catch((err) => console.error('Failed to notify wa-bot of order accept:', err))

      // Staff-facing confirmation + "Mark ready" button — without this,
      // the shop had no visible sign the order was accepted at all, and
      // no way to advance it to ready/complete short of typing a raw
      // WhatsApp command they'd have no reason to know existed.
      fetch(`${base}/internal/orders/${orderId}/notify-staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': internalSecret },
        body: JSON.stringify({ status: 'accepted', shopId: link.shop_id, via: 'an item edit' }),
      })
        .then(async (res) => {
          if (!res.ok) console.error('wa-bot rejected the staff notify:', res.status, await res.text().catch(() => ''))
        })
        .catch((err) => console.error('Failed to notify wa-bot staff of order accept:', err))
    }
  }

  let editNotifySent = false
  if (diffLines.length > 0 && base && internalSecret) {
    try {
      const res = await fetch(`${base}/internal/orders/${orderId}/notify-edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': internalSecret },
        body: JSON.stringify({ shopId: link.shop_id, diffLines, newTotal: order.total_amount }),
      })
      editNotifySent = res.ok
      if (!res.ok) console.error('wa-bot rejected the edit notify:', res.status, await res.text().catch(() => ''))
    } catch (err) {
      console.error('Failed to notify wa-bot of order edit session:', err)
    }
  }

  return NextResponse.json({ success: true, accepted, editNotifySent })
}
