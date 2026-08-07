-- Phase 3 (v2 architecture): delivery linkage on orders.
--
-- Most of "address/delivery schema" already existed before this
-- migration: shop_settings already carries delivery capability
-- (allow_delivery, delivery_fee, delivery_radius_km, free_delivery_above)
-- and customer_addresses already exists (label, address lines, landmark,
-- city/state/postal_code, lat/long, is_default). What's still missing is
-- a way for an order to actually record which saved address a delivery
-- used, and the constraint that lets order_type be anything but
-- 'pickup'. No wa-bot or dashboard code consumes this yet -- Phase 6
-- (order submission) is what will populate these columns once the
-- ordering webview (Phase 5) exists.

-- A customer can save several addresses but only one can be "the"
-- default -- a bare boolean column can't enforce that on its own.
-- Guarded with IF NOT EXISTS since it's unverified whether an equivalent
-- constraint already exists under a different name from whenever
-- customer_addresses was first created.
create unique index if not exists customer_addresses_one_default_per_customer
  on customer_addresses (customer_id) where is_default;

-- Same generated-geography pattern as shops.geog (Phase 2) -- derived
-- from lat/long rather than maintained separately. Powers the
-- distance-based delivery-eligibility/fee check Phase 6 will need
-- (comparing a customer_addresses row against the shop's own geog and
-- shop_settings.delivery_radius_km).
alter table customer_addresses
  add column if not exists geog geography(Point, 4326)
  generated always as (
    case when longitude is not null and latitude is not null
      then st_setsrid(st_makepoint(longitude, latitude), 4326)::geography
      else null
    end
  ) stored;

create index if not exists idx_customer_addresses_geog
  on customer_addresses using gist (geog);

-- Which saved address a delivery order used, and roughly how far --
-- both nullable, since a pickup order (still the only kind that exists
-- today) has neither. on delete set null rather than cascade: if a
-- customer later deletes the address, the order itself must survive
-- untouched -- the actual delivery details already live in
-- order_customer_details.delivery_address_snapshot (existing jsonb
-- column, currently unused), snapshotted at order-creation time exactly
-- like the existing customer_name_snapshot/customer_phone_snapshot, so a
-- later address edit/delete can never change what an already-placed
-- order says it was delivered to.
alter table orders
  add column if not exists delivery_address_id uuid references customer_addresses(id) on delete set null,
  add column if not exists delivery_distance_km numeric;

-- order_type has only ever held 'pickup' so far -- widen whatever check
-- constraint exists today to also allow 'delivery', without needing to
-- know its exact (possibly auto-generated) name.
do $$
declare
  con record;
begin
  for con in
    select conname from pg_constraint
    where conrelid = 'orders'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%order_type%'
  loop
    execute format('alter table orders drop constraint %I', con.conname);
  end loop;
end $$;

alter table orders
  add constraint orders_order_type_check check (order_type in ('pickup', 'delivery'));
