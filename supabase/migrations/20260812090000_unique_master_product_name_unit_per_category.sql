-- Mirrors products_shop_name_unit_unique (20260811090000) for the master
-- catalog: prevents two master_products rows with the same name+unit
-- inside one master_category. The catalog UI already checks this
-- client-side before insert; this is the guard against a race between two
-- concurrent requests, same reasoning as the shop-level index.
--
-- NOTE: if a master_category already has duplicate name+unit rows, this
-- migration will fail to apply until those are manually resolved — it does
-- not attempt to silently delete or merge any existing data.
create unique index if not exists master_products_category_name_unit_unique
  on master_products (master_category_id, lower(name), lower(unit));
