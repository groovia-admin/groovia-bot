import type { SupabaseClient } from '@supabase/supabase-js'
import { notifyWaBot } from './notifyWaBot'

// Fire-and-forget: called from every place that flips a product's
// is_available (the manual products PATCH route, and order placement
// when a reservation takes the last unit) so a shop that's opted in
// doesn't have to wait for someone to notice and manually sync. Checks
// the flag itself rather than trusting the caller, since this is cheap
// (one indexed row read) and every caller would otherwise need to
// duplicate the same check.
export async function triggerCatalogAutoSyncIfEnabled(adminClient: SupabaseClient, shopId: string) {
  const { data: settings, error } = await adminClient
    .from('shop_settings')
    .select('catalog_auto_sync_enabled')
    .eq('shop_id', shopId)
    .maybeSingle()

  if (error) {
    console.error('Failed to check catalog_auto_sync_enabled:', error)
    return
  }

  if (!settings?.catalog_auto_sync_enabled) return

  const waBotUrl = process.env.WA_BOT_INTERNAL_URL
  const internalSecret = process.env.INTERNAL_API_SECRET
  if (!waBotUrl || !internalSecret) return

  const base = waBotUrl.replace(/\/$/, '')
  notifyWaBot(base, internalSecret, `/internal/shops/${shopId}/sync-catalog`, {}, 'the catalog auto-sync')
}
