# Changelog

One entry per phase of the growth plan. Finding ids (C1, H3, …) refer to [11-review-findings.md](11-review-findings.md).

## Worker live in production (branch `chore/worker-config`)

- **Scans were failing with `503 Service Unavailable (Origin error)`.** There were two causes:
  - The deployed Worker had no secrets (`API_URL`, `INTERNAL_SECRET` and `HASH_SALT` were missing).
  - The zone route `scnr.tharkak.com/*` pointed at an old Worker, `qr-redirect`.
- **Fix:** set the secrets from the `.env` master copy, deployed current `main`, and moved the route to `dynamic-qr-worker`.
- **Verified live:** a real code returns 302 (about 0.3 s when cached) and writes a `scan_events` row with country, device and unique flag. An unknown slug shows the branded 404, and `/internal/*` returns 401.
- `MAIN_HOST` is now pinned in `[vars]` of `wrangler.toml`, so a plain `wrangler deploy` keeps it.

## Hotfix: production API and env (branch `fix/prod-module-resolution`)

- **Production API was crashing** (`ERR_MODULE_NOT_FOUND …/src/lib/qrContent`) since Phase 2. Vercel runs the server as Node ESM, and `guestPage.ts` imported `./qrContent` without `.js`. Fixed. A new CI step, `scripts/check-server-imports.mjs`, walks the server import graph and fails on any extensionless relative import.
- **`VITE_*` settings were never applied in the browser.** `(import.meta as any).env` compiled to `{}`. `qrContent.ts` and `site.ts` now use full `import.meta.env.VITE_X` accesses with a Node-safe guard. Verified: a build inlines `VITE_SHORT_DOMAIN` and `VITE_SUPPORT_EMAIL`.
- **Vercel env rebuilt.** Production lacked `SUPABASE_SERVICE_ROLE_KEY`; it only had the key under `VITE_SUPABASE_SERVICE_ROLE_KEY`, which the server stopped reading in Phase 0.
  - Every user variable was dropped and the clean set re-added (secrets as Sensitive).
  - The unused `VITE_POSTGRES_*` / JWT / secret-key variables are gone.
  - Everything is backed up in the local `.env` (master copy) and in `.env.vercel-backup.*`.

## Phase 4: Team plan for printers and agencies (branch `feat/phase4-agency`)

**Run before merging:** [migrations/004_phase4.sql](../migrations/004_phase4.sql).

- **API keys and the REST API.**
  - `sk_live_` keys are shown once and stored as SHA-256. They are created, listed and revoked in Settings.
  - `/api/v1/*` is the dashboard's own routes, using a one-line rewrite.
  - Keys act as the owner and stop working when the plan loses API access.
  - The API Docs page is back, documenting only real endpoints.
- **5 seats.**
  - Invite by email. The invite is claimed on the member's first Google sign-in (`workspaceOwner()`), and the member then works in the owner's workspace.
  - Billing, members, keys, domains, profile and account deletion are owner-only (`sessionOwner`: `SESSION_ONLY` / `OWNER_ONLY`).
- **Client folders.** `qr_codes.client`, a Dashboard filter, and a CreateQR field.
- **Bulk CSV creation** (`/bulk`) with an RFC-4180 parser (`src/lib/csv.ts`, self-checked) and a print sheet.
- **One custom short domain.**
  - Uses Cloudflare for SaaS custom hostnames (`/api/domains`), with status refresh and CNAME guidance.
  - New codes encode the verified domain (`setShortDomain()`).
  - The Worker redirects non-code paths on custom hosts to `MAIN_HOST`.
- **White-label reports.** Agency name and logo on printed Analytics reports.
- **Pre-migration safety.** `client` is only written when set, so creating codes keeps working before 004.
- **QA section 27** covers keys, seats with a second real user, folders, domains, branding and the CSV parser.

## Phase 3: Retention and trustworthy numbers (branch `feat/phase3-retention`)

**Run before merging:** [migrations/003_phase3.sql](../migrations/003_phase3.sql). It needs 002.

- **Atomic scan recording.** The Postgres `record_scan()` writes the event and every counter in one transaction, including `profiles.monthly_scans` and `first_scan` (M3). It is revoked from `anon` and `authenticated`. A legacy fallback keeps scans recording until the migration runs.
- **Real per-day uniques** (`days_unique`) and **hour-of-day counts** (`hours`). A busiest-hours chart is on Analytics.
- **Reports:** a CSV of raw scans (`/api/analytics/:slug/events.csv`) or of the daily series, and a **Print report** using print CSS.
- **Weekly digest:** the Monday cron emails scans, the busiest hour in the owner's time zone and the top code (Resend). There's a Settings opt-out and `?dry=1` for QA.
- **Retention:** the daily cron deletes scan events older than 400 days (M15).
- **History cap** now also applies to custom date ranges (M7).
- **Shim removed.** supabase-js is called directly; the 9 account-analytics handlers became one `views` map served for both a code and the account; deletes rely on cascades. server.ts went from 2,457 to about 1,600 lines.
- `GET /api/qr` (the list) no longer returns `password_hash`.
- **QA section 26** covers concurrency, uniques, hours, CSV, range clamp, cron auth, digest and RPC permissions. CI sets a dummy `CRON_SECRET`.

## Phase 2: Restaurant Kit (branch `feat/phase2-restaurant-kit`)

**Run before merging:** [migrations/002_phase2.sql](../migrations/002_phase2.sql) (the `events` table).

- **Guest pages (`qr_type: 'page'`).**
  - A hosted mobile page with the menu, review, WhatsApp, phone and extra links, Wi-Fi with a copy button, today's offer and a brand colour, in **English, Sinhala and Tamil** (`?lang=` or `Accept-Language`).
  - It is rendered at the edge by the shared `renderGuestPage()`. All text is escaped, unsafe link schemes are dropped, and Free owners get "Made with Scnr".
  - A language switch is not counted as a scan.
- **All types can be dynamic again** (C6). vCard downloads a `.vcf`, Text and Wi-Fi render pages, Email redirects to `mailto:`. The dev server uses the same renderer.
- **Restaurant Kit wizard** (`/kit`, editable with `?edit=`) and an **A6 table tent** print view (`/kit/print/:slug`, browser print-to-PDF), plus an optional static Wi-Fi code.
- **"Swap today's offer"** on the Dashboard. `PUT /api/qr/:slug` accepts `content_data` (max 20 KB, M9).
- **WhatsApp code type** in CreateQR (`waLink()`), and **"Book setup on WhatsApp"** on Billing and in the Kit (Landing already had it).
- **Activation events** (`qr_created`, `print_opened`, `first_scan`, `offer_changed`, `paid`) through `logEvent()` and `POST /api/events`. Founder SQL is in `migrations/queries.sql`.
- **QA section 25** covers guest pages, dynamic types at the edge, content edits, events and `waLink`. Sections 15b were updated for dynamic non-URL types.

## Phase 1: Credible (branch `feat/phase1-credible`)

No new migration.

### Honest product
- **Landing rewritten:**
  - aimed at Sri Lankan businesses
  - a trust strip (location, WhatsApp support, status page, "not a LANKAQR payment replacement")
  - the live demo QR (`VITE_DEMO_SLUG`)
  - LKR/USD pricing with real limits
  - removed: the fake brand logos, "10,000+ businesses", testimonials, ticking counters, and the city and heatmap claims (H11)
- **Legal pages rewritten for SaaS** (`LegalLayout`). They cover renewal, trial, the 30-day grace and pause rule, acceptable use, availability, data, liability and refunds. The identity comes from `src/lib/site.ts` (`VITE_*`).
- **Other removals:** the ApiDocs page (no such API yet), the referrer and "advanced" panels and their endpoints, the fake "vs last month" deltas, and the "Live" labels.

### Plans and limits (gap table)
- **Caps instead of "unlimited":** Pro 100, Team 600.
- **History:** Pro 365 days, Team 730.
- **Free dynamic pilot:** Free keeps 1 dynamic code forever (`dynamic_qr_codes`, `LIMIT_DYNAMIC_QR`).
- **Lapse rule:** a 30-day grace period, then dynamic codes above the allowance pause behind a holding page and are never deleted (`graceEndsAt`, `/internal/slug` `paused`, Worker page, layout banner, terms).
- **Trial UI fix:** CreateQR gates on `limits.*`, not on `plan === 'free'` (M1).

### Billing: two providers
- An **LKR / USD** switch on Landing, Pricing and Billing. LKR → PayHere; USD → Polar card checkout.
- `/api/billing/polar/checkout` and `/api/billing/polar/webhook`, with a Standard Webhooks signature, idempotency per subscription period, and canceled, revoked and refunded handling.
- PayHere in USD as the fallback when Polar is off.
- `startCheckout()` is shared by Pricing and Billing, so the form-post code is no longer copied.

### Print-ready output
- Downloads use the chosen size (400/800/1200 px). The fake "Print PDF" button is gone (H10).
- Logos are resized to ≤256 px on the device, so saves no longer fail (H9).
- The viewer modal uses the editor's renderer (`stylingOptions`), so dots, corners and the logo match.

### Cleanup and QA
- Deleted: `Layout.tsx`, `Login.tsx`, `metadata.json`, `firestore.rules`, and the AI Studio Vite settings. A short accurate README.
- The rate limits can be overridden through env (`RATE_LIMIT_MAX`, `RATE_LIMIT_WRITE_MAX`) for QA.
- QA section 23 covers the USD fallback and Polar webhooks; section 24 covers the caps, history cap, free pilot and the lapse rule through the API and the in-process Worker.

## Phase 0: Safe and working (branch `fix/phase0-safe-and-working`)

**Run before merging:** [migrations/001_phase0.sql](../migrations/001_phase0.sql) in the Supabase SQL editor.

### Scans and edge
- `vercel.json` routes `/internal/*` to Express, so dynamic codes resolve again (C1). The dead `/qr`, sitemap and robots rewrites are removed.
- Worker:
  - Origin failures return a branded 503 page instead of crashing.
  - Every non-redirect outcome uses one `page()` helper.
  - The monthly quota comes from `/internal/slug` (`quota_exceeded`, account-wide), and the scan report is sent with `ctx.waitUntil`. The redirect no longer waits on the database (H3, H8).
  - PIN lockout after 5 wrong attempts per visitor per 15 minutes (H7).
  - Legacy dynamic rows with no destination get a 404 page (C6, mitigated).
  - The quota page links to its own origin, not `dynamicqr.app`.
- `/internal/slug` resolves Visitor Guard from the license (`visitor_guard`, `visitor_rate_limit`). Trial users are no longer forced to 5 an hour at the edge.
- Edits and "Deactivate all" call `purgeEdge(slug)`, so changes apply on the next scan (H2).

### Data and security
- RLS: dropped the open "Service role full access" policies and the profile insert/update policies (C2, C3). QA proved, before the fix, that the anon key could overwrite a QR title and that a user could set `plan='team'`.
- `password_hash` is never returned by the API; responses carry `has_password` instead (M16).
- The service-role key is only read from `SUPABASE_SERVICE_ROLE_KEY`. The `VITE_*` fallbacks, which could be bundled into the browser, are removed (M14).
- `subscriptions` gains `interval`, `payment_id`, `provider` and `currency`, plus a unique `(provider, payment_id)` index.

### Billing
- **Single price source:** `PRICES` and `formatPrice` in `src/lib/plans.ts`. PayHere charges **LKR** (Pro 2,290/mo, Team 9,490/mo; annual = 10×).
- Checkout writes a pending order. The notify webhook:
  - trusts only that order: uid, plan, amount and currency, never `custom_*` (C4)
  - checks the merchant id
  - compares the signature with `timingSafeEqual`
  - parses PayHere's form-urlencoded body (the old JSON-only parser could never read real notifies)
- `applyPayment()` is the single grant path. It is idempotent per `payment_id` (C5) and extends by 1 or 12 months according to the interval (H4).
- Handled events: `RECURRING_STOPPED` (keep the plan until expiry), chargeback (downgrade now), failed and cancelled payments.
- Invoices come from `subscriptions` and show the currency.
- Pricing sends `interval` (H5). Billing shows the real expiry date (M12).
- Add-ons are removed: no UI and a broken path (H6).

### QR content and edits
- `src/lib/qrContent.ts`: `getQRContent`, `vcardText`, `SHORT_DOMAIN`. Every QR encodes `VITE_SHORT_DOMAIN`, never the dashboard's origin (C7). Four copied builders are gone.
- Scan-limit edits are saved as one `rate_limit` jsonb (the dotted-key bug, H1).
- Only URL codes can be dynamic until Phase 2. Both the server and CreateQR enforce this.

### QA and CI
- `qa.ts` new sections:
  - **15b**, the Worker gate engine, run in-process with a fake KV
  - **20**, RLS and response hygiene
  - **21**, edit persistence and policy fields
  - **22**, the PayHere order plus signed-notify scenarios
- CI runs `npm run lint`, uses dummy PayHere merchant credentials for the signed-notify tests, and drops the unused `QA_EMAIL` / `QA_PASSWORD`.

### Docs
- These docs are committed now. The private business and research files stay ignored.
