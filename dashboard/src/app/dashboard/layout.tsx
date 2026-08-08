import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getViewerContext } from '@/lib/auth/viewer-context'
import Sidebar from '@/components/Sidebar'
import { ToastProvider } from '@/components/ui/ToastProvider'
import OrderAlertListener from '@/components/orders/OrderAlertListener'

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

  const isSuperAdmin = context.kind === 'super_admin'

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
          {!isSuperAdmin && <OrderAlertListener />}
          <div className="p-6 lg:p-8">
            {children}
          </div>
        </ToastProvider>
      </main>
    </div>
  )
}
