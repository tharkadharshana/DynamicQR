# 09 — Security Model

## Trust boundaries

| Actor | Credential | Can reach |
|---|---|---|
| Anonymous scanner | none | Worker (`/{slug}`), public SPA, `/api/health`, legal pages |
| Signed-in user | Supabase JWT (browser localStorage) | `/api/*` (with ownership checks). Direct Supabase access is limited to reading their own `profiles` row. |
| Worker | `INTERNAL_SECRET` header | `/internal/*`, `PUT /api/qr/:slug` (as any owner) |
| PayHere | `md5sig` (merchant secret) | `/api/billing/notify` |
| API key (Team) | `sk_live_…` (SHA-256 stored) | the owner's `/api/*` (also `/api/v1/*`), but not billing, members, keys or domains |
| Team member | Supabase JWT | the owner's workspace, but not owner-only actions |
| Backend | `SUPABASE_SERVICE_ROLE_KEY` | everything, bypasses RLS |

## Controls that exist

- **API auth.** `supabase.auth.getUser(token)` on every protected route ([server.ts:293](../server.ts#L293)). This is correct: it validates against Supabase, not just the JWT signature.
- **Ownership.** `requireOwnership` on per-QR routes, and a `uid` match on account routes.
- **Input validation** on create and update: title length, `new URL()` on the destination, password length.
- **Rate limits**: global, write and webhook (in-memory; see doc 04).
- **Helmet** headers. The CSP is **disabled**, and COOP/CORP are relaxed for the OAuth popup.
- **CORS** is locked to `APP_URL`. The server exits on start in production when `APP_URL` is missing.
- **HTML escaping** of text and WiFi content in the dev redirect page.
- **302, not 301.** Browsers do not cache destinations.
- **No raw IP in Postgres.** The visitor fingerprint is a salted daily SHA-256 used only in KV keys.
- **PayHere signature** check on notify (`timingSafeEqual`), with the merchant id checked, the amount and currency matched to a server-side order, and idempotency per `payment_id` (DB unique index).
- **RLS deny-by-default.** No policies on the app tables, and select-only on your own profile (migration 001).
- **PIN lockout.** 5 wrong PINs per visitor per 15 minutes.
- **Secrets** are Worker secrets or env vars, not committed. `.env*` is git-ignored.

## Findings (ranked)

### S1 — Critical: RLS policies grant every role full access — ✅ fixed in Phase 0 (migrations/001_phase0.sql)

The QA run before the fix proved the anon key could **write** too: a QR title was overwritten with "pwned". QA section 20 now checks reads and writes for both anon and signed-in users.

[supabase_schema.sql](../supabase_schema.sql) creates `"Service role full access …" on <table> for all using (true) with check (true)` on `qr_codes`, `qr_stats`, `scan_events`, `subscriptions` and `addon_purchases`. Without `to service_role`, the policy applies to `anon` and `authenticated` too. The anon key is public, because it ships in the JS bundle.

- **Confirmed live (read-only):** an anon request read `qr_codes` rows, including `password_hash`, `destination_url` and `user_uid`.
- From the policy text, anon can also **update or delete any QR code**: hijack destinations, delete codes, inflate stats. Write access was **not** tested on purpose.

**Fix.** The backend uses the service-role key, which bypasses RLS. So just drop these policies. RLS stays enabled, and with no policy the table is deny-all for anon and authenticated users.

```sql
drop policy "Service role full access qr_codes" on public.qr_codes;
drop policy "Service role full access qr_stats" on public.qr_stats;
drop policy "Service role full access scan_events" on public.scan_events;
drop policy "Service role full access subscriptions" on public.subscriptions;
drop policy "Service role full access addon_purchases" on public.addon_purchases;
```

### S2 — Critical: users can set their own plan — ✅ fixed in Phase 0 (migration 001; QA proved `plan='team'` worked before the fix)

The `profiles` "Users can update own profile" policy allows updates to every column. A signed-in user can run `supabase.from('profiles').update({plan:'team', plan_expires_at:'2099-01-01'}).eq('id', myId)` from the browser console.

**Fix.** The SPA never writes `profiles` directly; it goes through `/api/user/profile`. So drop the update and insert policies (keep select, or drop that too):

```sql
drop policy "Users can update own profile" on public.profiles;
drop policy "Users can insert own profile" on public.profiles;
```

### S3 — Critical: PayHere plan and uid are not bound to the payment — ✅ fixed in Phase 0 (uid, plan and amount come from the server-side order; QA tampers `custom_2`)

See [doc 07, B1](07-plans-billing-payhere.md#billing-defects-ranked). Paying $7 can unlock Team, or credit another account.

### S4 — High: PIN brute force — ✅ fixed in Phase 0 (KV `pwfail` lockout, QA section 15b)

The Worker never counts failed PIN POSTs toward any limit. The PIN space is often 4 to 6 digits, and the hash is a fast unsalted `sha256(pin+slug)`. Together with S1, which exposes the hash, a 4-digit PIN can be cracked offline at once.

**Fix:** a KV counter `pwfail:{slug}:{hash}` (for example 5 tries per 15 min), plus S1.

### S5 — Medium: open redirect / phishing surface

Any signed-in user, including trial users, can point a code on the platform domain at any `http(s)` URL. That suits a QR product, but abuse reports will come. Consider a destination blocklist or Google Safe Browsing, and a way to disable abusive codes.

### S6 — Medium: internal secret is broad

`x-internal-secret` allows `PUT /api/qr/:slug` on **any** code, with no ownership check, and it skips every rate limit. That is fine while the secret is safe. Keep it long, rotate it on any leak, and consider limiting the Worker's PUT to `{is_active:false}`.

### S7 — Medium: password hashes returned to the client — ✅ fixed in Phase 0 (`has_password` instead)

`GET /api/qr/:slug` and `/api/user/export` return `password_hash`. Remove it from responses and return `has_password: boolean` instead.

### S8 — Low

- `/api/health` is public and lists which secrets are set. That leaks little, but it should drop the per-variable list in production.
- `authenticate` echoes the internal error message to the client (`Unauthorized: …`).
- ~~Webhook signature comparison uses `!==`~~: now `crypto.timingSafeEqual`.
- ~~Service-role key accepted from `VITE_*` env names~~: removed. Vite inlines `VITE_*` variables into the browser bundle.
- Helmet CSP is off. A basic CSP is possible once the OAuth flow is known to work with it. Supabase OAuth uses a redirect, not a popup, so the COOP relaxation may not be needed.
- vCard and WiFi fields are not escaped (correctness more than security).
- Logo data URLs (SVG accepted) are rendered as `<img src>`. That is safe, because SVG in `<img>` does not run scripts.
- There are no request-body schema checks beyond those listed. `style` and `content_data` are stored as given.

## Privacy

- Raw IPs are not stored in the DB. The Worker sends IP and UA to the API, and they show up in **Vercel request logs** (the access log records `ip` and `ua`). Mention this in the privacy policy, or stop logging them.
- `scan_events` has no retention limit. Add a cleanup job, for example 400 days, to match the Team history limit.
- Export and account deletion exist (GDPR-style rights). Deletion removes `scan_events` in the background, and a failure there is only logged.

## Phase 9: forms

- The stored definition is the trust boundary: `validateSubmission()` strips unknown fields, checks types and lengths, and the owner only ever sees validated values. Notification emails escape every value.
- Spam: a hidden honeypot input (`_hp`; a filled one is accepted and dropped, so bots learn nothing) and a per-visitor KV counter at the edge (5 answers per 15 minutes).
- `ip_hash` is the Worker's daily salted visitor hash, never the IP. `form_submissions` has RLS on and no policies.
- CSV downloads prefix formula-like cells (`=`, `+`, `-`, `@`) with a quote mark (`toCsv`), so a spreadsheet does not run them.
