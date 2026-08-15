-- Preset reasons a shop owner can pick from when rejecting/cancelling an
-- order, instead of always typing free text. Editable per shop from
-- Settings; the reject/cancel flow still allows custom text alongside
-- these presets — this doesn't replace that, just gives a faster default.
alter table shop_settings
  add column if not exists order_decline_reasons jsonb not null default '[
    "Out of stock",
    "Shop closed",
    "Customer unreachable",
    "Customer requested cancellation",
    "Duplicate order"
  ]'::jsonb;
