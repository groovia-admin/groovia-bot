import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import Sidebar from '@/components/Sidebar'

type ShopUserForSidebar = {
  role: string
  full_name: string
  shops?: { name: string; logo_url: string | null } | null
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const adminClient = createAdminClient()

  const { data: adminRecord } = await adminClient
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()

  const isSuperAdmin = !!adminRecord

  let shopUser: ShopUserForSidebar | null = null

  if (!isSuperAdmin) {
    const { data, error } = await adminClient
      .from('shop_users')
      .select(`
        role,
        full_name,
        shops ( name, logo_url )
      `)
      .eq('auth_user_id', user.id)
      .eq('is_active', true)
      .maybeSingle()

    if (error || !data) redirect('/login')

    const shop = Array.isArray(data.shops) ? data.shops[0] ?? null : data.shops
    shopUser = {
      role: data.role,
      full_name: data.full_name,
      shops: shop,
    }
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: 'var(--surface)' }}>
      <Sidebar
        isSuperAdmin={isSuperAdmin}
        shopUser={shopUser}
        userPhone={user.phone ?? user.email ?? ''}
      />
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  )
}
