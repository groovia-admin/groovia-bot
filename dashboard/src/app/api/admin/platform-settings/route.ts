import { NextResponse } from 'next/server'
import { requirePlatformAdmin } from '@/lib/auth/require-platform-admin'
import { logAuditEvent } from '@/lib/audit/log'

const SETTINGS_COLUMNS = 'support_email, support_phone, announcement_message, announcement_enabled, default_trial_days, updated_at'

type UpdateSettingsBody = Record<string, unknown>

function isNullableString(v: unknown): v is string | null {
  return v === null || typeof v === 'string'
}

function isBoolean(v: unknown): v is boolean {
  return typeof v === 'boolean'
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function GET() {
  const authorization = await requirePlatformAdmin()
  if ('error' in authorization) return authorization.error

  const { adminClient } = authorization

  const { data: settings, error } = await adminClient
    .from('platform_settings')
    .select(SETTINGS_COLUMNS)
    .eq('id', true)
    .maybeSingle()

  if (error) {
    console.error('Failed to load platform settings:', error)
    return NextResponse.json({ error: 'Failed to load platform settings' }, { status: 500 })
  }

  return NextResponse.json(
    { settings },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  )
}

export async function PATCH(request: Request) {
  const authorization = await requirePlatformAdmin()
  if ('error' in authorization) return authorization.error

  const { adminClient, userId, actorName } = authorization

  let body: UpdateSettingsBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key)
  const changes: Record<string, unknown> = {}

  if (has('support_email')) {
    if (!isNullableString(body.support_email) || (body.support_email && !EMAIL_REGEX.test(body.support_email))) {
      return NextResponse.json({ error: 'support_email must be a valid email or null' }, { status: 400 })
    }
    changes.support_email = body.support_email || null
  }

  if (has('support_phone')) {
    if (!isNullableString(body.support_phone)) {
      return NextResponse.json({ error: 'support_phone must be a string or null' }, { status: 400 })
    }
    changes.support_phone = body.support_phone || null
  }

  if (has('announcement_message')) {
    if (!isNullableString(body.announcement_message) || (body.announcement_message?.length ?? 0) > 300) {
      return NextResponse.json({ error: 'announcement_message must be a string up to 300 characters, or null' }, { status: 400 })
    }
    changes.announcement_message = body.announcement_message || null
  }

  if (has('announcement_enabled')) {
    if (!isBoolean(body.announcement_enabled)) {
      return NextResponse.json({ error: 'announcement_enabled must be true or false' }, { status: 400 })
    }
    changes.announcement_enabled = body.announcement_enabled
  }

  if (has('default_trial_days')) {
    const days = Number(body.default_trial_days)
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      return NextResponse.json({ error: 'default_trial_days must be a whole number between 1 and 365' }, { status: 400 })
    }
    changes.default_trial_days = days
  }

  if (Object.keys(changes).length === 0) {
    return NextResponse.json({ error: 'Provide at least one setting to update' }, { status: 400 })
  }

  const { data: settings, error } = await adminClient
    .from('platform_settings')
    .update(changes)
    .eq('id', true)
    .select(SETTINGS_COLUMNS)
    .single()

  if (error) {
    console.error('Failed to save platform settings:', error)
    return NextResponse.json({ error: 'Failed to save platform settings' }, { status: 500 })
  }

  await logAuditEvent({
    shopId: null,
    actorUserId: userId,
    actorType: 'super_admin',
    action: 'platform_settings.updated',
    entityType: 'platform_settings',
    entityId: 'singleton',
    newValues: changes,
    metadata: { actor_name: actorName },
  })

  return NextResponse.json(
    { success: true, settings },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  )
}
