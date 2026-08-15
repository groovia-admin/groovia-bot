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
| #71 | Phase 4 (v2 architecture): public catalog API for the ordering webview | dashboard | @groovia-admin | @groovia-admin | 2026-08-07 16:03 UTC | 0d 0h 0m |
| #73 | Bot phase4 public catalog api | dashboard | @groovia-admin | @groovia-admin | 2026-08-07 19:50 UTC | 0d 0h 0m |
| #74 | Phase 6 (v2 architecture): order submission via the webview | dashboard + wa-bot | @groovia-admin | @groovia-admin | 2026-08-07 20:08 UTC | 0d 0h 0m |
| #75 | Phase 7 (v2 architecture): itemized receipt on order acceptance | wa-bot | @groovia-admin | @groovia-admin | 2026-08-07 20:14 UTC | 0d 0h 0m |
| #76 | Phase 8 (v2 architecture): order reminders/auto-reject, store QR code… | dashboard + wa-bot | @groovia-admin | @groovia-admin | 2026-08-07 20:35 UTC | 0d 0h 0m |
| #77 | Add one-time staff WhatsApp onboarding welcome message | wa-bot | @groovia-admin | @groovia-admin | 2026-08-08 02:07 UTC | 0d 0h 0m |
| #78 | Align order_reminder to its final approved copy (clock time, not dura… | wa-bot | @groovia-admin | @groovia-admin | 2026-08-08 02:41 UTC | 0d 0h 0m |
| #79 | Fix dashboard Overview "Today's Orders" count using shop-local midnig… | dashboard | @groovia-admin | @groovia-admin | 2026-08-08 03:47 UTC | 0d 0h 0m |
| #80 | Fix WhatsApp OTP login: template payload didn't match the newly-appro… | dashboard | @groovia-admin | @groovia-admin | 2026-08-08 04:18 UTC | 0d 0h 0m |
| #81 | Bot cutover to webview fallback | wa-bot | @groovia-admin | @groovia-admin | 2026-08-08 04:26 UTC | 0d 0h 0m |
| #82 | Send the webview link as a CTA URL button, not a raw link in text | wa-bot | @groovia-admin | @groovia-admin | 2026-08-08 04:51 UTC | 0d 0h 0m |
| #84 | Fix duplicate new-order alerts and the staff welcome message swallowi… | wa-bot | @groovia-admin | @groovia-admin | 2026-08-08 05:40 UTC | 0d 0h 0m |
| #85 | Auto-return to WhatsApp after order placement, surface silent interna… | dashboard | @groovia-admin | @groovia-admin | 2026-08-08 05:42 UTC | 0d 0h 0m |
| #86 | Webview UX fixes: search, persisted checkout state, name pre-fill, ca… | dashboard + wa-bot | @groovia-admin | @groovia-admin | 2026-08-08 06:15 UTC | 0d 0h 0m |
| #88 | Bot checkout additem and concurrency visibility | dashboard + wa-bot | @groovia-admin | @groovia-admin | 2026-08-08 08:40 UTC | 0d 0h 0m |
| #89 | Let staff order as a customer via QR scan or location share | wa-bot | @groovia-admin | @groovia-admin | 2026-08-08 08:45 UTC | 0d 0h 0m |
| #90 | Revert owner exclusion — owner should get all order notifications, no… | wa-bot | @groovia-admin | @groovia-admin | 2026-08-08 08:53 UTC | 0d 0h 0m |
| #91 | Rebuild Master Catalog: sidebar+panel IA, thumbnails, bulk shop enabl… | dashboard | @groovia-admin | @groovia-admin | 2026-08-08 11:15 UTC | 0d 0h 0m |
| #93 | Add period-over-period comparisons and gross margin to Analytics | dashboard | @groovia-admin | @groovia-admin | 2026-08-08 11:16 UTC | 0d 0h 0m |
| #94 | Add PWA manifest so the dashboard can be installed/added to home screen | dashboard | @groovia-admin | @groovia-admin | 2026-08-08 11:16 UTC | 0d 0h 0m |
| #87 | Add loading states dashboard-wide, fix storefront image pop-in, poll … | dashboard | @groovia-admin | @groovia-admin | 2026-08-08 08:41 UTC | 0d 0h 0m |
| #92 | Build real Customers page — was a literal dark-theme placeholder desp… | dashboard | @groovia-admin | @groovia-admin | 2026-08-08 11:16 UTC | 0d 0h 0m |
| #95 | Add new-order alerts: sound + browser notification, dashboard-wide | dashboard | @groovia-admin | @groovia-admin | 2026-08-08 11:16 UTC | 0d 0h 0m |
| #96 | Add order aging indicators — a pending order at 2 minutes and one at … | dashboard | @groovia-admin | @groovia-admin | 2026-08-08 11:28 UTC | 0d 0h 12m |
| #100 | Add global search (Ctrl/Cmd+K) across orders, products, and customers | dashboard | @groovia-admin | @groovia-admin | 2026-08-08 11:29 UTC | 0d 0h 13m |
| #97 | Add CSV export for Orders and Products | dashboard | @groovia-admin | @groovia-admin | 2026-08-08 11:38 UTC | 0d 0h 22m |
| #98 | Add bulk order actions — accept multiple pending orders at once | dashboard | @groovia-admin | @groovia-admin | 2026-08-08 11:38 UTC | 0d 0h 22m |
| #99 | Add a one-click pause-orders toggle to the dashboard Overview | dashboard | @groovia-admin | @groovia-admin | 2026-08-08 11:43 UTC | 0d 0h 28m |
| #101 | Add in-app notification center — a persistent bell, not just toasts t… | dashboard | @groovia-admin | @groovia-admin | 2026-08-08 11:45 UTC | 0d 0h 29m |
| #103 | Orders/Logs polish, live sidebar order count, straight-line cart load… | dashboard | @groovia-admin | @groovia-admin | 2026-08-08 16:16 UTC | 0d 0h 0m |
| #104 | Edit flow: adjust item quantity (not just remove), tell the customer … | wa-bot | @groovia-admin | @groovia-admin | 2026-08-08 16:26 UTC | 0d 0h 0m |
| #105 | Welcome message: full shop name/address/phone + dashboard Shop Details settings | dashboard + wa-bot | @groovia-admin | @groovia-admin | 2026-08-08 16:28 UTC | 0d 0h 0m |
| #106 | PDF invoice on completion -- customer WhatsApp + dashboard, never owner WhatsApp | dashboard + wa-bot | @groovia-admin | @groovia-admin | 2026-08-08 16:34 UTC | 0d 0h 5m |
| #107 | Dashboard: edit a pending order's items (adjust quantity or remove) —… | dashboard + wa-bot | @groovia-admin | @groovia-admin | 2026-08-08 16:58 UTC | 0d 0h 4m |
| #108 | Rebrand dashboard to the new teal palette (cosmetic only) | dashboard | @groovia-admin | @groovia-admin | 2026-08-09 07:38 UTC | 0d 0h 0m |
| #109 | Fix order_reminder silently failing (#132001) via language fallback | dashboard + wa-bot | @groovia-admin | @groovia-admin | 2026-08-09 13:50 UTC | 0d 0h 17m |
| #111 | Daily summary: orders/revenue/top-products each morning, on/off + time configurable | dashboard + wa-bot | @groovia-admin | @groovia-admin | 2026-08-10 01:47 UTC | 0d 0h 0m |
| #112 | Global UI polish (dropdowns, checkboxes, focus/hover states) + fix st… | dashboard | @groovia-admin | @groovia-admin | 2026-08-10 01:48 UTC | 0d 0h 0m |
| #110 | Replace chat-based order edit with a link to the dashboard's item edi… | wa-bot | @groovia-admin | @groovia-admin | 2026-08-10 01:48 UTC | 0d 0h 1m |
| #113 | Settings 2-column layout, inline product edit modal, continuous-runni… | dashboard | @groovia-admin | @groovia-admin | 2026-08-10 05:43 UTC | 0d 0h 11m |
| #114 | Fix Settings grid runaway columns, add product search/pagination, sid… | dashboard | @groovia-admin | @groovia-admin | 2026-08-10 09:20 UTC | 0d 0h 0m |
| #116 | No-login mobile order-edit page + single-page cart/checkout redesign | dashboard + wa-bot | @groovia-admin | @groovia-admin | 2026-08-10 09:46 UTC | 0d 0h 0m |
| #115 | Fix two production-blocking gaps: fonts never loaded, zero mobile sup… | dashboard | @groovia-admin | @groovia-admin | 2026-08-10 10:01 UTC | 0d 0h 18m |
| #117 | Enforce stock limits on orders; fix staff edit page stuck after Done | dashboard | @groovia-admin | @groovia-admin | 2026-08-10 14:36 UTC | 0d 0h 0m |
| #118 | Cart loading animation: 2x speed, centered; reuse on login | dashboard | @groovia-admin | @groovia-admin | 2026-08-10 14:49 UTC | 0d 0h 1m |
| #119 | Bot real logo assets | dashboard | @groovia-admin | @groovia-admin | 2026-08-10 15:03 UTC | 0d 0h 9m |
| #120 | Auto-accept an order on first edit + notify customer; less-vague edit message | dashboard + wa-bot | @groovia-admin | @groovia-admin | 2026-08-10 15:11 UTC | 0d 0h 0m |
| #121 | Staff confirmation + Mark-ready button when an edit auto-accepts an order | dashboard + wa-bot | @groovia-admin | @groovia-admin | 2026-08-10 16:31 UTC | 0d 0h 0m |
| #123 | Decrement stock on WhatsApp order acceptance (this path never touched stock) | wa-bot | @groovia-admin | @groovia-admin | 2026-08-11 12:42 UTC | 0d 0h 0m |
| #122 | Idle logout, move inventory logs into Logs, product validation, addre… | dashboard | @groovia-admin | @groovia-admin | 2026-08-11 13:00 UTC | 0d 0h 25m |
| #124 | Master Catalog variant/dedup parity, item-level shop enablement, edit… | dashboard | @groovia-admin | @groovia-admin | 2026-08-11 14:46 UTC | 0d 0h 0m |
| #125 | Fix 'preparing' status breaking WhatsApp; decrement stock on edit-tri… | dashboard + wa-bot | @groovia-admin | @groovia-admin | 2026-08-11 15:50 UTC | 0d 0h 1m |
| #126 | Inventory movements as a table, and a full login page redesign | dashboard | @groovia-admin | @groovia-admin | 2026-08-12 09:14 UTC | 0d 0h 0m |
| #127 | Fix greeting timezone, add order date filter + inline status change, … | dashboard | @groovia-admin | @groovia-admin | 2026-08-13 13:07 UTC | 0d 0h 0m |
| #128 | Reports: a real Tier 1 + Tier 2 reporting hub, replacing Analytics | dashboard | @groovia-admin | @groovia-admin | 2026-08-14 14:14 UTC | 0d 0h 0m |
| #129 | Fix OTP input boxes blowing out the layout | dashboard | @groovia-admin | @groovia-admin | 2026-08-14 16:39 UTC | 0d 0h 1m |
| #130 | Bot orders reports fixes | dashboard + wa-bot | @groovia-admin | @groovia-admin | 2026-08-15 00:52 UTC | 0d 0h 22m |
