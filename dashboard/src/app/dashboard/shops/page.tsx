import { createAdminClient } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/auth/require-role'
import ShopsClient from '@/components/shops/ShopsClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function ShopsPage() {
  await requireSuperAdmin()

  const adminClient = createAdminClient()

  const { data: shops, error } =
    await adminClient
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
      .order('created_at', {
        ascending: false,
      })

  if (error) {
    console.error(
      'Failed to load shops:',
      error
    )
  }

  return (
    <ShopsClient
      initialShops={shops ?? []}
    />
  )
}