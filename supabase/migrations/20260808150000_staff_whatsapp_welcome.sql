-- Tracks whether a staff member has already received the one-time
-- WhatsApp onboarding message (messageHandler.js's staff welcome flow)
-- explaining how the bot works for them (Accept/Reject/Edit buttons,
-- dashboard link). Null = not yet sent; set once, on first contact.
alter table shop_users
  add column if not exists whatsapp_welcomed_at timestamptz;
