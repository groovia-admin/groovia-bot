import { NextResponse } from 'next/server'
import { requireShopRole } from '@/lib/auth/require-shop-role'

type OrderRouteContext = {
  params: Promise<{ id: string }>
}

// Proxies wa-bot's own PDF generation rather than re-implementing it here
// — the invoice a customer receives on completion and the one an owner
// can view in the dashboard must always be byte-for-byte the same
// document, not two independently maintained renderers drifting apart.
export async function GET(_request: Request, { params }: OrderRouteContext) {
  const authorization = await requireShopRole(['owner', 'manager', 'staff'])

  if ('error' in authorization) {
    return authorization.error
  }

  const { shopId } = authorization
  const { id } = await params

  const waBotUrl = process.env.WA_BOT_INTERNAL_URL
  const internalSecret = process.env.INTERNAL_API_SECRET

  if (!waBotUrl || !internalSecret) {
    console.error('WA_BOT_INTERNAL_URL / INTERNAL_API_SECRET not configured — cannot fetch invoice')
    return NextResponse.json({ error: 'Invoice generation is not configured' }, { status: 500 })
  }

  const base = waBotUrl.replace(/\/$/, '')

  let waBotResponse: Response
  try {
    waBotResponse = await fetch(`${base}/internal/orders/${id}/invoice?shopId=${encodeURIComponent(shopId)}`, {
      headers: { 'x-internal-secret': internalSecret },
    })
  } catch (err) {
    console.error('Failed to reach wa-bot for invoice:', err)
    return NextResponse.json({ error: 'Failed to generate invoice' }, { status: 502 })
  }

  if (!waBotResponse.ok) {
    if (waBotResponse.status === 404) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }
    console.error('wa-bot rejected the invoice request:', waBotResponse.status, await waBotResponse.text().catch(() => ''))
    return NextResponse.json({ error: 'Failed to generate invoice' }, { status: 502 })
  }

  const pdfBytes = await waBotResponse.arrayBuffer()

  return new NextResponse(pdfBytes, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': waBotResponse.headers.get('content-disposition') || 'inline; filename="invoice.pdf"',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  })
}
