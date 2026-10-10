# Changelog

One entry per phase of the growth plan. Finding ids (C1, H3, …) refer to [11-review-findings.md](11-review-findings.md).

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
