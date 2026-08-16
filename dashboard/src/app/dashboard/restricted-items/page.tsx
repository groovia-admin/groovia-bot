import { createAdminClient } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/auth/require-role'
import RestrictedItemsClient from '@/components/restricted-items/RestrictedItemsClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function RestrictedItemsPage() {
  await requireSuperAdmin()

  const adminClient = createAdminClient()

  const { data: terms, error } = await adminClient
    .from('restricted_product_terms')
    .select('id, term, created_at')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Failed to load restricted terms:', error)
  }

  return (
    <div>
      <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 800, color: 'var(--ink)', margin: '0 0 4px' }}>Restricted Items</h1>
      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-muted)', margin: '0 0 20px' }}>
        A product whose name matches any term below can&apos;t be created by any shop, platform-wide. Case-insensitive, matches
        anywhere in the name.
      </p>
      <RestrictedItemsClient initialTerms={terms ?? []} />
    </div>
  )
}
