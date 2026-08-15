import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { validateEditLink } from '@/lib/orderEditLink'

type DoneRouteContext = {
  params: Promise<{ orderId: string }>
}

type DoneBody = {
  token?: unknown
  diffLines?: unknown
}

// Fires once, when the shopkeeper taps "Done" on the edit webview —
// the consolidated twin of what each item PATCH used to send on its
// own. diffLines is whatever StaffOrderEditApp.tsx accumulated client-
// side across the session; if it's empty (shopkeeper opened the link
// and made no changes), this is a no-op rather than sending an empty
// "your order was updated" message.
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

  if (diffLines.length === 0) {
    return NextResponse.json({ success: true, sent: false })
  }

  const { data: order, error } = await adminClient
    .from('orders')
    .select('total_amount')
    .eq('id', orderId)
    .eq('shop_id', link.shop_id)
    .maybeSingle()

  if (error || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  const waBotUrl = process.env.WA_BOT_INTERNAL_URL
  const internalSecret = process.env.INTERNAL_API_SECRET
  if (!waBotUrl || !internalSecret) {
    return NextResponse.json({ success: true, sent: false })
  }

  const base = waBotUrl.replace(/\/$/, '')
  let sent = false
  try {
    const res = await fetch(`${base}/internal/orders/${orderId}/notify-edit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': internalSecret },
      body: JSON.stringify({ shopId: link.shop_id, diffLines, newTotal: order.total_amount }),
    })
    sent = res.ok
    if (!res.ok) console.error('wa-bot rejected the edit notify:', res.status, await res.text().catch(() => ''))
  } catch (err) {
    console.error('Failed to notify wa-bot of order edit session:', err)
  }

  return NextResponse.json({ success: true, sent })
}
