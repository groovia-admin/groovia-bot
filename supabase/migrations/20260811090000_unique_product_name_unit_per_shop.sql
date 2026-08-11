-- Prevents a shop from having two products with the same name + unit
-- (case-insensitive) — the dashboard's add-product form was allowing exact
-- duplicates with no check at all. The API route now also checks before
-- insert for a clean error message; this index is the real guard against
-- a race between two concurrent requests creating the same product twice.
--
-- NOTE: if this shop (or any shop) already has duplicate name+unit rows,
-- this migration will fail to apply until those are manually resolved
-- (renamed or merged) — it does not attempt to silently delete or merge
-- any existing data.
create unique index if not exists products_shop_name_unit_unique
  on products (shop_id, lower(name), lower(unit));
