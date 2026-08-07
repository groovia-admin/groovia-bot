-- Phase 8 (v2 architecture): order reminders + auto-reject. Folded into
-- Phase 8 (cron/earnings/QR) per an explicit later addition to the v2
-- build brief -- staff who don't act on a pending order get nudged, and
-- a shop can optionally have an ignored order auto-reject after a
-- configured timeout rather than leaving a customer waiting forever.

alter table orders
  add column if not exists reminder_count integer not null default 0,
  add column if not exists last_reminder_at timestamptz;

comment on column orders.reminder_count is
  'How many reminder pings staff have been sent for this order while still pending. Capped in application code (reminderService.js), not here.';

-- Defaults to enabled -- a reminder is a low-risk nudge, unlike
-- auto-reject below, which is consequential enough that a shop should
-- opt in explicitly rather than have orders silently auto-reject by
-- default the moment this ships.
alter table shop_settings
  add column if not exists reminder_enabled boolean not null default true,
  add column if not exists auto_reject_after_minutes integer;

comment on column shop_settings.auto_reject_after_minutes is
  'Minutes after the staff alert before a still-pending order is automatically rejected. Null = disabled (never auto-rejects).';
