import { NextResponse } from 'next/server'
import { requireShopRole } from '@/lib/auth/require-shop-role'

type UpsertConnectionBody = {
  phone_number_id?: unknown
  business_account_id?: unknown
  display_phone_number?: unknown
  catalog_id?: unknown
}

function getText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export async function GET() {
  const authorization = await requireShopRole(['owner', 'manager'])

  if ('error' in authorization) {
    return authorization.error
  }

  const { adminClient, shopId } = authorization

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

export async function PUT(request: Request) {
  const authorization = await requireShopRole(['owner', 'manager'])

  if ('error' in authorization) {
    return authorization.error
  }

  const { adminClient, shopId } = authorization

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

  // Both required going forward — previously optional, which is how the
  // pilot shop ended up with a connection that resolves incoming messages
  // fine but has no business_account_id/display_phone_number on file,
  // silently blocking template management and the catalog sync's `link`
  // field (which needs the display number).
  if (!businessAccountId) {
    return NextResponse.json(
      { error: 'WhatsApp Business Account ID is required' },
      { status: 400 }
    )
  }

  if (!displayPhoneNumber) {
    return NextResponse.json(
      { error: 'Display phone number is required' },
      { status: 400 }
    )
  }

  // Manual find-then-update-or-insert rather than .upsert(onConflict:...),
  // since we can't confirm a unique constraint exists on shop_id without
  // direct DB/migration access.
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
    // Optional — a shop can connect WhatsApp for messaging before its
    // Meta Commerce Catalog even exists. Filled in once catalog setup
    // is done; catalogSync.js fails clearly at sync time if it's absent.
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

  return NextResponse.json(
    { success: true, connection },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  )
}
