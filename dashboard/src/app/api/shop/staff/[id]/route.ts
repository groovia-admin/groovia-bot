import { NextResponse } from 'next/server'
import { requireShopRole } from '@/lib/auth/require-shop-role'
import { logAuditEvent } from '@/lib/audit/log'

type UpdateStaffBody = {
  role?: unknown
  is_active?: unknown
}

type StaffRouteContext = {
  params: Promise<{ id: string }>
}

export async function PATCH(request: Request, { params }: StaffRouteContext) {
  const authorization = await requireShopRole(['owner'])

  if ('error' in authorization) {
    return authorization.error
  }

  const { adminClient, shopId } = authorization
  const { id } = await params

  let body: UpdateStaffBody

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const changes: { role?: string; is_active?: boolean } = {}

  if (Object.prototype.hasOwnProperty.call(body, 'role')) {
    if (body.role !== 'manager' && body.role !== 'staff') {
      return NextResponse.json(
        { error: 'Role must be manager or staff' },
        { status: 400 }
      )
    }
    changes.role = body.role
  }

  if (Object.prototype.hasOwnProperty.call(body, 'is_active')) {
    if (typeof body.is_active !== 'boolean') {
      return NextResponse.json(
        { error: 'is_active must be true or false' },
        { status: 400 }
      )
    }
    changes.is_active = body.is_active
  }

  if (Object.keys(changes).length === 0) {
    return NextResponse.json(
      { error: 'Provide role or is_active to update a staff member' },
      { status: 400 }
    )
  }

  // Read the pre-update state so the audit entry can record what changed.
  const { data: previousStaff } = await adminClient
    .from('shop_users')
    .select('role, is_active, full_name')
    .eq('id', id)
    .eq('shop_id', shopId)
    .maybeSingle()

  // Cap applies to whoever this update would leave as active role='staff' —
  // covers both "reactivate a deactivated staff member" and "change an
  // active manager's role to staff" landing on the same state. Only checked
  // when the update actually newly crosses into that state, so editing an
  // already-active staff member's other fields isn't blocked by their own
  // existing row.
  const finalRole = changes.role ?? previousStaff?.role
  const finalActive = changes.is_active ?? previousStaff?.is_active
  const wasActiveStaff = previousStaff?.role === 'staff' && previousStaff?.is_active === true
  const willBeActiveStaff = finalRole === 'staff' && finalActive === true

  if (willBeActiveStaff && !wasActiveStaff) {
    const { count: activeStaffCount, error: countError } = await adminClient
      .from('shop_users')
      .select('*', { count: 'exact', head: true })
      .eq('shop_id', shopId)
      .eq('role', 'staff')
      .eq('is_active', true)
      .neq('id', id)

    if (countError) {
      console.error('Active staff count check failed:', countError)
      return NextResponse.json({ error: 'Unable to validate staff limit' }, { status: 500 })
    }

    if ((activeStaffCount ?? 0) >= 2) {
      return NextResponse.json(
        { error: 'Maximum of 2 active staff members reached. Deactivate an existing staff member first.' },
        { status: 400 }
      )
    }
  }

  // Scoped by shop_id (in addition to id) so an owner can never touch
  // another shop's staff row, even by guessing a UUID.
  const { data: staff, error } = await adminClient
    .from('shop_users')
    .update(changes)
    .eq('id', id)
    .eq('shop_id', shopId)
    .neq('role', 'owner')
    .select('id, full_name, phone_number, role, is_active, created_at')
    .maybeSingle()

  if (error) {
    console.error('Failed to update staff:', error)
    return NextResponse.json({ error: 'Failed to update staff member' }, { status: 500 })
  }

  if (!staff) {
    return NextResponse.json({ error: 'Staff member not found' }, { status: 404 })
  }

  let action = 'staff.updated'
  if ('role' in changes && !('is_active' in changes)) {
    action = 'staff.role_changed'
  } else if ('is_active' in changes && !('role' in changes)) {
    action = changes.is_active ? 'staff.activated' : 'staff.deactivated'
  }

  await logAuditEvent({
    shopId,
    actorUserId: authorization.userId,
    actorType: authorization.role,
    action,
    entityType: 'shop_user',
    entityId: staff.id,
    oldValues: previousStaff ? { role: previousStaff.role, is_active: previousStaff.is_active } : null,
    newValues: changes,
    metadata: { actor_name: authorization.actorName, target_name: staff.full_name },
  })

  return NextResponse.json(
    { staff },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  )
}
