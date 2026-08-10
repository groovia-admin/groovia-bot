-- Daily summary: previous day's orders/revenue/top-products, pushed to
-- staff each morning at a per-shop configurable time. Off by default --
-- an existing shop shouldn't suddenly start getting a new proactive
-- WhatsApp push it never opted into.
alter table shop_settings
  add column if not exists daily_summary_enabled boolean not null default false,
  add column if not exists daily_summary_time text not null default '08:00',
  add column if not exists last_daily_summary_sent_date date;

comment on column shop_settings.daily_summary_time is
  'HH:MM, 24-hour, in the shop''s own timezone (shops.timezone) -- same convention as business_hours.open/close.';
comment on column shop_settings.last_daily_summary_sent_date is
  'Date (shop-local) the summary was last sent -- the claim column processDueDailySummaries updates atomically before sending, so two overlapping ticks can''t both send it.';
