import { NextResponse } from 'next/server'
import { requireShopRole } from '@/lib/auth/require-shop-role'
import { logAuditEvent } from '@/lib/audit/log'

const SETTINGS_COLUMNS =
  'shop_id, order_acceptance_enabled, allow_pickup, allow_delivery, minimum_order_amount, delivery_fee, delivery_radius_km, free_delivery_above, upi_id, accepted_payment_methods, auto_accept_orders, tax_enabled, tax_percentage, business_hours, welcome_message, away_message, reminder_enabled, auto_reject_after_minutes, daily_summary_enabled, daily_summary_time, order_decline_reasons, created_at, updated_at'

const TIME_HHMM_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

const PAYMENT_METHOD_VALUES = new Set(['cash', 'upi', 'online', 'pay_later'])

// Fields only an owner may change — payout/pricing-affecting settings.
const OWNER_ONLY_FIELDS = new Set(['upi_id', 'accepted_payment_methods'])

type UpdateSettingsBody = Record<string, unknown>

function isBoolean(v: unknown): v is boolean {
  return typeof v === 'boolean'
}

function isNullableNumber(v: unknown): v is number | null {
  return v === null || (typeof v === 'number' && Number.isFinite(v))
}

function isNullableString(v: unknown): v is string | null {
  return v === null || typeof v === 'string'
}

function isNullablePaymentMethodArray(v: unknown): v is string[] | null {
  if (v === null) return true
  return Array.isArray(v) && v.every((m) => typeof m === 'string' && PAYMENT_METHOD_VALUES.has(m))
}

function isNullableHoursObject(v: unknown): v is Record<string, unknown> | null {
  return v === null || (typeof v === 'object' && !Array.isArray(v))
}

function isReasonList(v: unknown): v is string[] {
  return Array.isArray(v) && v.length <= 20 && v.every((r) => typeof r === 'string' && r.trim().length > 0 && r.length <= 80)
}

export async function GET() {
  const authorization = await requireShopRole(['owner', 'manager'])

  if ('error' in authorization) {
    return authorization.error
  }

  const { adminClient, shopId } = authorization

  const { data: settings, error } = await adminClient
    .from('shop_settings')
    .select(SETTINGS_COLUMNS)
    .eq('shop_id', shopId)
    .maybeSingle()

  if (error) {
    console.error('Failed to load shop settings:', error)
    return NextResponse.json({ error: 'Failed to load shop settings' }, { status: 500 })
  }

  return NextResponse.json(
    { settings },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  )
}

export async function PATCH(request: Request) {
  const authorization = await requireShopRole(['owner', 'manager'])

  if ('error' in authorization) {
    return authorization.error
  }

  const { adminClient, shopId, role, userId, actorName } = authorization

  let body: UpdateSettingsBody

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key)

  for (const field of OWNER_ONLY_FIELDS) {
    if (has(field) && role !== 'owner') {
      return NextResponse.json(
        { error: 'Only the shop owner can change payment settings' },
        { status: 403 }
      )
    }
  }

  const changes: Record<string, unknown> = {}

  const booleanFields = ['order_acceptance_enabled', 'allow_pickup', 'allow_delivery', 'auto_accept_orders', 'tax_enabled', 'reminder_enabled', 'daily_summary_enabled']
  for (const field of booleanFields) {
    if (has(field)) {
      if (!isBoolean(body[field])) {
        return NextResponse.json({ error: `${field} must be true or false` }, { status: 400 })
      }
      changes[field] = body[field]
    }
  }

  const nullableNumberFields = ['minimum_order_amount', 'delivery_fee', 'delivery_radius_km', 'free_delivery_above', 'tax_percentage', 'auto_reject_after_minutes']
  for (const field of nullableNumberFields) {
    if (has(field)) {
      if (!isNullableNumber(body[field])) {
        return NextResponse.json({ error: `${field} must be a number or null` }, { status: 400 })
      }
      changes[field] = body[field]
    }
  }

  const nullableStringFields = ['upi_id', 'welcome_message', 'away_message']
  for (const field of nullableStringFields) {
    if (has(field)) {
      if (!isNullableString(body[field])) {
        return NextResponse.json({ error: `${field} must be a string or null` }, { status: 400 })
      }
      changes[field] = body[field]
    }
  }

  if (has('accepted_payment_methods')) {
    if (!isNullablePaymentMethodArray(body.accepted_payment_methods)) {
      return NextResponse.json(
        { error: 'accepted_payment_methods must contain only cash, upi, online, or pay_later' },
        { status: 400 }
      )
    }
    changes.accepted_payment_methods = body.accepted_payment_methods
  }

  if (has('business_hours')) {
    if (!isNullableHoursObject(body.business_hours)) {
      return NextResponse.json({ error: 'business_hours must be an object or null' }, { status: 400 })
    }
    changes.business_hours = body.business_hours
  }

  if (has('order_decline_reasons')) {
    if (!isReasonList(body.order_decline_reasons)) {
      return NextResponse.json({ error: 'order_decline_reasons must be a list of up to 20 short reasons' }, { status: 400 })
    }
    changes.order_decline_reasons = (body.order_decline_reasons as string[]).map((r) => r.trim())
  }

  if (has('daily_summary_time')) {
    if (typeof body.daily_summary_time !== 'string' || !TIME_HHMM_PATTERN.test(body.daily_summary_time)) {
      return NextResponse.json({ error: 'daily_summary_time must be in HH:MM (24-hour) format' }, { status: 400 })
    }
    changes.daily_summary_time = body.daily_summary_time
  }

  if (Object.keys(changes).length === 0) {
    return NextResponse.json({ error: 'Provide at least one setting to update' }, { status: 400 })
  }

  // Manual find-then-update-or-insert rather than .upsert(onConflict:...),
  // matching whatsapp-connection/route.ts — no direct DB access here to
  // confirm a unique constraint exists on shop_id.
  const { data: existing, error: existingError } = await adminClient
    .from('shop_settings')
    .select('shop_id')
    .eq('shop_id', shopId)
    .maybeSingle()

  if (existingError) {
    console.error('Failed to check existing shop settings:', existingError)
    return NextResponse.json({ error: 'Failed to save shop settings' }, { status: 500 })
  }

  const { data: settings, error } = existing
    ? await adminClient
        .from('shop_settings')
        .update(changes)
        .eq('shop_id', shopId)
        .select(SETTINGS_COLUMNS)
        .single()
    : await adminClient
        .from('shop_settings')
        .insert({ shop_id: shopId, ...changes })
        .select(SETTINGS_COLUMNS)
        .single()

  if (error) {
    console.error('Failed to save shop settings:', error)
    return NextResponse.json({ error: 'Failed to save shop settings' }, { status: 500 })
  }

  await logAuditEvent({
    shopId,
    actorUserId: userId,
    actorType: role,
    action: 'settings.updated',
    entityType: 'shop_settings',
    entityId: shopId,
    newValues: changes,
    metadata: { actor_name: actorName },
  })

  return NextResponse.json(
    { success: true, settings },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  )
}
