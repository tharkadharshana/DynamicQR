# 04 — Backend API Reference

All routes live in [server.ts](../server.ts). The routes below are the **only** API that exists. The `/api/v1/*` endpoints, API keys and webhooks shown on the in-app API Docs page are **not implemented**.

## Conventions

- **Auth.** `Authorization: Bearer <Supabase access token>`, checked by `authenticate` ([server.ts:293](../server.ts#L293)). Missing or invalid tokens get `401` with a plain-text body.
- **Ownership.** `requireOwnership` ([server.ts:318](../server.ts#L318)) loads `qr_codes[slug]`. It returns `404` when the code is missing and `403` when `user_uid ≠ req.user.uid`. Account routes compare `:uid` with the token's uid instead.
- **Internal.** `x-internal-secret: $INTERNAL_SECRET`. Requests with this header also skip the rate limiters.
- **Errors** are usually `{ "error": "message" }`. Feature gates add `code` (see below).
- **Body limit:** 100 KB JSON.
- **Every response** carries `X-Request-Id`. Each request is logged on finish with method, path, status, ms, uid, IP and UA.

### Rate limits (express-rate-limit, in memory per instance)

| Limiter | Window | Max | Applied to |
|---|---|---|---|
| global | 15 min | 300 (`RATE_LIMIT_MAX`) | every route |
| write | 15 min | 60 (`RATE_LIMIT_WRITE_MAX`) | profile, revoke, deactivate-all, delete account, checkouts, create QR, delete QR |
| webhook | 1 min | 30 | `/api/billing/notify` |

On Vercel each serverless instance keeps its own counters, so these limits are soft. `PUT /api/qr/:slug` has **no** write limiter.

### Feature-gate error codes (403)

| `code` | When |
|---|---|
| `LIMIT_QR_CODES` | active QR count ≥ plan limit (also returns `limit` and `current`) |
| `LIMIT_DYNAMIC_QR` | active dynamic codes ≥ `limits.dynamic_qr_codes` (Free: 1) |
| `LIMIT_SHORT_LINKS`, `LIMIT_PAGES`, `LIMIT_FORMS` | active short links (`kind='link'`), pages (`qr_type='page'`) or forms (`qr_type='form'`) ≥ the plan's `short_links`, `pages` or `forms` (also returns `limit` and `current`) |
| `FEATURE_DYNAMIC_QR` | `is_dynamic` without the dynamic feature |
| `FEATURE_PASSWORD` | `password_protect` without the feature |
| `FEATURE_EXPIRY` | `expiry_date_enabled` without the feature |
| `FEATURE_SCAN_LIMIT` | `scan_limit_enabled` without the feature |

## Health

### `GET /api/health` (public)

```json
{ "status": "ok" | "error", "timestamp": "…",
  "environment": { "NODE_ENV": "production", "APP_URL": "set", "SUPABASE_URL": "set",
                   "SUPABASE_SERVICE_ROLE_KEY": "set", "INTERNAL_SECRET": "set", "VERCEL": "true" },
  "critical_missing": [] }
```

## User

| Method / path | Auth | Purpose |
|---|---|---|
| `GET /api/user/plan` | user | **Main bootstrap call.** Creates the profile with a 14-day trial on first call. Returns the license plus usage. |
| `PUT /api/user/profile` | user, write | Body `{company, jobTitle, country, timezone, digestOptOut?}` |
| `POST /api/user/revoke-sessions` | user, write | `supabase.auth.admin.signOut(jwt,'global')` |
| `GET /api/user/export` | user | JSON attachment: profile subset and all QR rows (`password_hash` replaced by `has_password`) |
| `PUT /api/user/deactivate-all` | user, write | Sets `is_active=false` on every code and purges each one from the Worker KV. Returns `{success, count}`. |
| `DELETE /api/user/account` | user, write | Deletes the auth user. The cascade removes the profile, codes, stats, events and subscriptions. Then it purges each code from the edge. |

`GET /api/user/plan` response:

```json
{
  "plan": "free|pro|team", "is_trial": true, "is_expired": false,
  "plan_expires_at": "ISO|null", "plan_since": "ISO|null", "email": "…",
  "limits": { "qr_codes": 3 | -1, "monthly_scans": 1000, "dynamic_qr": false, "password_protect": false,
              "expiry_gate": false, "scan_limit_gate": false, "visitor_guard_gate": false,
              "analytics_days": 7, "custom_domain": false, "api_access": false },
  "addons": { "extra_scans": 0, "extra_qr_codes": 0, "custom_domain": false, "api_access": false },
  "remaining_qr": 2, "monthly_scans_used": 12,
  "active_dynamic": 1, "dynamic_over_allowance": 0,
  "pause_on": "ISO" | null,            // when codes above the allowance pause (lapse rule)
  "polar_enabled": false, "polar_portal_url": null,
  "total_qrs": 1, "total_scans": 12, "days_active": 3, "countries_count": 2,
  "profile": { "company": "", "jobTitle": "", "country": "LK", "timezone": "Asia/Colombo" },
  "is_sandbox": false
}
```

`limits` also carries `dynamic_qr_codes`. No plan is unlimited any more.

## QR codes

### `POST /api/qr` (user, write)

```json
{
  "title": "Menu",                       // ≤120 chars
  "destination_url": "https://…",        // must parse with new URL(), or ''
  "qr_type": "url|vcard|wifi|text|email|page|event",   // anything else → 400
  "gtin": "4006381333931",               // optional GS1 GTIN-8/12/13/14: check digit validated (400 INVALID_GTIN), stored as GTIN-14, unique (409 GTIN_TAKEN); forces dynamic
  "slug": "menu-2026",                   // optional custom back-half (Pro+): 3–40 [A-Za-z0-9-]; 400 INVALID_SLUG / RESERVED_SLUG, 403 FEATURE_CUSTOM_SLUG, 409 SLUG_TAKEN
  "tags": ["menu", "colombo"],           // optional, lower-cased, ≤10 of ≤30 chars (also on PUT)
  "kind": "qr|link",                     // default qr; link = short link: dynamic url with a destination_url (else 400)
  "is_dynamic": true,
  "content_data": { … },                 // type-specific (see doc 05), max 20 KB
  "style": { "dot_color", "bg_color", "dot_style", "corner_style",
             "error_correction", "output_size", "logo_url" },
  "options": {
    "password_protect": false, "password": "",          // ≤128 chars
    "expiry_date_enabled": false, "expiry_date": "",
    "scan_limit_enabled": false, "scan_limit": 100,
    "visitor_rate_limit": 5, "visitor_rate_period": 3600
  }
}
```

The route returns `201` with the stored `qr_codes` row.

- Without the Visitor Guard feature, the visitor limit is forced to 5 per 3600 s.
- `page` codes are always dynamic; every other type follows `is_dynamic`.
- Writes a `qr_created` event.

### `GET /api/qr` (user)

Returns an array of the user's `qr_codes` rows (`password_hash` removed, `has_password` added). Each row has `id` (= slug) and `stats` (the `qr_stats` row, or `null`). Optional filters (Phase 8): `?kind=qr|link`, `?qr_type=page`, `?tag=<tag>`, `?folder=<client>`.

### `POST /api/qr/bulk` (user, write)

Body `{slugs: [...1–500], action: 'folder'|'tag'|'untag'|'activate'|'deactivate'|'delete', value?}`. Ownership is checked per slug, every changed code is purged at the edge, and activation goes through the plan caps one code at a time. Returns `{done: [slugs], failed: [{slug, error}]}`.

### `GET /api/qr/:slug` (user and owner)

Returns the `qr_codes` row with `password_hash` removed and `has_password: boolean` added.

### `PUT /api/qr/:slug` (user and owner, **or** internal secret)

Accepts `destination_url`, `title`, `style`, `is_active`, and `options` (same shape as create).

- `options` are applied only for user calls. Gates are re-checked against the license.
- `content_data` is editable (max 20 KB). A change to `offer.text` writes an `offer_changed` event.
- `qr_type` and `is_dynamic` cannot change after creation.
- The scan limit is written as one `rate_limit` jsonb value `{enabled, max_scans, period:'total'}`.
- Sets `updated_at`, then calls `purgeEdge(slug)`, so the edit applies on the next scan.

Returns `{ success: true, slug }`.

### `DELETE /api/qr/:slug` (user and owner, write)

Deletes the `qr_codes` row. `qr_stats` and `scan_events` go with it (on delete cascade). Then it calls `purgeEdge(slug)` without waiting.

### `POST /api/files` (user, write)

Body `{type: 'pdf'|'png'|'jpg'|'webp', size: <bytes>}`. Checks `size` against the plan's `file_mb` (403 `LIMIT_FILE_SIZE` with `limit_mb`), then returns `201 {path, token, signedUrl, contentType, publicUrl}`. The browser uploads directly with `supabase.storage.from('files').uploadToSignedUrl(path, token, file)`, so no file bytes go through Vercel. Files live under `files/<uid>/`; deleting the account removes them.

### `POST /api/events` (user)

Body `{ name: 'print_opened' | 'kit_started', slug? }`. Records a client-side funnel event. An unknown name returns 400. Server-side events (`qr_created`, `first_scan`, `offer_changed`, `paid`) are written automatically.

## Analytics

One set of views is served in two scopes:

- `/api/analytics/:slug/<view>` for one code you own
- `/api/analytics/account/:uid/<view>` for your account, where `:uid` must be the caller, with optional `?slugs=a,b,c`

`/api/analytics/account/:uid` is the same as `/summary`. Every view reads `qr_stats`, except `recent`, which reads `scan_events`.

| View | Response |
|---|---|
| `summary` | `{total_scans, unique_visitors, mobile_pct, total_qrs, active_qrs, first_scan, last_scan}` |
| `timeseries` | `?days=N` or `?start&end`. **Both are capped to the plan's history** (`analytics_days`). Returns `[{date, total_scans, unique_scans}]` with zero-filled days. Uniques are real from `days_unique` (since migration 003); older days are estimated. |
| `devices` | `[{device_type, count, pct}]` |
| `countries` | top 10 `[{country, scans, unique_visitors: 0}]` |
| `os`, `browsers` | `[{os|browser, count, pct}]` |
| `clicks` | Pages: `[{slug, key, label, url, clicks, ctr}]`, labels from the page's current blocks, CTR = clicks / scans × 100 |
| `hours` | 24 rows `[{hour: 0–23 (UTC), scans}]`, all time |
| `performance` | `[{id, slug, title, total_scans, unique_scans}]`, by scans |
| `recent` | the 20 newest events `[{id, slug, scanned_at, country, city, device_type, os, browser, referrer, is_unique}]` |

`GET /api/analytics/:slug/events.csv` returns raw scans for one code (newest 10,000) as `text/csv`.

## Cron (Vercel Cron, `Authorization: Bearer $CRON_SECRET`)

| Route | Schedule (vercel.json, UTC) | Does |
|---|---|---|
| `GET /api/cron/cleanup` | `30 21 * * *` (03:00 Colombo) | Deletes `scan_events` older than 400 days. Returns `{deleted}`. |
| `GET /api/cron/digest` | `30 2 * * 1` (Mon 08:00 Colombo) | Emails every opted-in owner who has codes: last 7 days' scans, the busiest hour in their time zone, and the top code (`buildDigest()` in [src/lib/digest.ts](../src/lib/digest.ts), sent through Resend). `?dry=1` builds without sending, `?uid=` limits to one account. With no `RESEND_API_KEY` it returns `skipped`. |

## Team plan

| Method / path | Auth | Purpose |
|---|---|---|
| `GET /api/keys` | owner session | Keys: `{id, name, prefix, created_at, last_used_at, revoked_at}` |
| `POST /api/keys` | owner session, write | `{name?}` → `201 {…, key}`. The full `sk_live_…` key is returned **only here**; it is stored as SHA-256. Needs `api_access` (`403 FEATURE_API`). |
| `DELETE /api/keys/:id` | owner session, write | Revoke |
| `GET /api/team` | user | Members `{id, member_email, joined}` |
| `POST /api/team` | owner session, write | `{email}` invite. `403 LIMIT_SEATS` when owner + members ≥ `limits.seats` (Team: 5). `409` if already invited. |
| `DELETE /api/team/:id` | owner session, write | Remove a member |
| `GET /api/domains` | user | `{hostname, status: pending|active|failed, cname_target}` or `null`. A pending status is refreshed from Cloudflare. |
| `POST /api/domains` | owner session, write | `{hostname}`. Needs `custom_domain` (Team). One per account. Registers a Cloudflare for SaaS custom hostname. `503` until `CF_API_TOKEN` / `CF_ZONE_ID` are set. |
| `DELETE /api/domains` | owner session, write | Remove it from Cloudflare and the account |

**Owner-only** (`sessionOwner`): checkouts, profile changes, deactivate-all, account deletion, keys, members and domains. These return `403 SESSION_ONLY` for an API key, or `403 OWNER_ONLY` for a member.

### Public REST API (`/api/v1`)

`/api/v1/<path>` is rewritten to `/api/<path>` before routing, so the API *is* the dashboard's own routes. Authenticate with `Authorization: Bearer sk_live_…`. A key acts as its owner, and it only works while the owner's plan has `api_access`. `POST/PUT /api/qr` also accept `client` (a folder name, ≤60 chars). The in-app page is [ApiDocs.tsx](../src/pages/ApiDocs.tsx). There are no webhooks yet.

## Billing

| Method / path | Auth | Purpose |
|---|---|---|
| `POST /api/billing/checkout` | user, write | Body `{plan:'pro'|'team', interval:'monthly'|'annual', currency?:'LKR'|'USD'}`. Writes a pending order and returns signed PayHere form fields. LKR by default; USD is the fallback when Polar is off. |
| `POST /api/billing/polar/checkout` | user, write | Body `{plan, interval}`. Writes a pending Polar order and returns `{url}` of a Polar card checkout. 503 when `POLAR_ACCESS_TOKEN` or the product id is missing. |
| `POST /api/billing/polar/webhook` | Standard Webhooks signature | Polar events: `subscription.active/updated/uncanceled` (apply the period), `subscription.canceled` (keep until expiry), `subscription.revoked` / `order.refunded` (downgrade). Idempotent per `subscription id + period end`. |
| `GET /api/billing/invoices` | user | Up to 12 non-pending, non-failed `subscriptions` rows, newest first, with `date`, `currency` and `amount` |
| `POST /api/billing/notify` | PayHere `md5sig` (form-urlencoded) | Webhook. It trusts only the server order, checks the amount and currency, and is idempotent per `payment_id`. See [doc 07](07-plans-billing-payhere.md). |

The add-on checkout was removed in Phase 0: there was no UI and the webhook branch was broken.

## Internal (Worker to API)

| Method / path | Auth | Purpose |
|---|---|---|
| `GET /internal/slug/:slug` | secret | Compact gate config including the policy fields `quota_exceeded`, `paused` (lapse rule), `title`, `visitor_guard`, the resolved `visitor_rate_limit`, and for non-URL codes `qr_type`, `content_data` and `branding` ([doc 03](03-scan-flow-and-gate-engine.md#3-config-lookup)) |
| `POST /internal/click` | secret | `{slug, key}` → `record_click` (Pages engagements); 400 on a malformed key |
| `GET /internal/gs1/:gtin` | secret | `{slug}` of the code that owns the GTIN; 400 on a bad check digit, 404 if none |
| `POST /internal/scan` | secret | Records the scan only (the quota is enforced by the Worker from the config). Returns `OK` or `404`. |

Vercel routes `/internal/*` to the function (added in Phase 0).

## Dev only

| Path | Purpose |
|---|---|
| `GET /:slug` | Redirect fallback with type rendering. It skips paths starting with `api` or `assets`, and paths that contain a `.`. |
| `*` | Vite middleware in dev. In non-Vercel production: static `dist/` with an SPA fallback. |

## Vercel rewrites ([vercel.json](../vercel.json))

| Source | Destination | Note |
|---|---|---|
| `/api/(.*)` | function | |
| `/internal/(.*)` | function | Worker → API calls (config lookup, scan report) |
| `/((?!api\|internal\|assets).*)` | `/index.html` | SPA. The static files in `public/` (robots, sitemap) are served first. |
