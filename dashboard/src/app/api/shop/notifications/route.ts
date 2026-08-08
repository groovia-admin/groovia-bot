import { NextResponse } from 'next/server'
import { requireShopRole } from '@/lib/auth/require-shop-role'

// Same underlying data as Activity Logs (audit_logs), just the most recent
// slice for the bell dropdown — owner/manager only, matching Logs page
// access (staff has no audit log visibility anywhere else in the app).
export async function GET() {
  const authorization = await requireShopRole(['owner', 'manager'])

  if ('error' in authorization) {
    return authorization.error
  }

  const { adminClient, shopId } = authorization

  const { data, error } = await adminClient
    .from('audit_logs')
    .select('id, actor_type, action, entity_type, metadata, created_at')
    .eq('shop_id', shopId)
    .neq('actor_type', 'super_admin')
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) {
    console.error('Failed to load notifications:', error)
    return NextResponse.json({ error: 'Failed to load notifications' }, { status: 500 })
  }

  return NextResponse.json(
    { notifications: data ?? [] },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  )
}
