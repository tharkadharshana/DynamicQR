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
| global | 15 min | 300 | every route |
| write | 15 min | 60 | profile, revoke, deactivate-all, delete account, checkout, create QR, delete QR |
| webhook | 1 min | 30 | `/api/billing/notify` |

On Vercel each serverless instance keeps its own counters, so these limits are soft. `PUT /api/qr/:slug` has **no** write limiter.

### Feature-gate error codes (403)

| `code` | When |
|---|---|
| `LIMIT_QR_CODES` | active QR count ≥ plan limit (also returns `limit` and `current`) |
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
| `PUT /api/user/profile` | user, write | Body `{company, jobTitle, country, timezone}` |
| `POST /api/user/revoke-sessions` | user, write | `supabase.auth.admin.signOut(jwt,'global')` |
| `GET /api/user/export` | user | JSON attachment: profile subset and all QR rows (`password_hash` replaced by `has_password`) |
| `PUT /api/user/deactivate-all` | user, write | Sets `is_active=false` on every code and purges each one from the Worker KV. Returns `{success, count}`. |
| `DELETE /api/user/account` | user, write | Deletes QRs, stats, profile and subscriptions, then the auth user. Deletes `scan_events` in the background. |

`GET /api/user/plan` response:

```json
{
  "plan": "free|pro|team", "is_trial": true, "is_expired": false,
  "plan_expires_at": "ISO|null", "plan_since": "ISO|null", "email": "…",
  "limits": { "qr_codes": 3 | -1, "monthly_scans": 1000, "dynamic_qr": false, "password_protect": false,
              "expiry_gate": false, "scan_limit_gate": false, "visitor_guard_gate": false,
              "analytics_days": 7, "custom_domain": false, "api_access": false },
  "addons": { "extra_scans": 0, "extra_qr_codes": 0, "custom_domain": false, "api_access": false },
  "remaining_qr": 2 | -1, "monthly_scans_used": 12,
  "total_qrs": 1, "total_scans": 12, "days_active": 3, "countries_count": 2,
  "profile": { "company": "", "jobTitle": "", "country": "LK", "timezone": "Asia/Colombo" },
  "is_sandbox": false
}
```

`-1` means unlimited. It is used because `Infinity` serialises to `null`.

## QR codes

### `POST /api/qr` (user, write)

```json
{
  "title": "Menu",                       // ≤120 chars
  "destination_url": "https://…",        // must parse with new URL(), or ''
  "qr_type": "url|vcard|wifi|text|email",
  "is_dynamic": true,
  "content_data": { … },                 // type-specific (see doc 05)
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
- **Only `qr_type:'url'` can be dynamic.** Any other type is stored with `is_dynamic:false`, until Phase 2 adds Worker rendering.

### `GET /api/qr` (user)

Returns an array of the user's `qr_codes` rows. Each row has `id` (= slug) and `stats` (the `qr_stats` row, or `null`).

### `GET /api/qr/:slug` (user and owner)

Returns the `qr_codes` row with `password_hash` removed and `has_password: boolean` added.

### `PUT /api/qr/:slug` (user and owner, **or** internal secret)

Accepts `destination_url`, `title`, `style`, `is_active`, and `options` (same shape as create).

- `options` are applied only for user calls. Gates are re-checked against the license.
- Fields not handled: `qr_type`, `content_data`, `is_dynamic`. These cannot change after creation (`content_data` becomes editable in Phase 2).
- The scan limit is written as one `rate_limit` jsonb value `{enabled, max_scans, period:'total'}`.
- Sets `updated_at`, then calls `purgeEdge(slug)`, so the edit applies on the next scan.

Returns `{ success: true, slug }`.

### `DELETE /api/qr/:slug` (user and owner, write)

Deletes `qr_codes` and `qr_stats`. Then, without waiting, it calls `purgeEdge(slug)` (`{APP_URL}/internal/purge/{slug}`, handled by the Worker) and deletes `scan_events` in batches of 500.

## Analytics: one QR (user and owner)

All of these read the single `qr_stats` row, except `recent`, which reads `scan_events`.

| Path | Query | Response |
|---|---|---|
| `/api/analytics/:slug/summary` | | `{total_scans, unique_visitors, mobile_pct, first_scan, last_scan}`. First and last are day keys. |
| `/api/analytics/:slug/timeseries` | `days=N` (capped to plan `analytics_days`) **or** `start&end` (**not capped**) | `[{date, total_scans, unique_scans}]` with zero-filled days. `unique_scans` is estimated. |
| `/api/analytics/:slug/devices` | | `[{device_type, count, pct}]` |
| `/api/analytics/:slug/countries` | | top 10 `[{country, scans, unique_visitors: 0}]` |
| `/api/analytics/:slug/os` | | `[{os, count, pct}]` |
| `/api/analytics/:slug/browsers` | | `[{browser, count, pct}]` |
| `/api/analytics/:slug/referrers` | | always `[]` (no `referrers` column) |
| `/api/analytics/:slug/recent` | | last 10 events `[{id, scanned_at, country, city:'Unknown', device_type, os, browser, referrer, is_unique}]` |
| `/api/analytics/:slug/advanced` | | `{regions:[], isps:[], languages:[], hours:[], os_versions:[], tls_protocols:[], eu_scans:0}`, always empty |

## Analytics: whole account (user, `:uid` must equal the caller)

Every route accepts `?slugs=a,b,c` to filter to some of the user's codes. Each one loads all the user's `qr_codes`, then their `qr_stats` in chunks of 30.

| Path | Response |
|---|---|
| `/api/analytics/account/:uid` | `{total_scans, unique_visitors, total_qrs, active_qrs, first_scan}` |
| `…/summary` | `{total_scans, unique_visitors, total_qrs}` |
| `…/timeseries` | same as per-QR, summed |
| `…/devices` | `[{device_type, count, pct}]` (mobile, desktop, tablet with count > 0) |
| `…/countries` | top 10 `[{country, scans, unique_visitors:0}]` |
| `…/browsers` | `[{browser, count}]` |
| `…/os` | `[{os, count}]` |
| `…/referrers` | always `[]` |
| `…/recent` | the 20 newest events across the codes (20 per chunk, then merged) |
| `…/performance` | `[{id, slug, title, total_scans, unique_scans}]` sorted by scans. N+1 queries (one per QR). |

## Billing

| Method / path | Auth | Purpose |
|---|---|---|
| `POST /api/billing/checkout` | user, write | Body `{plan:'pro'|'team', interval:'monthly'|'annual'}`. Both are required, otherwise 400. Writes a pending order and returns signed PayHere form fields, charged in **LKR**. |
| `GET /api/billing/invoices` | user | Up to 12 non-pending, non-failed `subscriptions` rows, newest first, with `date`, `currency` and `amount` |
| `POST /api/billing/notify` | PayHere `md5sig` (form-urlencoded) | Webhook. It trusts only the server order, checks the amount and currency, and is idempotent per `payment_id`. See [doc 07](07-plans-billing-payhere.md). |

The add-on checkout was removed in Phase 0: there was no UI and the webhook branch was broken.

## Internal (Worker to API)

| Method / path | Auth | Purpose |
|---|---|---|
| `GET /internal/slug/:slug` | secret | Compact gate config including the policy fields `quota_exceeded`, `visitor_guard` and the resolved `visitor_rate_limit` ([doc 03](03-scan-flow-and-gate-engine.md#3-config-lookup)) |
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
