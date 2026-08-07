-- Atomic stock adjustment, called from the dashboard/wa-bot server (service
-- role only, never exposed to a browser client) whenever an order accept
-- decrements stock or a cancel/reject restores it. A plain
-- "read stock_quantity, subtract in JS, write it back" would race under
-- concurrent order acceptances on the same product; doing the arithmetic
-- inside a single UPDATE avoids that entirely. Clamped at 0 so a data
-- inconsistency can't push stock negative.
create or replace function adjust_product_stock(p_product_id uuid, p_delta integer)
returns integer
language plpgsql
as $$
declare
  new_quantity integer;
begin
  update products
  set stock_quantity = greatest(stock_quantity + p_delta, 0),
      updated_at = now()
  where id = p_product_id
  returning stock_quantity into new_quantity;

  return new_quantity;
end;
$$;
