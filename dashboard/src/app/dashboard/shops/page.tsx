import { createAdminClient } from '@/lib/supabase/admin'
import ShopsClient from '@/components/shops/ShopsClient'

export default async function ShopsPage() {
  const adminClient = createAdminClient()

  const { data: shops, error } = await adminClient
    .from('shops')
    .select(`
      id,
      slug,
      name,
      city,
      state,
      is_active,
      subscription_status,
      trial_ends_at,
      created_at,
      updated_at
    `)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Failed to fetch shops:', error)
  }

  return <ShopsClient initialShops={shops ?? []} />
}
