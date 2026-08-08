-- Stores the customer's WhatsApp profile name at session-creation time
-- (startCustomerOrderingSession already has it in hand) so the webview
-- checkout form can pre-fill the "Your name" field instead of asking a
-- customer to retype something the bot already knows, for both
-- first-time and repeat customers alike (no customers row exists yet
-- for a first-time customer at session-creation time, so this is the
-- only reliable source either way).
alter table order_sessions
  add column if not exists customer_name text;
