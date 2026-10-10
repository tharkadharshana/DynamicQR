# Changelog

One entry per phase of the growth plan. Finding ids (C1, H3, …) refer to [11-review-findings.md](11-review-findings.md).

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
