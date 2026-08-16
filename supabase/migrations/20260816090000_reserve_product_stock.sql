-- Atomic, race-safe stock reservation for order placement.
--
-- adjust_product_stock (existing) always "succeeds" and silently clamps
-- at 0 — fine for restoring stock (which should never fail), wrong for
-- reserving it: two concurrent placements for the last unit of something
-- would both pass a plain "read then check then write" and both clamp to
-- 0, i.e. both succeed, overselling by one unit. This does the check and
-- the decrement in a single UPDATE, so only one of two concurrent callers
-- can ever win the last unit — the other gets NULL back and must not
-- treat that as "reserved 0", it means nothing was reserved at all.
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

  return new_quantity; -- null when the WHERE clause matched no row (not enough stock)
end;
$$;
