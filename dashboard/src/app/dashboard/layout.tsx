import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import Sidebar from '@/components/layout/Sidebar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Admin client for privilege checks — bypasses RLS so we get accurate results
  const adminClient = createAdminClient()

  const { data: adminRecord } = await adminClient
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .single()

  const isSuperAdmin = !!adminRecord

  let shopUser = null
  if (!isSuperAdmin) {
    const { data } = await adminClient
      .from('shop_users')
      .select(`
        id, role, full_name, phone, shop_id,
        shops ( name, logo_url )
      `)
      .eq('auth_user_id', user.id)
      .eq('is_active', true)
      .single()

    shopUser = data
    if (!shopUser) redirect('/login')
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: 'var(--surface)' }}>
      <Sidebar
        isSuperAdmin={isSuperAdmin}
        shopUser={shopUser}
        userPhone={user.phone ?? ''}
      />
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  )
}