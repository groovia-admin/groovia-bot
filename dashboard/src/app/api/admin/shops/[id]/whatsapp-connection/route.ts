import { NextResponse } from 'next/server'
import { requirePlatformAdmin } from '@/lib/auth/require-platform-admin'
import { logAuditEvent } from '@/lib/audit/log'

type UpsertConnectionBody = {
  phone_number_id?: unknown
  business_account_id?: unknown
  display_phone_number?: unknown
  catalog_id?: unknown
}

type RouteContext = {
  params: Promise<{ id: string }>
}

function getText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

// Managed by the platform (super admin), not the shop owner — WhatsApp
// Business setup needs Meta App-level credentials a tenant shouldn't need
// or be trusted with.
export async function GET(request: Request, { params }: RouteContext) {
  const authorization = await requirePlatformAdmin()

  if ('error' in authorization) {
    return authorization.error
  }

  const { adminClient } = authorization
  const { id: shopId } = await params

  const { data: connection, error } = await adminClient
    .from('whatsapp_connections')
    .select('id, phone_number_id, business_account_id, display_phone_number, catalog_id, connection_status, connected_at')
    .eq('shop_id', shopId)
    .maybeSingle()

  if (error) {
    console.error('Failed to load WhatsApp connection:', error)
    return NextResponse.json({ error: 'Failed to load WhatsApp connection' }, { status: 500 })
  }

  return NextResponse.json(
    { connection },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  )
}

export async function PUT(request: Request, { params }: RouteContext) {
  const authorization = await requirePlatformAdmin()

  if ('error' in authorization) {
    return authorization.error
  }

  const { adminClient, userId, actorName } = authorization
  const { id: shopId } = await params

  let body: UpsertConnectionBody

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const phoneNumberId = getText(body.phone_number_id)
  const businessAccountId = getText(body.business_account_id)
  const displayPhoneNumber = getText(body.display_phone_number)
  const catalogId = getText(body.catalog_id)

  if (!phoneNumberId) {
    return NextResponse.json(
      { error: 'Phone Number ID (from Meta WhatsApp Manager) is required' },
      { status: 400 }
    )
  }

  if (!businessAccountId) {
    return NextResponse.json({ error: 'WhatsApp Business Account ID is required' }, { status: 400 })
  }

  if (!displayPhoneNumber) {
    return NextResponse.json({ error: 'Display phone number is required' }, { status: 400 })
  }

  const { data: shop, error: shopError } = await adminClient
    .from('shops')
    .select('id, name')
    .eq('id', shopId)
    .maybeSingle()

  if (shopError) {
    console.error('Shop lookup failed:', shopError)
    return NextResponse.json({ error: 'Failed to save WhatsApp connection' }, { status: 500 })
  }

  if (!shop) {
    return NextResponse.json({ error: 'Shop not found' }, { status: 404 })
  }

  // Manual find-then-update-or-insert, matching the pattern used
  // throughout this codebase — no direct DB access to confirm a unique
  // constraint exists on shop_id.
  const { data: existing, error: existingError } = await adminClient
    .from('whatsapp_connections')
    .select('id')
    .eq('shop_id', shopId)
    .maybeSingle()

  if (existingError) {
    console.error('Failed to check existing WhatsApp connection:', existingError)
    return NextResponse.json({ error: 'Failed to save WhatsApp connection' }, { status: 500 })
  }

  const connectionFields = {
    phone_number_id: phoneNumberId,
    business_account_id: businessAccountId || null,
    display_phone_number: displayPhoneNumber || null,
    catalog_id: catalogId || null,
    connection_status: 'connected',
    connected_at: new Date().toISOString(),
  }

  const { data: connection, error } = existing
    ? await adminClient
        .from('whatsapp_connections')
        .update(connectionFields)
        .eq('id', existing.id)
        .select('id, phone_number_id, business_account_id, display_phone_number, catalog_id, connection_status, connected_at')
        .single()
    : await adminClient
        .from('whatsapp_connections')
        .insert({ shop_id: shopId, ...connectionFields })
        .select('id, phone_number_id, business_account_id, display_phone_number, catalog_id, connection_status, connected_at')
        .single()

  if (error) {
    console.error('Failed to save WhatsApp connection:', error)
    return NextResponse.json({ error: 'Failed to save WhatsApp connection' }, { status: 500 })
  }

  await logAuditEvent({
    shopId,
    actorUserId: userId,
    actorType: 'super_admin',
    action: 'shop.whatsapp_connection_updated',
    entityType: 'whatsapp_connection',
    entityId: connection.id,
    newValues: { display_phone_number: displayPhoneNumber, business_account_id: businessAccountId },
    metadata: { actor_name: actorName, target_name: shop.name },
  })

  return NextResponse.json(
    { success: true, connection },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  )
}
