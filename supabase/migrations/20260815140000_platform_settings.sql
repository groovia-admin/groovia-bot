-- Platform-level configuration a super admin manages centrally, instead of
-- values hardcoded in the app (the login page's support contact) or simply
-- missing (there's currently no way to tell every shop owner about planned
-- downtime without messaging each one individually). Singleton table —
-- `id` is forced to the literal value `true` so there can only ever be one
-- row, matching the common Postgres singleton-config pattern.
create table if not exists platform_settings (
  id boolean primary key default true,
  constraint platform_settings_singleton check (id),
  support_email text,
  support_phone text,
  announcement_message text,
  announcement_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into platform_settings (id)
values (true)
on conflict (id) do nothing;
