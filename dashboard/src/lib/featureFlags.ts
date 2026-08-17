// Single source of truth for which shop_settings columns are exposed as
// Super-Admin-controlled per-shop feature flags — shared by the admin
// API route (validation) and the Super Admin UI (rendering), so adding a
// flag later means adding one entry here, not touching both places by
// hand. No server-only imports, so this is safe to import from client
// components too.
export type FeatureFlagKey = 'catalog_auto_sync_enabled'

export type FeatureFlagDefinition = {
  key: FeatureFlagKey
  label: string
  description: string
}

export const FLAG_DEFINITIONS: FeatureFlagDefinition[] = [
  {
    key: 'catalog_auto_sync_enabled',
    label: 'Catalog auto-sync',
    description:
      "Automatically push stock/availability changes to this shop's WhatsApp Commerce Catalog. Turn on only after WhatsApp and a Meta Commerce Catalog are connected — see \"Manage WhatsApp\" for this shop.",
  },
]

export const FLAG_KEYS = FLAG_DEFINITIONS.map((f) => f.key)

export type FeatureFlags = Record<FeatureFlagKey, boolean>
