-- Per-shop feature flag: Super Admin controls whether stock-driven
-- availability changes get automatically pushed to this shop's Meta
-- Commerce Catalog. Off by default — a shop shouldn't get live catalog
-- pushes until Super Admin has verified its WhatsApp Commerce Catalog is
-- actually connected. Follows this schema's existing convention (see
-- daily_summary_enabled, reminder_enabled) of one dedicated boolean per
-- feature rather than a generic flags blob.
alter table shop_settings
  add column if not exists catalog_auto_sync_enabled boolean not null default false;

-- is_available now tracks stock_quantity's zero boundary automatically,
-- inside the two functions that already atomically adjust stock — so it
-- can't drift out of sync the way it could when nothing but a manual
-- dashboard toggle ever touched it. Only acts at the boundary (crossing
-- to/from zero), never unconditionally, so a staff member's manual hide
-- of an in-stock item for unrelated reasons (discontinued, out of
-- season) isn't silently undone by an unrelated stock movement on that
-- same product.
create or replace function adjust_product_stock(p_product_id uuid, p_delta integer)
returns integer
language plpgsql
as $$
declare
  old_quantity integer;
  new_quantity integer;
begin
  update products
  set stock_quantity = greatest(stock_quantity + p_delta, 0),
      updated_at = now()
  where id = p_product_id
  returning stock_quantity, stock_quantity - p_delta into new_quantity, old_quantity;

  if new_quantity <= 0 then
    update products set is_available = false where id = p_product_id;
  elsif old_quantity <= 0 and new_quantity > 0 then
    update products set is_available = true where id = p_product_id;
  end if;

  return new_quantity;
end;
$$;

-- reserve_product_stock only ever decreases stock, so there's no
-- "crossed back above zero" case to handle here — only the hide side.
create or replace function reserve_product_stock(p_product_id uuid, p_qty integer)
returns integer
language plpgsql
as $$
declare
  new_quantity integer;
begin
  update products
  set stock_quantity = stock_quantity - p_qty,
      updated_at = now()
  where id = p_product_id
    and stock_quantity >= p_qty
  returning stock_quantity into new_quantity;

  if new_quantity is not null and new_quantity <= 0 then
    update products set is_available = false where id = p_product_id;
  end if;

  return new_quantity; -- null when the WHERE clause matched no row (not enough stock)
end;
$$;
