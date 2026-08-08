-- Fix for a live bug: the webview's order-submission route
-- (dashboard/src/app/api/public/session/[token]/order/route.ts) sets
-- orders.created_via = 'webview', but the existing check constraint on
-- that column only ever allowed 'whatsapp' (the only value ever set in
-- code before Phase 6) -- every webview order submission failed
-- outright with "new row for relation orders violates check constraint
-- orders_created_via_check", surfaced to the customer as a generic
-- "something went wrong placing your order".
--
-- Reproduced directly against production before writing this: an
-- otherwise-valid order insert with created_via='webview' failed with
-- exactly that constraint violation (code 23514). Confirmed via a full
-- codebase search that 'whatsapp' and 'webview' are the only two values
-- ever set anywhere in code -- no third value (e.g. a dashboard-side
-- manual order feature) exists to account for.
--
-- Same "find and drop whatever constraint exists today, without
-- needing its exact (possibly auto-generated) name" pattern already
-- used for orders.order_type in the Phase 3 migration.
do $$
declare
  con record;
begin
  for con in
    select conname from pg_constraint
    where conrelid = 'orders'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%created_via%'
  loop
    execute format('alter table orders drop constraint %I', con.conname);
  end loop;
end $$;

alter table orders
  add constraint orders_created_via_check check (created_via in ('whatsapp', 'webview'));
