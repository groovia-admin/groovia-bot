import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'

type PublicShopPageProps = {
  params: Promise<{
    slug: string
  }>
}

export default async function PublicShopPage({
  params,
}: PublicShopPageProps) {
  const { slug } = await params

  const adminClient = createAdminClient()

  const { data: shop, error } = await adminClient
    .from('shops')
    .select(`
      id,
      slug,
      name,
      description,
      logo_url,
      address_line_1,
      city,
      state,
      country,
      is_active
    `)
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    console.error('Failed to load public shop:', error)
  }

  if (!shop) {
    notFound()
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <section className="mx-auto max-w-4xl px-6 py-12">
        <div className="rounded-2xl bg-white p-8 shadow-sm">
          {shop.logo_url ? (
            <img
              src={shop.logo_url}
              alt={`${shop.name} logo`}
              className="mb-6 h-20 w-20 rounded-xl object-cover"
            />
          ) : (
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-xl bg-blue-600 text-3xl font-bold text-white">
              {shop.name.charAt(0).toUpperCase()}
            </div>
          )}

          <h1 className="text-3xl font-bold text-slate-900">
            {shop.name}
          </h1>

          {(shop.city || shop.state) && (
            <p className="mt-2 text-slate-500">
              {[shop.city, shop.state]
                .filter(Boolean)
                .join(', ')}
            </p>
          )}

          {shop.address_line_1 && (
            <p className="mt-1 text-slate-500">
              {shop.address_line_1}
            </p>
          )}

          {shop.description && (
            <p className="mt-6 text-slate-600">
              {shop.description}
            </p>
          )}

          <div className="mt-10 rounded-xl border border-dashed border-slate-300 p-8 text-center">
            <h2 className="text-xl font-semibold text-slate-800">
              Online store coming soon
            </h2>

            <p className="mt-2 text-slate-500">
              Products and ordering will be available here.
            </p>
          </div>
        </div>
      </section>
    </main>
  )
}