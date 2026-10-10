# 01 — Product Overview

## What the product is

Scnr is a hosted QR-code service for Sri Lankan small businesses, restaurants first. It sells three things:

1. **QR creation and styling.** Colours, dot and corner shapes, a centre logo, and PNG/SVG export up to 1200 px.
2. **Dynamic QR codes.** The printed code points at a permanent short link (`scnr.tharkak.com/<slug>`). The destination can change after printing, and gate rules control who gets through.
3. **Scan statistics.** Scans over time, unique visitors, country, device, OS, browser and recent scans.

Its edge over global tools: **LKR billing**, Sinhala and Tamil guest pages, WhatsApp destinations and support, and local onboarding. It makes marketing, menu and campaign codes; **it is not a LANKAQR payment replacement**.

## Users and roles

There is one role, the **account owner**, who signs in with Google (Supabase OAuth). Team seats are planned for the Team plan (Phase 4).

## Feature inventory (as built)

Legend: ✅ works · ⚠️ works with a known limit · 🗓 planned (phase) · ❌ not offered

### QR creation — [CreateQR.tsx](../src/pages/CreateQR.tsx)

| Feature | Status | Notes |
|---|---|---|
| Content types: URL, vCard, Wi-Fi, Text, Email, WhatsApp, Guest page | ✅ | Every type can be dynamic. The Worker renders non-URL types with `renderGuestPage()` ([guestPage.ts](../src/lib/guestPage.ts)). WhatsApp is a URL code pointing at `wa.me` with a ready message. |
| Restaurant Kit ([Kit.tsx](../src/pages/Kit.tsx)) | ✅ | A 3-step wizard that makes one dynamic guest page (menu, Google review, WhatsApp, phone, extra link, Wi-Fi, today's offer, brand colour; EN/SI/TA) plus an optional static Wi-Fi code. Prints an A6 table tent ([KitPrint.tsx](../src/pages/KitPrint.tsx)) through the browser's print-to-PDF. |
| Static vs dynamic toggle | ✅ | Dynamic counts against the plan's `dynamic_qr_codes` (Free: 1) |
| Colours, dot styles, corner styles | ✅ | `stylingOptions()` in [qrContent.ts](../src/lib/qrContent.ts) is used by the editor, downloads and the viewer |
| Centre logo | ✅ | Resized on the device to ≤256 px (`resizeLogo`), so saves stay under the API body limit. Error correction switches to H. |
| Downloads | ✅ | PNG and SVG at the chosen output size (400/800/1200 px). There is no PDF; print-ready table tents arrive in 🗓 Phase 2. |
| Viewer modal | ✅ | Same renderer as the editor; 1200 px PNG download |
| Edit after printing | ✅ | Title, destination, style, gates and content (`content_data`). Guest pages are edited in the kit, and "today's offer" straight from the Dashboard. |
| Delete | ✅ | Purges the edge cache and scan events |

### Gates on dynamic codes — [worker.js](../worker/worker.js)

| Gate | Status | Behaviour |
|---|---|---|
| Active toggle | ✅ | Inactive codes show a 410 page; edits purge the edge cache |
| Lapse pause | ✅ | After a plan or trial ends plus a 30-day grace period, dynamic codes above the allowance show a "paused by its owner" page. Never deleted. |
| Expiry date | ✅ | 410 page after the date |
| Monthly quota | ✅ | Account-wide, from the cached config (can lag by up to 5 min) |
| Visitor Guard | ✅ | N scans per visitor per window; owners without the feature are fixed at 5 per hour |
| PIN | ✅ | PIN page, 24 h unlock, lockout after 5 wrong PINs in 15 min |
| Scan limit | ⚠️ | Approximate across edges; deactivates the code when reached |
| iOS/Android routing, UTM | ❌ | Not planned until a customer asks |

### Statistics — [Analytics.tsx](../src/pages/Analytics.tsx), [AccountAnalytics.tsx](../src/pages/AccountAnalytics.tsx), [Dashboard.tsx](../src/pages/Dashboard.tsx)

| Feature | Status |
|---|---|
| Total scans, unique visitors (daily unique per visitor per code) | ✅ |
| Daily time series (last N days, capped by plan, or a custom range) | ✅ (unique per day is estimated until 🗓 Phase 3) |
| Countries, devices, OS, browsers | ✅ all-time |
| Recent scans | ✅ (loads with the page) |
| Peak hours, weekly digest, CSV export | 🗓 Phase 3 |

### Account and billing

| Feature | Status |
|---|---|
| Google sign-in, 14-day trial | ✅ |
| Profile, revoke sessions, export data, deactivate all, delete account | ✅ |
| Pay in LKR (PayHere) or USD (Polar card, falling back to PayHere USD) | ✅ monthly or yearly |
| Invoices | ✅ |
| Cancel | ✅ keeps the plan until the paid period ends |
| Restaurant Kit, guest pages, WhatsApp code type, "Book setup on WhatsApp" (Landing, Billing, Kit) | ✅ |
| Activation funnel (`events`: created, printed, first scan, offer changed, paid) | ✅ with founder queries in [migrations/queries.sql](../migrations/queries.sql) |
| Bulk CSV, team seats, API keys, one custom domain (Team) | 🗓 Phase 4 |

## Plans (from [src/lib/plans.ts](../src/lib/plans.ts))

| | Free | Trial (14 days) | Pro | Team |
|---|---|---|---|---|
| Price, LKR (PayHere) | Free | Free | 2,290/mo · 22,900/yr | 9,490/mo · 94,900/yr |
| Price, USD (card) | | | $7/mo · $70/yr | $29/mo · $290/yr |
| QR codes (active) | 3 | 3 | 100 | 600 |
| Dynamic codes | **1 (forever)** | 3 | 100 | 600 |
| Monthly scans | 1,000 | 75,000 | 75,000 | 500,000 |
| PIN / expiry / scan limit / Visitor Guard | No | Yes | Yes | Yes |
| Statistics history | 7 days | 365 days | 365 days | 730 days |

No plan is "unlimited". Yearly = 10× monthly (2 months free).

## Names and domains

The product is **Scnr**. The permanent short domain is `VITE_SHORT_DOMAIN` (`https://scnr.tharkak.com`); it must never change after codes are printed. Business identity (legal name, address, support email and WhatsApp, status page, demo code) comes from `VITE_*` variables read by [src/lib/site.ts](../src/lib/site.ts). The old names (DynamicQR, qik.app, MLQR, dynamicqr.app, scnr.app) were removed in Phase 1, except the repository name.
