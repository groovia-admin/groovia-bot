import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: adminRecord } = await supabase
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .single()

  const isSuperAdmin = !!adminRecord

  let shopUser = null
  if (!isSuperAdmin) {
    const { data } = await supabase
      .from('shop_users')
      .select('role, full_name, shops(name, logo_url)')
      .eq('user_id', user.id)
      .single()

    shopUser = data ? {
      role: data.role as string,
      full_name: data.full_name as string,
      shops: Array.isArray(data.shops) ? data.shops[0] ?? null : data.shops ?? null
    } : null
  }

  const userPhone = user.phone ?? user.email ?? ''

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0f172a' }}>
      <Sidebar
        isSuperAdmin={isSuperAdmin}
        shopUser={shopUser}
        userPhone={userPhone}
      />
      <main style={{ marginLeft: '256px', flex: 1, padding: '24px', overflowY: 'auto' }}>
        {children}
      </main>
    </div>
  )
}