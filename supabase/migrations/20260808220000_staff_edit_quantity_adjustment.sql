-- Supports quantity adjustment (not just whole-item removal) in the
-- staff order-edit flow, and lets the edit session tell the customer
-- what actually changed when it's done.
alter table staff_order_edits
  add column if not exists pending_item_id uuid references order_items(id) on delete set null,
  add column if not exists original_items_snapshot jsonb;

comment on column staff_order_edits.pending_item_id is
  'Set while waiting for a staff reply to a "what should the new quantity be" prompt -- the next text reply is interpreted as that quantity, not a generic edit command.';
comment on column staff_order_edits.original_items_snapshot is
  'Item list (id/name/quantity/unit_price/subtotal) captured when the edit session started, so the session can diff against the current state at "done" and tell the customer what changed.';
