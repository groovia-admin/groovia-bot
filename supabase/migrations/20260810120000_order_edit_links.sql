-- Signed, no-login links for the staff order-edit page (replaces the
-- dashboard-login-gated /dashboard/orders/[id] link previously sent from
-- WhatsApp -- the dashboard itself has no mobile layout, so sending
-- staff there from a phone was the wrong access model regardless of the
-- login friction on top of it). Same hashed-random-token pattern as
-- order_sessions (see wa-bot/src/services/sessionService.js /
-- dashboard/src/lib/orderSession.ts) -- only the hash is ever stored.
--
-- No status column: unlike order_sessions (one-time order placement),
-- an edit link can be opened/used repeatedly while it's valid. The real
-- access gate is orders.status = 'pending', already re-checked on every
-- mutation by the API route this backs -- once an order is actioned,
-- a still-unexpired link becomes functionally inert on its own.
create table if not exists order_edit_links (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  shop_id uuid not null references shops(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_order_edit_links_token_hash on order_edit_links (token_hash);
create index if not exists idx_order_edit_links_order_id on order_edit_links (order_id);
