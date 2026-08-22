import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { Megaphone } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getViewerContext } from '@/lib/auth/viewer-context'
import Sidebar from '@/components/Sidebar'
import { ToastProvider } from '@/components/ui/ToastProvider'
import NotificationBell from '@/components/notifications/NotificationBell'
import GlobalSearch from '@/components/search/GlobalSearch'
import OrderAlertListener from '@/components/orders/OrderAlertListener'
import IdleLogout from '@/components/auth/IdleLogout'
import StaffMobileBlocked from '@/components/auth/StaffMobileBlocked'

// Broad on purpose (also catches tablets) — staff dashboard access is meant
// to be a desktop/laptop tool; role resolution already requires a DB round
// trip via getViewerContext() below, so this rides along with that instead
// of adding a separate check in middleware (which deliberately avoids DB
// queries — see middleware.ts).
const MOBILE_UA_REGEX = /Mobi|Android|iPhone|iPad|iPod|Windows Phone/i

type ShopUserForSidebar = {
  role: string
  full_name: string
  shops?: { name: string; logo_url: string | null } | null
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const context = await getViewerContext()
  if (context.kind === 'unauthenticated') redirect('/login')

  if (context.kind === 'shop_user') {
    const userAgent = (await headers()).get('user-agent') ?? ''
    const isMobileUa = MOBILE_UA_REGEX.test(userAgent)

    // Staff are always blocked on mobile — the baseline this codebase
    // already shipped. Owners/managers are only blocked too if Super
    // Admin has turned block_mobile_dashboard_enabled on for this shop
    // (see FLAG_DEFINITIONS) — off by default, so this is strictly an
    // extension of the existing rule, never a relaxation of it.
    if (isMobileUa && context.role === 'staff') {
      return <StaffMobileBlocked />
    }

    if (isMobileUa && context.role !== 'staff') {
      const { data: mobileBlockSettings } = await createAdminClient()
        .from('shop_settings')
        .select('block_mobile_dashboard_enabled')
        .eq('shop_id', context.shopId)
        .maybeSingle()

      if (mobileBlockSettings?.block_mobile_dashboard_enabled) {
        return <StaffMobileBlocked audience="shop" />
      }
    }
  }

  const isSuperAdmin = context.kind === 'super_admin'

  // Platform-wide notice a super admin can turn on from Settings — e.g.
  // planned downtime — shown to shop-side users only, not the super admin
  // who's the one setting it.
  let announcement: string | null = null
  if (context.kind === 'shop_user') {
    const { data: platformSettings } = await createAdminClient()
      .from('platform_settings')
      .select('announcement_message, announcement_enabled')
      .eq('id', true)
      .maybeSingle()
    if (platformSettings?.announcement_enabled && platformSettings.announcement_message) {
      announcement = platformSettings.announcement_message
    }
  }

  const shopUser: ShopUserForSidebar | null =
    context.kind === 'shop_user'
      ? {
          role: context.role,
          full_name: context.fullName,
          shops: context.shopName
            ? { name: context.shopName, logo_url: context.shopLogoUrl }
            : null,
        }
      : null

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: 'var(--surface)' }}>
      <Sidebar
        isSuperAdmin={isSuperAdmin}
        shopUser={shopUser}
        userPhone={user.phone ?? user.email ?? ''}
      />
      <main className="flex-1 overflow-y-auto">
        <ToastProvider>
          <IdleLogout />
          {!isSuperAdmin && <OrderAlertListener />}
          {announcement && (
            <div style={{ background: '#FFF7ED', borderBottom: '1px solid #FED7AA', padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-sm)', color: '#9A3412' }}>
              <Megaphone size={15} style={{ flexShrink: 0 }} />
              <span>{announcement}</span>
            </div>
          )}
          {!isSuperAdmin && (
            <div style={{ padding: '14px 24px 0', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10 }}>
              <GlobalSearch />
              {context.kind === 'shop_user' && (context.role === 'owner' || context.role === 'manager') && (
                <NotificationBell />
              )}
            </div>
          )}
          <div className="p-6 lg:p-8">
            {children}
          </div>
        </ToastProvider>
      </main>
    </div>
  )
}
