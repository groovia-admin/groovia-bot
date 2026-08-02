import { NextResponse } from 'next/server'
import { requireShopRole } from '@/lib/auth/require-shop-role'

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

  return NextResponse.json(
    { staff },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  )
}
