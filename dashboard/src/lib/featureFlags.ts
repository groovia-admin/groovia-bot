// Single source of truth for which shop_settings columns are exposed as
// Super-Admin-controlled per-shop feature flags — shared by the admin
// API route (validation) and the Super Admin UI (rendering), so adding a
// flag later means adding one entry here, not touching both places by
// hand. No server-only imports, so this is safe to import from client
// components too.
export type FeatureFlagKey = 'catalog_auto_sync_enabled' | 'block_mobile_dashboard_enabled'

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
  {
    key: 'block_mobile_dashboard_enabled',
    label: 'Block mobile dashboard access',
    description:
      'Staff are already blocked from opening the dashboard on a mobile browser. Turning this on extends that same block to owners and managers at this shop too.',
  },
]

export const FLAG_KEYS = FLAG_DEFINITIONS.map((f) => f.key)

export type FeatureFlags = Record<FeatureFlagKey, boolean>
