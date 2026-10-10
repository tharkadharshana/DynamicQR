# 01 — Product Overview

## What the product is

Scnr is a hosted QR-code platform for small businesses. The founder's target market is Sri Lankan SMEs. See the separate [SCNR Business Model and Monetization Assessment](SCNR%20Business%20Model%20and%20Monetization%20Assessment.md).

It sells three things:

1. **QR creation and styling.** Colours, dot and corner shapes, a centre logo, and PNG/SVG export.
2. **Dynamic QR codes.** The printed code points at a short link the business owns. The destination can change after printing, and gate rules control who gets through.
3. **Scan analytics.** Scans over time, unique visitors, country, device, OS, browser and a recent-scan feed.

## Users and roles

There is one role: the **account owner**. Users sign in with Google only, through Supabase OAuth. The product has no teams, workspaces, members, sharing or admin console, although the Pricing page advertises "shared workspaces" for the Team plan.

## Feature inventory (as built)

Legend: ✅ works as described · ⚠️ partly works or has a known bug · ❌ advertised but not built

### QR creation — [CreateQR.tsx](../src/pages/CreateQR.tsx)

| Feature | Status | Notes |
|---|---|---|
| Content types: URL, vCard, WiFi, Text, Email | ✅ static / URL-only dynamic | Non-URL types are stored as static until the Worker renders them (Phase 2). See [doc 03](03-scan-flow-and-gate-engine.md#non-url-types). |
| SMS type | ❌ | Mentioned in the old README only |
| Static vs dynamic toggle | ✅ | Dynamic needs a Pro plan, a Team plan or an active trial |
| Foreground and background colours, presets | ✅ | |
| Dot styles: square, dots, rounded, diamond, star | ✅ | Map to the `qr-code-styling` types `square`, `dots`, `rounded`, `classy`, `classy-rounded` |
| Corner styles: square, dot, rounded | ✅ | |
| Centre logo upload (≤1 MB, error correction set to H automatically) | ⚠️ | The logo is stored as a base64 data URL inside `style`. The API body limit is 100 KB, so logos above about 70 KB fail to save. |
| Error correction L/M/Q/H | ✅ | |
| Output size 400/800/1200 | ❌ | The setting is stored but ignored. Downloads are always 180 px. |
| Download PNG / SVG | ⚠️ | Works, but at 180 px |
| "Print PDF" | ❌ | Downloads a PNG |
| Live preview | ✅ | |
| Edit existing QR | ⚠️ | Title, destination and style save. Content data (vCard fields and so on) cannot change. Option changes hit the dotted-key bug. See [doc 11](11-review-findings.md). |
| Delete QR | ✅ | Also purges the Worker cache and scan events |

### Gates on dynamic codes — [worker.js](../worker/worker.js)

| Gate | Status | Behaviour |
|---|---|---|
| Active toggle | ✅ | Inactive returns a 410 page. Edits purge the edge cache, so they apply on the next scan. |
| Expiry date | ✅ | Returns 410 after the date. The DB row is not deactivated. |
| Scan limit (total scans) | ⚠️ | Returns 410 and deactivates the code once the count passes the limit. The count is per edge cache, so it is approximate. |
| Password / PIN | ✅ | The Worker serves a PIN page and remembers success for 24 h per visitor. 5 wrong PINs lock that visitor out for 15 minutes. |
| Visitor Guard (N scans per visitor per window) | ✅ | Free owners are fixed at 5 scans per hour |
| Monthly scan quota per plan | ✅ | Account-wide, decided by `/internal/slug` (can lag by up to 5 minutes) |
| iOS / Android device routing | ❌ | Not implemented |
| UTM tagging | ❌ | Not implemented |

### Analytics — [Analytics.tsx](../src/pages/Analytics.tsx), [AccountAnalytics.tsx](../src/pages/AccountAnalytics.tsx), [Dashboard.tsx](../src/pages/Dashboard.tsx)

| Feature | Status |
|---|---|
| Total scans, unique visitors (daily unique per visitor per QR) | ✅ |
| Daily time series, last N days or custom range | ✅ (unique-per-day is estimated) |
| Countries, devices, OS, browsers | ✅ |
| Recent scans feed | ✅ (refreshes only on page load) |
| Multi-QR comparison (select several codes) | ✅ |
| Referrers | ❌ always empty: nothing writes them |
| "Advanced" (regions, ISPs, languages, hours, TLS, EU) | ❌ always empty: those columns do not exist |
| City-level location, peak-hours heatmap | ❌ advertised on the Landing page only |
| "↑ 0% vs last month" deltas | ❌ hard-coded text |
| "Live" badge | ❌ no polling or realtime |

### Account and billing

| Feature | Status |
|---|---|
| Google sign-in, 14-day trial on first login | ✅ |
| Profile (company, job title, country, timezone) | ✅ |
| Revoke all sessions | ✅ |
| Export my data (JSON) | ✅ |
| Deactivate all QR codes | ✅ (purges the Worker cache) |
| Delete account | ✅ |
| Upgrade from the Billing page (monthly or annual, LKR) | ✅ annual adds 12 months. See [doc 07](07-plans-billing-payhere.md). |
| Upgrade from the Pricing page | ✅ (monthly) |
| Add-ons (extra scans / extra QR codes) | removed in Phase 0 |
| Invoice history | ✅ (from `subscriptions`) |
| REST API v1, API keys, webhooks | ❌ the docs page exists, no backend |
| Custom domain, white-label, bulk generation, workspaces | ❌ advertised on Pricing |
| Notifications, preferences, connected apps | ❌ the UI is commented out in Settings |

## Plans (from [src/lib/plans.ts](../src/lib/plans.ts))

| | Free | Trial (14 days) | Pro | Team |
|---|---|---|---|---|
| Price (PayHere, LKR) | Free | Free | LKR 2,290/mo or 22,900/yr | LKR 9,490/mo or 94,900/yr |
| Price (USD, Polar from Phase 1) | | | $7/mo or $70/yr | $29/mo or $290/yr |
| QR codes | 3 | 3 | Unlimited | Unlimited |
| Monthly scans | 1,000 | 75,000 | 75,000 | 500,000 |
| Dynamic QR | No | Yes | Yes | Yes |
| Password / expiry / scan limit / Visitor Guard | No | Yes | Yes | Yes |
| Analytics history | 7 days | 90 days | 90 days | 365 days |
| API access, custom domain (flags only) | No | No | No | Yes |

A free user can only make static codes. Static codes never touch the platform when scanned, so the "7-day analytics" on Free shows nothing. [Doc 07](07-plans-billing-payhere.md) covers this.

## Names and domains in the code

| Name / domain | Where it appears |
|---|---|
| **Scnr**, `scnr.tharkak.com` | Current brand: index.html meta, sidebar, CreateQR preview, robots/sitemap |
| `scnr.app` | Placeholder content for an empty static QR preview |
| `dynamicqr.app` | API Docs examples (the Worker's quota page now links to its own origin) |
| DynamicQR | Repo name, API docs page, export file name |
| qik.app | Dead `Layout.tsx` component |
| MLQR / mlqr.app | Root README |
| "Multi Layered QR Code Platform" | metadata.json (AI Studio leftover) |

Pick one brand and domain and replace the others. Customers print these URLs, so the domain must never change after launch.
