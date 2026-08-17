import { NextResponse } from 'next/server'
import { requirePlatformAdmin } from '@/lib/auth/require-platform-admin'

type RouteContext = {
  params: Promise<{ id: string }>
}

// Manual, explicit trigger — bypasses the catalog_auto_sync_enabled flag
// on purpose. The flag only gates whether stock/availability changes
// auto-trigger a sync; a Super Admin manually asking for one here should
// always run it, flag on or off (e.g. to verify the connection works
// before turning auto-sync on, or to force a refresh outside it).
// Awaited rather than fire-and-forget, unlike the automatic triggers —
// this is a button someone is actively watching for a result.
export async function POST(_request: Request, { params }: RouteContext) {
  const authorization = await requirePlatformAdmin()

  if ('error' in authorization) {
    return authorization.error
  }

  const { id: shopId } = await params

  const waBotUrl = process.env.WA_BOT_INTERNAL_URL
  const internalSecret = process.env.INTERNAL_API_SECRET
  if (!waBotUrl || !internalSecret) {
    return NextResponse.json({ error: 'WA_BOT_INTERNAL_URL/INTERNAL_API_SECRET not configured' }, { status: 500 })
  }

  try {
    const base = waBotUrl.replace(/\/$/, '')
    const res = await fetch(`${base}/internal/shops/${shopId}/sync-catalog`, {
      method: 'POST',
      headers: { 'x-internal-secret': internalSecret },
    })
    const data = await res.json().catch(() => ({}))

    if (!res.ok || !data.success) {
      return NextResponse.json({ error: data.error || 'Catalog sync failed' }, { status: res.status === 200 ? 502 : res.status })
    }

    return NextResponse.json({ success: true, synced: data.synced ?? 0 })
  } catch (err) {
    console.error('Failed to reach wa-bot for catalog sync:', err)
    return NextResponse.json({ error: 'Failed to reach wa-bot to sync the catalog' }, { status: 502 })
  }
}
