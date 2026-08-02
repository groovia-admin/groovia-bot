import { requireSuperAdmin } from '@/lib/auth/require-role'
import MasterCatalogClient from '@/components/catalog/MasterCatalogClient'

export default async function MasterCatalogPage() {
  await requireSuperAdmin()

  return <MasterCatalogClient />
}
