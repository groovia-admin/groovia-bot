import { NextResponse } from 'next/server'
import { requireShopRole } from '@/lib/auth/require-shop-role'
import { normalizeIndianPhone } from '@/lib/phone'
import { logAuditEvent } from '@/lib/audit/log'

type CreateStaffBody = {
  fullName?: unknown
  phoneNumber?: unknown
  role?: unknown
}

function getText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export async function GET() {
  const authorization = await requireShopRole(['owner'])

  if ('error' in authorization) {
    return authorization.error
  }

  const { adminClient, shopId } = authorization

  const { data: staff, error } = await adminClient
    .from('shop_users')
    .select('id, full_name, phone_number, role, is_active, last_login_at, created_at')
    .eq('shop_id', shopId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Failed to load staff:', error)
    return NextResponse.json({ error: 'Failed to load staff' }, { status: 500 })
  }

  return NextResponse.json(
    { staff: staff ?? [] },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  )
}

export async function POST(request: Request) {
  const authorization = await requireShopRole(['owner'])

  if ('error' in authorization) {
    return authorization.error
  }

  const { adminClient, shopId } = authorization

  let body: CreateStaffBody

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const fullName = getText(body.fullName)
  const rawPhone = getText(body.phoneNumber)
  const role = getText(body.role)

  if (!fullName || !rawPhone) {
    return NextResponse.json(
      { error: 'Full name and phone number are required' },
      { status: 400 }
    )
  }

  if (role !== 'manager' && role !== 'staff') {
    return NextResponse.json(
      { error: 'Role must be manager or staff' },
      { status: 400 }
    )
  }

  if (role === 'staff') {
    const { count: activeStaffCount, error: countError } = await adminClient
      .from('shop_users')
      .select('*', { count: 'exact', head: true })
      .eq('shop_id', shopId)
      .eq('role', 'staff')
      .eq('is_active', true)

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

  const phoneNumber = normalizeIndianPhone(rawPhone)

  if (!phoneNumber) {
    return NextResponse.json(
      { error: 'Enter a valid 10-digit Indian mobile number' },
      { status: 400 }
    )
  }

  // Find or create the auth account for this phone number.
  const { data: existingUsers, error: listError } = await adminClient.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  })

  if (listError) {
    console.error('Staff account lookup failed:', listError)
    return NextResponse.json(
      { error: 'Unable to validate the staff account' },
      { status: 500 }
    )
  }

  const existingAccount =
    existingUsers.users.find(user => user.phone === phoneNumber.replace('+', '')) ??
    existingUsers.users.find(user => user.phone === phoneNumber) ??
    null

  let authUserId: string

  if (existingAccount) {
    authUserId = existingAccount.id
  } else {
    const { data: createdUser, error: createUserError } = await adminClient.auth.admin.createUser({
      phone: phoneNumber,
      phone_confirm: true,
      user_metadata: { full_name: fullName },
    })

    if (createUserError || !createdUser.user) {
      return NextResponse.json(
        { error: createUserError?.message || 'Failed to create the staff account' },
        { status: 400 }
      )
    }

    authUserId = createdUser.user.id
  }

  const { data: staffRow, error: insertError } = await adminClient
    .from('shop_users')
    .insert({
      shop_id: shopId,
      auth_user_id: authUserId,
      full_name: fullName,
      role,
      phone_number: phoneNumber,
      is_active: true,
    })
    .select('id, full_name, phone_number, role, is_active, permissions, created_at')
    .single()

  if (insertError) {
    if (insertError.code === '23505') {
      return NextResponse.json(
        { error: 'This phone number already staffs this shop' },
        { status: 409 }
      )
    }

    console.error('Failed to add staff:', insertError)
    return NextResponse.json({ error: 'Failed to add staff member' }, { status: 500 })
  }

  await logAuditEvent({
    shopId,
    actorUserId: authorization.userId,
    actorType: authorization.role,
    action: 'staff.created',
    entityType: 'shop_user',
    entityId: staffRow.id,
    newValues: { full_name: fullName, role, phone_number: phoneNumber, is_active: true },
    metadata: { actor_name: authorization.actorName, target_name: fullName },
  })

  return NextResponse.json(
    { success: true, staff: staffRow },
    { status: 201, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  )
}
