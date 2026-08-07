import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ShopRole } from '@/types/database'
import type { StaffPermission } from './require-shop-role'

export type ViewerContext =
  | { kind: 'unauthenticated' }
  | { kind: 'super_admin'; userId: string }
  | {
      kind: 'shop_user'
      userId: string
      shopId: string
      role: ShopRole
      fullName: string
      shopName: string | null
      shopLogoUrl: string | null
      shopTimezone: string
      permissions: Partial<Record<StaffPermission, boolean>>
    }

/** Owner/manager always pass; staff need the specific permission granted. */
export function viewerHasPermission(context: ViewerContext, permission: StaffPermission): boolean {
  if (context.kind !== 'shop_user') return false
  if (context.role !== 'staff') return true
  return context.permissions[permission] === true
}

/**
 * Resolves the current request's viewer once (super admin vs. shop user vs.
 * none), memoized per-request via React `cache()` so layout.tsx and every
 * page under it share a single query instead of each re-deriving it.
 */
export const getViewerContext = cache(async (): Promise<ViewerContext> => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { kind: 'unauthenticated' }

  const adminClient = createAdminClient()

  const { data: adminRecord } = await adminClient
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (adminRecord) {
    return { kind: 'super_admin', userId: user.id }
  }

  const { data, error } = await adminClient
    .from('shop_users')
    .select('shop_id, role, full_name, permissions, shops ( name, logo_url, timezone )')
    .eq('auth_user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (error || !data) {
    return { kind: 'unauthenticated' }
  }

  const shop = Array.isArray(data.shops) ? (data.shops[0] ?? null) : data.shops

  return {
    kind: 'shop_user',
    userId: user.id,
    shopId: data.shop_id,
    role: data.role as ShopRole,
    fullName: data.full_name,
    shopName: shop?.name ?? null,
    shopLogoUrl: shop?.logo_url ?? null,
    shopTimezone: shop?.timezone || 'Asia/Kolkata',
    permissions: (data.permissions as Partial<Record<StaffPermission, boolean>>) ?? {},
  }
})
