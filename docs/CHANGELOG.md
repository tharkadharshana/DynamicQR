# Changelog

One entry per phase of the growth plan. Finding ids (C1, H3, …) refer to [11-review-findings.md](11-review-findings.md).

## Phase 12: Public tools, help and What's new (branch `feat/public-tools`)

- **Free tools** at `/tools/*`, no sign-in: QR scanner (`BarcodeDetector`, `jsqr` fallback, the one new dependency), UTM builder, Google review link, WhatsApp link, and a static QR generator. Each reuses the shared builders (`buildDestination`, `withUtm`, `stylingOptions`), so what a visitor copies is exactly what the app and the Worker produce.
- **Help button**: a floating WhatsApp link in the app, on Pricing and on the tools.
- **What's new** at `/whats-new`, from `src/lib/changelog.ts`, written for customers (with a self-check that entries are complete and newest first).
- **Landing**: sections for Pages, Forms, Short links and Business, and a footer link hub of real pages only. The sitemap and `llms.txt` list the new public pages.
- QA section 35. No migration and no Worker change: this is the last phase of the competitor-parity roadmap.

## Phase 11: Business tier (branch `feat/business-tier`)

- **Webhooks** (Business): `scan.created`, `form.submitted`, `qr.created`, `qr.updated`, `qr.deleted`, one `deliver(uid, event, payload)` helper that signs with the Standard Webhooks signer (`src/lib/webhooks.ts`, now shared with the Polar verifier), retries 3 times inside the request and records `last_status`. `scan.created` is sent from `/internal/scan`, which the Worker already calls in `waitUntil`. Add, test ping and delete in Settings.
- **Workspaces** (Business, up to 10): `X-Workspace` header resolved in `authenticate`; `workspace_id` on codes (null = default, so no backfill) and on members; filters in the list, ownership checks, bulk and analytics. Caps stay account-wide. A workspace switcher in the header.
- **Several custom domains**: the "1 per account" check is gone; the cap is `limits.custom_domains` (Pro 1, Team 10, Business 50). Each code can print with one of them (`qr_codes.domain`).
- **Settings menu** like Hovercode's, regrouping existing pages with the new sections.
- Pricing lists domain counts, workspaces and webhooks. Migration 011; QA section 34. No Worker change.

## Phase 10: Tracking and smart routing (branch `feat/tracking-routing`)

- **Cities, languages and referrer domains.** The Worker sends `cf.city`, the language and an event id with each scan; migration 010 adds `scan_events.lang/lat/lng`, `qr_stats.cities/languages/referrers`, and a 13-argument `record_scan` next to the old one. New analytics views `cities`, `languages`, `referrers` and `geo`.
- **Opt-in GPS** (Pro and up): an interstitial with a consent line, a 4 s timeout, a fix rounded to 3 decimals posted to `/<slug>/geo`, then the redirect. The map uses Leaflet and OpenStreetMap tiles (the one new dependency).
- **Smart routing** (Pro and up): `content_data.rules`, first match wins, by device, OS, country, language, weekday and time window, in one pure `pickRoute()` in `src/lib/routing.ts` with a self-check, used by the Worker and the dev redirect. The app-store type now saves its pair as rules. Rules are not served when the plan lapses.
- Pricing lists smart routing and GPS. The privacy policy covers location. QA section 33. **Needs a Worker deploy.**

## Phase 9: Forms (branch `feat/forms`)

- **Form codes** (`qr_type 'form'`): the definition lives in `content_data`; `src/lib/forms.ts` holds the field types, the definition check and the submission validator, with a self-check. `renderGuestPage` renders native inputs and a honeypot, the thank-you page, and the form with its error.
- **Submit path.** The Worker caps answers per visitor in KV (5 per 15 minutes) and posts to `/internal/form/:slug`; the server validates against the stored definition, stores the answer in `form_submissions` (migration 009, RLS on, no policies) and emails `notify_email` through the Resend helper the digest now shares (`sendEmail`).
- **Owner side.** A Forms page, an editor with a live preview, a responses table with delete and a CSV download (`toCsv` in `csv.ts`, formula-safe). Answers are in `/api/user/export`.
- Pricing lists forms. QA section 32. **Needs a Worker deploy** (form POST).

## Phase 8: Short links and organisation (branch `feat/links-organize`)

- **Short links** (`kind='link'`) get a Dashboard tab and a "Paste a link" box. **Custom back-halves** on Pro and up (`limits.custom_slug`): `[A-Za-z0-9-]{3,40}`, refused when reserved. `RESERVED_SLUGS` moved into `src/lib/qrContent.ts` and is imported by the Worker and the server, so one list prevents collisions; the self-check checks every `App.tsx` route against it. The Worker's slug pattern widened to match.
- **Folders** (the `client` column, renamed in the UI and available on every plan), **tags** (`qr_codes.tags`, migration 008), filters on `GET /api/qr`, client-side sort and search, and **Select mode** backed by `POST /api/qr/bulk`, with a ZIP download built by `fflate`.
- **UTM tags** on URL codes and links, appended by the Worker (`withUtm()`, existing parameters win). Folder analytics act as campaigns.
- Pricing now lists short links and custom back-halves.
- QA section 31. **Needs a Worker deploy** (slug pattern, reserved list, UTM).

## Phase 7: Pages builder and templates (branch `feat/pages-builder`)

- **Blocks.** `renderGuestPage` renders `content_data.blocks[]` through one block switch: header, socials, button, text, image, video, products, contact (Save as contact → `?vcf=1`), offer, Wi-Fi, divider. Theme colours, button shape and font; per-block translations through `i18n[lang].blocks`. Still pure, escaped and `safeUrl`-checked. Kit pages without blocks render byte-for-byte as before (hash in the self-check).
- **Engagements.** Page links go through `/<slug>/l/<key>`; the Worker logs the click and 302s. Migration 007 adds `qr_stats.clicks` and `record_click()` (a separate function, because a click must not touch the scan totals or the monthly quota). New analytics view `clicks` with CTR.
- **Editor and templates.** `PageEditor.tsx` with a live `srcdoc` preview; `Pages.tsx` lists pages and the template picker; `src/lib/pageTemplates.ts` holds 12 presets in six groups (link-in-bio, products and services, digital business card, promotions, restaurant menu, real estate), with a self-check.
- QA section 30. **Needs a Worker deploy** (click route, `?vcf=1`).

## Phase 6: Code types and QR design (branch `feat/code-types-design`)

- **New URL types** built by one pure `buildDestination(kind, data)` in `src/lib/qrContent.ts`, with a self-check: Google review (Place ID), Instagram, Facebook, TikTok, YouTube, LinkedIn, X, phone, SMS, location and PDF. They store `qr_type 'url'` and `content_data.kind`, like WhatsApp, so analytics needed nothing new.
- **PDF codes.** `POST /api/files` checks the plan's `file_mb` and returns a signed upload URL; the browser uploads straight to the public `files` bucket. Replacing the file keeps the same code. Deleting the account removes the user's files.
- **GS1 Digital Link.** `qr_codes.gtin` (unique), check digit validated on create, edit and at the edge; the code encodes `/01/<GTIN-14>`, which the Worker resolves through `/internal/gs1/<gtin>`.
- **Event codes** (`qr_type 'event'`) download an `.ics` from `renderGuestPage`.
- **App-store codes.** iPhone → App Store, Android → Play, everyone else → the fallback URL (`appTarget()` in `guestPage.ts`, used by the Worker and the dev redirect).
- **Design.** Six dot styles, corner dot style, gradient, circle shape, frames with a call to action (`framedSvg()`), and a saved brand style (`profiles.brand_style`).
- **CreateQR tabs** reorganised like Hovercode's, with a More menu.
- Migration 006 (`gtin`, `brand_style`, the `files` bucket); QA section 29; self-checks in `qrContent.ts` and `guestPage.ts`.
- **Needs a Worker deploy** (GS1 paths, `.ics`, app routing).

## Phase 5: Plans v2 (branch `feat/plans-v2`)

- **Business tier.** $79 / LKR 25,990 a month (10× for a year). `PlanId`, `PRICES`, PayHere checkout, Polar checkout and the Polar product map all accept `business`; new env vars `POLAR_PRODUCT_BUSINESS_MONTHLY` and `…_ANNUAL`.
- **Per-object limits** in `src/lib/plans.ts`: `short_links`, `pages`, `forms`, `custom_domains` (a number, replacing the boolean), `workspaces`, `webhooks`, `gps_tracking`, `smart_routing`, `remove_branding`, `file_mb`. Team now has 10 seats and 10 domains; Free keeps 90 days of history (was 7). Pro gets one custom domain; the trial does not (a domain is a real Cloudflare hostname).
- **Caps enforced** by one `capError()` helper when a row is created (`POST /api/qr`) or switched back on (`PUT`, which used to skip every cap): `LIMIT_SHORT_LINKS`, `LIMIT_PAGES`, `LIMIT_FORMS`. Short links are rows with the new `kind='link'` (migration 005) and do not count against the QR caps. The lapse rule pauses links above `short_links` the same way.
- **Pricing pages.** Pricing, Billing and Landing show four cards generated from `PLANS` and `PRICES` through `planFeatures()`, with "in total" wording and a native `<details>` FAQ on Pricing. The cards list shipped features only; short links, forms, workspaces and webhooks join the list in the phase that ships them.
- **Logo on Free** was already allowed; QA now proves it.
- QA section 28; `src/lib/plans.ts` self-check.

## UI polish (branch `feat/ui-polish`)

Found by loading every signed-in screen at 1440 px and 390 px, in both themes, with a headless browser, and by checking contrast, names and overflow on each page.

- **`/api-docs` returned 404 on a direct load in production.** The SPA rewrite in `vercel.json` excluded everything that starts with `api`. It now excludes only `api/`, `internal/` and `assets/`. The same prefix match broke the dev proxy (`vite.config.ts`) and the dev redirect route. New CI guard: `scripts/check-vercel-routes.mjs`.
- **Pricing page had no spacing.** An unlayered `* { margin: 0; padding: 0 }` in `dynamicqr.css` overrode Tailwind's utilities (Tailwind v4 layers them), so cards, toggles and the FAQ were cramped. The reset is now in `@layer base`.
- **Pricing was unreadable in the light theme** (fixed `text-white` and `text-zinc-*` colours). It now uses the theme tokens.
- **Contrast.** Secondary text (`--text3`) went from 2.6:1 to 5.3:1 (dark) and 3.3:1 to 5.2:1 (light). Light-theme coral and green were darkened to pass 4.5:1.
- **Accessibility:** the top-bar title is an `<h1>`; icon-only buttons have names; toggles are `role="switch"`; colour swatches are keyboard-reachable buttons; 30+ inputs gained labels; a global focus ring; reduced-motion support.
- **Phones:** tables on Dashboard, Pages, Forms and Analytics become stacked cards; stat cards sit two across; the plan-comparison table scrolls inside its card; the billing header and analytics chart header wrap instead of overflowing.
- The sidebar plan badge no longer shows "Free" for a moment before the plan loads.

## Repository structure (branch `chore/repo-structure`)

- The root now holds only config and folders. Moves: `server.ts` → `server/index.ts`, `logger.ts` → `server/logger.ts`, `qa.ts` → `tests/qa.ts`, `migrations/` → `db/migrations/`, `supabase_schema.sql` → `db/schema.sql`, `migrations/queries.sql` → `db/queries.sql`.
- `vercel.json` and `api/index.ts` are unchanged apart from the import path, so the Vercel project settings are untouched. Verified with a local `vercel build`: the function bundle contains `server/index.js`, `server/logger.js` and `src/lib`.
- Every code folder has a README, and `docs/README.md` has the new source map. All doc links and commands use the new paths (older changelog entries keep the paths of their time).
- `scratch/`, `logs/` and `.claude/settings.local.json` are git-ignored.
- Added "Hosting the web app and the API separately" to doc 02: what splitting would take.

## Landing layout fixes (branch `fix/landing-layout`)

- **Footer link groups were pinned to the top-left of the page.** The top bar's `.landing-page nav` rule (position fixed) also matched the footer hub's `<nav>` groups, so they stacked unstyled over the header and the footer collapsed to zero height. The hub's groups are now plain columns.
- **Mobile hero was wider than the screen.** The one-column grid used `1fr`, which cannot shrink below its content; the email field's default width stretched it to 401 px on a 390 px phone. The column is now `minmax(0, 1fr)`, the field can shrink, and the field and button wrap on very narrow screens.
- The last feature card now fills its row instead of leaving an empty grey cell.

## Roadmap added (branch `docs/roadmap-competitor-parity`)

- `docs/ROADMAP.md`: the plan for phases 5–12, with the competitor facts it is based on, the per-change workflow, and a progress checklist.
- `CLAUDE.md` at the repo root: the working agreement for Claude Code sessions (branch per phase, tests and docs in the same PR, migrations run by the owner, QA recipe, code rules).
- Competitor screenshots moved into `docs/competitors/`.

## Lighthouse fixes (branch `perf/lighthouse-fixes`)

Production audit, Lighthouse 13 on mobile, 2026-10-11:

- Before: Performance 65, Accessibility 94, Best Practices 100, SEO 100, Agentic Browsing 50. FCP and LCP were both 5.5 s.
- After, on a local `vite preview` of this branch: Performance 96, Accessibility 100. FCP 2.0 s, LCP 2.3 s.

Changes:

- **Route-level code splitting.** Every page except Landing is now `React.lazy`. The modal and toasts, which use `motion`, load on first use. The landing entry chunk dropped from 1.6 MB to about 700 KB (203 KB gzipped). Recharts, qr-code-styling and motion are no longer in it.
- **Fonts no longer block first paint.** The `@import` was removed from `Landing.css`. `index.html` now has preconnect links and a non-blocking Google Fonts stylesheet.
- **Contrast passes WCAG AA.**
  - `--ink3` changed to `#66655D` and `--ink4` to `#6B6A62`.
  - New `--coral-ink` (`#C2401F`) for coral text and for buttons with white labels.
  - Decorative coral is unchanged.
  - The landing content is now wrapped in `<main>`.
- **Agent and SEO files.**
  - Added `public/llms.txt`.
  - The sitemap now lists only `/` and the legal pages. It used to list `/features`, `/blog` and `/api-docs`, which don't exist, and `/pricing`, which needs a login.
  - `/.well-known/*` is excluded from the SPA rewrite, so it returns 404 instead of HTML.
- **Caching.** `/assets/*` is now served `immutable` for one year. It used to be `max-age=0`.
- **CI.** New step: `npm run build` plus `scripts/check-bundle.mjs`, which enforces the entry budget and checks the shape of llms.txt and the sitemap.

## Post-launch cleanup (branch `chore/post-launch-cleanup`)

- **Removed `recordScanLegacy`**, the non-atomic scan fallback for databases without migration 003. Migration 003 is applied, so `record_scan` errors now surface instead of silently miscounting.
- **QA no longer leaves test data in the database.**
  - `qa.ts` sweeps `@test.dynamicqr.local` users older than 1 h at start.
  - A crashed run deletes the users it created.
  - First run removed 8 stale QA users and their 19 codes from crashed runs on 2026-10-10. Real accounts were untouched.

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
