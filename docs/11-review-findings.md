# 11 — Full Review: Findings and Roadmap

Review date: 2026-10-10. The review read every source file. The live system was probed read-only:

- DNS for Supabase and the app
- `/api/health`, `/internal/slug/*` and one random slug on `scnr.tharkak.com`
- anon-key row counts and column-existence checks against Supabase

No writes were made to production.

"Confirmed" means a live probe showed it. Every other finding comes from reading the code.

**Status legend:** ✅ fixed (with the phase) · 🟡 mitigated · no mark = open. Each fix is listed in [CHANGELOG.md](CHANGELOG.md).

## Critical: fix before anyone prints a code or pays

<a id="c1"></a>
**C1. Dynamic QR codes do not resolve in production (confirmed).** ✅ Phase 0
`GET https://scnr.tharkak.com/abcde23` returns `503 Service Unavailable (Origin error)`, and `GET /internal/slug/abcde23` returns Vercel's `404 NOT_FOUND`. [vercel.json](../vercel.json) has no rewrite for `/internal/*`, so the Worker's lookup on a KV miss and its scan report never reach Express. Every uncached dynamic code fails, and analytics are never recorded.
Fix: add `{ "source": "/internal/(.*)", "destination": "/api/index.ts" }` before the SPA catch-all. Then check that `API_URL` points at the Vercel host and that `INTERNAL_SECRET` matches.

**C2. Supabase RLS lets anyone read and write the app tables (read confirmed).** ✅ Phase 0 (migration 001; QA also proved writes) The "Service role full access" policies have no `to service_role`. See [doc 09, S1](09-security.md#s1--critical-rls-policies-grant-every-role-full-access).

**C3. Users can upgrade themselves through the `profiles` update policy.** ✅ Phase 0 See [doc 09, S2](09-security.md#s2--critical-users-can-set-their-own-plan).

**C4. The PayHere webhook trusts `custom_1` and `custom_2` and never checks the amount.** ✅ Phase 0 Pay for Pro and receive Team, or credit another uid. See [doc 07, B1](07-plans-billing-payhere.md#billing-defects-ranked).

**C5. Webhook retries stack extra months (column confirmed missing).** ✅ Phase 0 (idempotent per payment_id) The `subscriptions` insert uses the column `timestamp`, which does not exist. The insert fails after the profile is already extended. The webhook returns 500, PayHere retries, and each retry adds another month. Invoices stay empty.

**C6. Dynamic vCard, Text and Email codes crash the Worker.** ✅ Phase 2 (rendered at the edge by `renderGuestPage`) `Response.redirect('')` throws, and the scanner sees a Cloudflare 1101 error. See [doc 03](03-scan-flow-and-gate-engine.md#non-url-types).

**C7. The URL printed on a code depends on the dashboard host.** ✅ Phase 0 (VITE_SHORT_DOMAIN) Codes made on `*.vercel.app` or localhost skip the Worker, and scanners land on `/login`. See [doc 06](06-frontend.md#qr-content-depends-on-the-origin).

## High

<a id="h1"></a>
**H1. Editing a QR through the UI hits the dotted-key bug.** ✅ Phase 0 CreateQR always sends `options`, so PUT always adds the keys `rate_limit.enabled`, `rate_limit.max_scans` and `rate_limit.period` ([server.ts:1227-1229](../server.ts#L1227-L1229)). Postgres has no columns with these names. Depending on the PostgREST version, the whole update either fails ("Failed to save QR code") or those fields are dropped. Either way the scan-limit edits are lost. Fix: build the whole `rate_limit` object (`updateData.rate_limit = {enabled, max_scans, period:'total'}`).

**H2. Edits and deactivations do not purge the Worker cache.** ✅ Phase 0 (purgeEdge) Changes take up to 5 min to apply, including "Deactivate all", which matters for a stolen or misprinted code. Fix: call the existing purge in PUT and deactivate-all, as DELETE already does.

**H3. The monthly quota is checked per QR, not per account** ✅ Phase 0 ([server.ts:2126](../server.ts#L2126)). A Free user with 3 codes gets 3,000 scans. Use `profiles.monthly_scans`.

**H4. Annual plans grant 1 month** ✅ Phase 0 ([server.ts:894](../server.ts#L894)).

**H5. The Pricing page upgrade always returns 400** ✅ Phase 0 (`interval` is missing). See [Pricing.tsx](../src/pages/Pricing.tsx).

**H6. The add-on purchase path is fully broken.** ✅ Phase 0 (removed) The webhook uses dotted keys and wrong `addon_purchases` columns, sets `api_access` for any add-on, and there is no UI to buy one.

**H7. PIN brute force is unlimited, and the PIN hashes are exposed through C2.** ✅ Phase 0

**H8. The Worker waits for a Vercel and Supabase round trip on every scan.** ✅ Phase 0 (waitUntil, quota from config) `/internal/scan` does about 5 sequential DB calls, plus a cold start, before the 302. That adds hundreds of ms and up to a 4 s stall. Option: check the quota from a KV monthly counter, and send analytics with `ctx.waitUntil` (do not wait for it).

**H9. Logos above about 70 KB cannot be saved.** ✅ Phase 1 (resized to 256 px on the device) The client allows 1 MB, but the body limit is 100 KB. Fix: compress or resize the logo on the client (canvas to 256 px PNG), or upload it to Supabase Storage and store the URL.

**H10. Downloads are 180 px, whatever "Output size" says, and "Print PDF" is a PNG.** ✅ Phase 1 Customers will print these files. Fix: `qrCodeRef.current.update({width: size, height: size})` before `download()`, then reset.

**H11. Advertised features do not exist.** ✅ Phase 1 (claims removed; legal pages rewritten)

- Root README: device routing, SMS, UTM, webhooks, API keys, Firebase stack.
- ApiDocs page: the whole `/api/v1` API.
- Pricing: workspaces, white-label, bulk, custom domain.
- Landing: city-level location, heatmap, "10,000+ businesses".

This is a legal and trust risk with paying customers. Remove the claims, or label them "coming soon".

## Medium

| # | Finding | Where |
|---|---|---|
| ✅ M1 | Trial users see Pro toggles as locked (the UI checks `plan === 'free'`, not `limits`), and the Worker forces their Visitor Guard to 5 | CreateQR.tsx, worker.js:117 |
| ✅ M2 | Dynamic codes keep working after a trial or plan lapses. Nothing enforces the "Free = static only" rule after the fact. | worker.js, getLicense |
| ✅ M3 | `qr_stats` and `profiles.monthly_scans` read-modify-write races lose counts | server.ts:2347-2374 |
| M4 | KV write volume: up to 3 puts per scan, and the `{slug}` key is rewritten per scan (KV allows 1 write/s per key; the free tier allows 1k writes/day) | worker.js:231-245 |
| M5 | Scan limit is approximate across edges, and bots count toward the limits at the edge | worker.js |
| M6 | Expiry is a time-zone-less local string, compared as UTC at the edge | CreateQR / worker |
| ✅ M7 | Date range filters only the time series. Breakdowns are all-time and are not labelled as such. Custom ranges skip the plan's `analytics_days` cap. | Analytics pages, server timeseries |
| M8 | Webhook treats PayHere `-3` (chargeback) as a cancellation and ignores recurring `message_type` events | server.ts:916 |
| ✅ M9 | `PUT /api/qr/:slug` cannot change `qr_type` or `content_data`, so a vCard cannot be edited | server.ts:1193 |
| M10 | Reactivating codes through PUT skips the QR-count limit | server.ts:1212 |
| M11 | Rate limiters are in memory on serverless, so they are soft | server.ts:239-267 |
| ✅ M12 | Billing "Next billing" always shows N/A (`_seconds`) | Billing.tsx:57-60 |
| ✅ M13 | The quota page links to `dynamicqr.app/pricing`, and the brand differs across 5+ domains | worker.js:30, doc 01 |
| ✅ M14 | Service-role key fallbacks with `VITE_` names risk leaking the key into the bundle | server.ts:12 |
| ✅ M15 | `scan_events` has no retention limit, and the `qr_stats.days` map grows without limit | schema |
| ✅ M16 | `/api/qr/:slug` and the export return `password_hash` | server.ts:1170, 567 |

## Low

- The QR viewer modal and the thumbnails ignore dot style, corners and logo, so they do not match the real design.
- vCard and WiFi values are not escaped (`;`, `,`, `\`).
- The dashboard "↑ 0% vs last month" and the "Live" badge are fake.
- The referrer and advanced analytics panels are always empty.
- `failed_password` events look like normal scans in "recent".
- `updated_at` is never maintained, and `qr_image_url` is unused.
- `authenticate` echoes internal error text, and the health route lists env flags.
- `npm run clean` uses `rm -rf`, which fails on Windows cmd.

## Dead code and leftovers (delete)

| Item | Why |
|---|---|
| [firestore.rules](../firestore.rules) | Firebase is gone |
| [metadata.json](../metadata.json), `GEMINI_API_KEY` define and the AI Studio HMR comment in [vite.config.ts](../vite.config.ts) | AI Studio scaffolding |
| [src/components/Layout.tsx](../src/components/Layout.tsx), [src/pages/Login.tsx](../src/pages/Login.tsx) | Not imported or routed |
| ✅ `qrContent` computation in `POST /api/qr` | Deleted in Phase 0 |
| ✅ `/qr/(.*)`, `/sitemap.xml`, `/robots.txt` rewrites | Deleted in Phase 0 |
| ✅ `ANNUAL_PRICES` | Replaced by `PRICES` (the single price source) in Phase 0 |
| `/api/analytics/*/referrers` and `/advanced` | Always empty |
| ✅ `QA_EMAIL` and `QA_PASSWORD` CI secrets | Removed from the workflow in Phase 0 |
| Root [README.md](../README.md) | Describes a different architecture. Replace it with a short pointer to `docs/`. |

## Simplification opportunities (smaller code, same behaviour)

1. ✅ **Remove the Firestore shim** (Phase 3) ([server.ts:23-196](../server.ts#L23-L196)) and call supabase-js directly. This fixes H1 and H6 as a side effect, and it removes the 30-item chunking and the fake batches. Keep `qa.ts` green before and after the change.
2. ✅ **Merge the 9 account-analytics handlers** (Phase 3, one `views` map) into one helper `loadStats(uid, slugs)` plus small mappers. That cuts about 450 lines.
3. ✅ **Use one atomic Postgres function for scan capture** (Phase 3, `record_scan`): insert the event and increment the stats and the monthly counter in one call. This fixes M3, removes 3 round trips, and helps H8.
4. ✅ **Use one QR content builder**: `src/lib/qrContent.ts`, done in Phase 0.
5. **Fetch `/api/user/plan` once.** Pages should use the Outlet `planData`, not re-fetch it.

## Recommended order of work

The approved implementation plan follows these phases: Phase 0 (safe and working) ✅, Phase 1 (credible, plus Polar, caps and the free pilot), Phase 2 (restaurant kit and guest page), Phase 3 (retention), Phase 4 (Team features, gated on go/no-go).

**Phase 0: make it safe (hours)**

1. RLS policy drops (C2, C3)
2. `/internal` rewrite (C1). Then smoke-test a real slug.
3. Force non-URL types to static, or handle them in the Worker (C6)
4. Encode dynamic codes from a configured short domain (C7)

**Phase 1: make billing correct (1 to 2 days)**

5. Server-side pending orders, amount and plan verification, idempotency (C4, C5)
6. Interval-aware expiry (H4); Pricing `interval` (H5); billing date display (M12)
7. Hide add-ons until they work (H6)

**Phase 2: make the core product reliable (2 to 4 days)**

8. Purge KV on PUT and deactivate-all (H2); fix the dotted keys (H1)
9. Account-wide quota and atomic stats function (H3, M3)
10. Send analytics without waiting, and keep the quota in KV (H8, M4)
11. Real download sizes and a logo resize (H9, H10)
12. PIN attempt limit (H7)

**Phase 3: honesty and cleanup (1 day)**

13. Remove or label unbuilt features across README, ApiDocs, Pricing and Landing (H11)
14. Delete dead code; unify the brand and domain (M13)
15. Remove the shim and merge the analytics handlers

**Phase 4: only after paying customers ask for it**

Device routing, custom domains, the REST API and keys, webhooks, a city/hour heatmap, teams. The business assessment's advice applies: pick a narrow Sri Lankan segment first, then build what it needs.
