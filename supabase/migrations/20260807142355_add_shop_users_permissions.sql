-- Per-staff-member action permissions, layered on top of the existing role
-- model. Only meaningful for role = 'staff' — owner and manager keep full
-- access to everything their role already allows, unaffected by this
-- column. Lets an owner grant/revoke specific actions (e.g. "can accept
-- orders" without "can edit products") per staff member instead of the
-- previous all-or-nothing staff role.
alter table shop_users
  add column if not exists permissions jsonb not null default '{}'::jsonb;

comment on column shop_users.permissions is
  'Per-staff action grants (role=staff only). Keys: manage_orders, manage_products, manage_inventory. Owner/manager ignore this and always have full access.';
