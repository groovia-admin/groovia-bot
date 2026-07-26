import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Check platform_admins
  const { data: adminRecord } = await supabase
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .single()

  const isSuperAdmin = !!adminRecord

  // Get shop user record for non-admins
  let shopUser: {
    role: string
    full_name: string
    shops?: { name: string; logo_url: string | null } | undefined
  } | null = null

  if (!isSuperAdmin) {
    const { data } = await supabase
      .from('shop_users')
      .select('role, full_name, shops(name, logo_url)')
      .eq('user_id', user.id)
      .single()

    if (data) {
      shopUser = {
        role:      data.role as string,
        full_name: data.full_name as string,
        shops:     Array.isArray(data.shops)
             ? (data.shops[0] ?? undefined)
             : (data.shops as { name: string; logo_url: string | null } | undefined)
      }
    }
  }

  const userPhone = user.phone ?? user.email ?? 'Admin'

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0f172a' }}>
      <Sidebar
        isSuperAdmin={isSuperAdmin}
        shopUser={shopUser}
        userPhone={userPhone}
      />
      <main style={{
        marginLeft: '256px',
        flex: 1,
        minHeight: '100vh',
        padding: '28px 32px',
        overflowY: 'auto',
        background: '#0f172a'
      }}>
        {children}
      </main>
    </div>
  )
}