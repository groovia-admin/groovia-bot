import { createClient } from '@/lib/supabase/server'
import ShopsClient from '@/components/shops/ShopsClient'

export default async function ShopsPage() {
  const supabase = await createClient()

  const { data: shops, error } = await supabase
  .from('shops')
  .select(`
    id, slug, name, city, state, is_active,
    subscription_status, trial_ends_at, created_at, updated_at,
    shop_users!inner(full_name, role, auth_user_id)
  `)
  .eq('shop_users.role', 'owner')
  .order('created_at', { ascending: false })

  if (error) {
    console.error('Failed to fetch shops:', error)
  }

  return <ShopsClient initialShops={shops ?? []} />
}