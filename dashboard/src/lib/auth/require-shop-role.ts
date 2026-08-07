import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ShopRole } from '@/types/database'

export type StaffPermission = 'manage_orders' | 'manage_products'

type RequireShopRoleResult =
  | { error: NextResponse }
  | {
      adminClient: ReturnType<typeof createAdminClient>
      shopId: string
      role: ShopRole
      userId: string
      actorName: string
      permissions: Partial<Record<StaffPermission, boolean>>
    }

/**
 * API-route guard. Resolves the caller's own shop_id/role from their
 * session — never from a client-supplied param — and rejects with a JSON
 * error if they're not an active member of a shop with an allowed role.
 */
export async function requireShopRole(
  allowed: ShopRole[]
): Promise<RequireShopRoleResult> {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  const adminClient = createAdminClient()

  const { data: shopUser, error: shopUserError } = await adminClient
    .from('shop_users')
    .select('shop_id, role, full_name, permissions')
    .eq('auth_user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (shopUserError) {
    console.error('Shop role verification failed:', shopUserError)
    return {
      error: NextResponse.json(
        { error: 'Unable to verify shop access' },
        { status: 500 }
      ),
    }
  }

  if (!shopUser) {
    return {
      error: NextResponse.json(
        { error: 'Not a member of any shop' },
        { status: 403 }
      ),
    }
  }

  if (!allowed.includes(shopUser.role as ShopRole)) {
    return {
      error: NextResponse.json(
        { error: 'Insufficient permissions for this action' },
        { status: 403 }
      ),
    }
  }

  return {
    adminClient,
    shopId: shopUser.shop_id,
    role: shopUser.role as ShopRole,
    userId: user.id,
    actorName: shopUser.full_name,
    permissions: (shopUser.permissions as Partial<Record<StaffPermission, boolean>>) ?? {},
  }
}

/**
 * Second gate for actions that staff can only take if their owner has
 * explicitly granted the specific permission. Owner/manager are never
 * restricted by this — permissions only narrow what an already-allowed
 * staff member can do, they don't grant staff anything requireShopRole's
 * role list wouldn't have let through anyway.
 */
export function hasStaffPermission(
  authorization: Extract<RequireShopRoleResult, { adminClient: unknown }>,
  permission: StaffPermission
): boolean {
  if (authorization.role !== 'staff') return true
  return authorization.permissions[permission] === true
}
