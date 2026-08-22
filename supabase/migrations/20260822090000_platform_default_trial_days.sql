-- Nothing in app code ever set a new shop's trial length — the
-- create_shop_with_owner RPC never received one, so trial_ends_at was
-- whatever that opaque DB function did internally (or null). This makes
-- the default a single admin-configurable number instead of a value
-- hidden inside a function nobody's app-code touches.
alter table platform_settings
  add column if not exists default_trial_days integer not null default 30;
