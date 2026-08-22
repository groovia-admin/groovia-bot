-- layout.tsx already blocks mobile-browser dashboard access, but only
-- for role='staff', hardcoded — owners/managers can always use mobile.
-- This lets Super Admin extend that same block to everyone at a shop,
-- per the FLAG_DEFINITIONS convention (dashboard/src/lib/featureFlags.ts).
alter table shop_settings
  add column if not exists block_mobile_dashboard_enabled boolean not null default false;
