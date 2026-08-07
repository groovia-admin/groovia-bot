# PR Merge History

| PR | Title | Area | Author | Merged By | Merged At (UTC) | Time to Merge |
|----|-------|------|--------|-----------|------------------|----------------|
| #35 | Add customer ordering core loop (native WhatsApp Catalog + Cart) | wa-bot | @groovia-admin | @groovia-admin | 2026-08-02 14:33 UTC | 0d 0h 0m |
| #36 | Fix catalog sync to use shop's currency_code instead of hardcoded INR | wa-bot | @groovia-admin | @groovia-admin | 2026-08-02 14:45 UTC | 0d 0h 0m |
| #37 | Fix catalog sync price format and add required link field | wa-bot | @groovia-admin | @groovia-admin | 2026-08-02 15:53 UTC | 0d 0h 0m |
| #38 | Add required brand field, skip imageless products, surface Graph API … | wa-bot | @groovia-admin | @groovia-admin | 2026-08-02 16:13 UTC | 0d 0h 0m |
| #39 | Bot product image upload | dashboard + wa-bot | @groovia-admin | @groovia-admin | 2026-08-03 09:22 UTC | 0d 0h 0m |
| #40 | Fix items_batch request envelope: add item_type, move id into data | wa-bot | @groovia-admin | @groovia-admin | 2026-08-03 14:43 UTC | 0d 0h 0m |
| #41 | Fix items_batch product name field: title, not name | wa-bot | @groovia-admin | @groovia-admin | 2026-08-03 15:28 UTC | 0d 0h 0m |
| #42 | Bot security review fixes | dashboard + wa-bot | @groovia-admin | @groovia-admin | 2026-08-04 04:32 UTC | 0d 0h 2m |
| #43 | Replace typed ACCEPT/REJECT commands with tap-to-act buttons for staff | wa-bot | @groovia-admin | @groovia-admin | 2026-08-04 04:33 UTC | 0d 0h 0m |
| #44 | Bot fix order status log catch crash | wa-bot | @groovia-admin | @groovia-admin | 2026-08-04 05:17 UTC | 0d 0h 0m |
| #45 | Let staff remove out-of-stock items from an order before accepting | wa-bot | @groovia-admin | @groovia-admin | 2026-08-04 05:18 UTC | 0d 0h 0m |
| #46 | Bot fix edit session silent failure | wa-bot | @groovia-admin | @groovia-admin | 2026-08-04 08:40 UTC | 0d 0h 0m |
| #47 | Add audit logging and a real shop-settings UI backed by shop_settings | dashboard + wa-bot | @groovia-admin | @groovia-admin | 2026-08-04 11:24 UTC | 0d 0h 0m |
| #49 | Bot login logs and owner email fix | dashboard | @groovia-admin | @groovia-admin | 2026-08-05 09:37 UTC | 0d 0h 0m |
| #51 | Dashboard UX fixes: cost price, category deletion, toasts, logo upload | dashboard | @groovia-admin | @groovia-admin | 2026-08-05 09:49 UTC | 0d 0h 0m |
| #50 | Bot whatsapp connection super admin only | dashboard | @groovia-admin | @groovia-admin | 2026-08-05 09:49 UTC | 0d 0h 0m |
| #52 | Fall back to en_US if a customer template send fails under en | wa-bot | @groovia-admin | @groovia-admin | 2026-08-05 15:56 UTC | 0d 0h 0m |
| #53 | Bot fix template parameter modes | wa-bot | @groovia-admin | @groovia-admin | 2026-08-05 15:57 UTC | 0d 0h 0m |
| #54 | Bot staff cap and conversation tracking | dashboard + wa-bot | @groovia-admin | @groovia-admin | 2026-08-05 16:11 UTC | 0d 0h 0m |
| #55 | Bridge Master Catalog to shop categories/products, protect from deletion | dashboard | @groovia-admin | @groovia-admin | 2026-08-05 16:13 UTC | 0d 0h 0m |
| #56 | Bot log failed status errors | wa-bot | @groovia-admin | @groovia-admin | 2026-08-05 16:30 UTC | 0d 0h 0m |
| #57 | Revert "Bridge Master Catalog to shop categories/products, protect fr… | dashboard | @groovia-admin | @groovia-admin | 2026-08-05 16:31 UTC | 0d 0h 0m |
| #58 | Add catch-up resend for orders stuck pending from before delivery tra… | wa-bot | @groovia-admin | @groovia-admin | 2026-08-05 16:43 UTC | 0d 0h 0m |
| #59 | Fix language-fallback ordering: always try the template's own configu… | wa-bot | @groovia-admin | @groovia-admin | 2026-08-05 16:58 UTC | 0d 0h 0m |
| #60 | Fix logo/product-image upload File ReferenceError; dark-theme placeho… | dashboard | @groovia-admin | @groovia-admin | 2026-08-05 17:00 UTC | 0d 0h 0m |
| #61 | Show uploaded shop logo in Sidebar, add login entrance animation, mov… | dashboard | @groovia-admin | @groovia-admin | 2026-08-05 17:22 UTC | 0d 0h 0m |
| #62 | Full WhatsApp-inspired light+green reskin; login cart animation; low-… | dashboard | @groovia-admin | @groovia-admin | 2026-08-06 15:29 UTC | 0d 0h 0m |
| #64 | Fix owner-reported dashboard QA issues: dark theme pages, conversatio… | dashboard + wa-bot | @groovia-admin | @groovia-admin | 2026-08-07 06:13 UTC | 0d 0h 0m |
| #65 | Phase 1 (v2 architecture): session spine — order_sessions + sessionSe… | wa-bot | @groovia-admin | @groovia-admin | 2026-08-07 06:15 UTC | 0d 0h 0m |
| #66 | Phase 2 (v2 architecture): shop routing — SHOP-{slug}, location share… | wa-bot | @groovia-admin | @groovia-admin | 2026-08-07 09:11 UTC | 0d 0h 0m |
| #67 | Wire order_confirm to the accepted transition (restores customer noti… | wa-bot | @groovia-admin | @groovia-admin | 2026-08-07 09:31 UTC | 0d 0h 0m |
| #68 | Order-flow improvements: real hourly slots, self-cancel window, delay… | wa-bot | @groovia-admin | @groovia-admin | 2026-08-07 13:51 UTC | 0d 0h 0m |
| #69 | Bot dashboard orders actions tooltips catalog fix | dashboard | @groovia-admin | @groovia-admin | 2026-08-07 15:36 UTC | 0d 0h 0m |
| #70 | Phase 3 (v2 architecture): delivery linkage on orders + address type … | dashboard | @groovia-admin | @groovia-admin | 2026-08-07 15:48 UTC | 0d 0h 0m |
