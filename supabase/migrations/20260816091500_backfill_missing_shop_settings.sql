-- Any shop created before shop creation started seeding a default
-- shop_settings row (see dashboard's admin shop-creation route) has no
-- row at all, which silently disables the reminder job for that shop
-- (wa-bot/src/services/reminderService.js: `if (!settings) continue`).
-- Purely additive — only inserts a row for a shop that has none; never
-- touches an existing shop_settings row.
insert into shop_settings (shop_id)
select s.id
from shops s
left join shop_settings ss on ss.shop_id = s.id
where ss.shop_id is null;
