# 05 — Data Model

Source of truth: [db/schema.sql](../db/schema.sql) (the end state). Changes after the first version are applied with the incremental files in [db/migrations/](../db/migrations), run in order in the Supabase SQL editor. Phase 0 added [001_phase0.sql](../db/migrations/001_phase0.sql).

[firestore.rules](../firestore.rules) is a leftover from the Firebase era and is not used.

## Entity diagram

```
auth.users (Supabase)
   │ 1:1  (on delete cascade)
   ▼
profiles ──1:N──▶ qr_codes ──1:1──▶ qr_stats
   │                 │
   │                 └──1:N──▶ scan_events
   ├──1:N──▶ subscriptions
   └──1:N──▶ addon_purchases
```

All foreign keys `on delete cascade`, so deleting the auth user removes everything. The app also deletes rows manually before that.

## Tables

### `profiles`, one per user

| Column | Type | Written by | Notes |
|---|---|---|---|
| `id` | uuid PK → auth.users | `/api/user/plan` (first call) | |
| `email` | text | first call | |
| `plan` | text, default `'free'` | PayHere notify | `free`, `pro` or `team`. This is the *stored* plan. The *effective* plan comes from `getLicense()`. |
| `plan_expires_at` | timestamptz | notify | Past date means the effective plan drops to free |
| `plan_since` | text | notify (first payment) | ISO string |
| `is_trial` | bool, default true | first call: true. Notify: false. | |
| `trial_expires_at` | timestamptz | first call: now + 14 d | |
| `addons` | jsonb `{extra_scans, extra_qr_codes, custom_domain, api_access}` | notify (add-ons, currently broken) | Added on top of plan limits |
| `company`, `job_title`, `country` (`LK`), `timezone` (`Asia/Colombo`) | text | `PUT /api/user/profile` | |
| `monthly_scans` | jsonb `{ "2026-10": 123 }` | every scan (`record_scan`) | Account-wide quota and the Billing usage display |
| `digest_opt_out` | bool, default false | Settings toggle | Weekly digest opt-out (migration 003) |
| `payhere_order_id` | text | notify | last order |
| `created_at`, `updated_at` | timestamptz | | `updated_at` is set by the app; there is no trigger |

### `qr_codes`, one per QR

| Column | Type | Notes |
|---|---|---|
| `slug` | text PK | 7 chars from `23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ`. Never changes (it is printed). |
| `user_uid` | uuid → profiles | indexed |
| `title` | text | default `My QR` |
| `destination_url` | text | `''` for non-URL types |
| `qr_type` | text | `url`, `vcard`, `wifi`, `text`, `email` or `page` |
| `kind` | text, default `qr` | `qr` or `link` (check constraint, migration 005). A `link` is a short link: a dynamic URL row shown without a QR image, counted against `short_links` and not against the QR caps. |
| `is_dynamic` | bool | |
| `is_active` | bool | |
| `content_data` | jsonb | type-specific, see below. A Pages-builder page has `{blocks: [...], theme: {accent, bg, text, button, font}, i18n: {si: {blocks: [...overrides]}, ta: ...}}`. |
| `style` | jsonb | `{dot_color, bg_color, dot_style, corner_style, error_correction, output_size, logo_url}`. `logo_url` is a **base64 data URL**. |
| `password_hash` | text | `sha256(password + slug)` hex |
| `expiry_date` | text | `datetime-local` string, no time zone |
| `rate_limit` | jsonb `{enabled, max_scans, period:'total'}` | the scan-limit gate |
| `visitor_rate_limit` | int, default 5 | 0 means unlimited (paid plans) |
| `visitor_rate_period` | int seconds, default 3600 | |
| `qr_image_url` | text | unused |
| `created_at`, `updated_at` | timestamptz | `updated_at` is never set by PUT |

`content_data` by type:

| Type | Fields | Encoded as (static) |
|---|---|---|
| vcard | `first_name, last_name, phone, email, company, website` | vCard 3.0 text |
| wifi | `ssid, password, encryption ('WPA'/'WEP'/'')` | `WIFI:S:…;T:…;P:…;;` |
| text | `text` | raw text |
| email | `email, subject, body` | `mailto:…?subject=…&body=…` |

| page | `name, subtitle, color, offer:{title?, text}, links:[{kind, label, url}], wifi:{ssid, password}, i18n:{si|ta:{name?, subtitle?, offer?, labels[]}}, kit:{…wizard form}` | dynamic only: rendered by the Worker |
| url (WhatsApp) | `wa_phone, wa_text` (the destination is `https://wa.me/<digits>?text=…`) | URL |

Field values are not escaped in the vCard and WiFi strings. A `;` or `\` in an SSID or name breaks the payload.

### `qr_stats`, one per QR (pre-aggregated)

| Column | Shape |
|---|---|
| `slug` | PK → qr_codes |
| `total_scans`, `unique_scans` | int |
| `days` | `{ "2026-10-10": 14 }`: total per UTC day |
| `days_unique` | `{ "2026-10-10": 9 }`: real uniques per day (migration 003) |
| `hours` | `{ "19": 40 }`: scans per UTC hour, all time (migration 003) |
| `countries` | `{ "LK": 10, "US": 2 }` (ISO-2 from `cf.country`) |
| `browsers`, `os`, `devices` | `{ name: count }` |
| `monthly_scans` | `{ "2026-10": 140 }`, used for the quota check |
| `updated_at` | never updated by the app |

Columns the code **reads but which do not exist**: `referrers`, `regions`, `isps`, `languages`, `hours`, `os_versions`, `tls_protocols`, `eu_scans`. Those endpoints always return empty results.

### `events`, the activation funnel (migration 002)

`id, uid → profiles, name, slug, created_at`. Names: `qr_created`, `print_opened`, `first_scan`, `offer_changed`, `paid`, `kit_started`. The API writes them (they never fail a request), and RLS denies direct access. Founder queries live in [db/queries.sql](../db/migrations/queries.sql): the per-account funnel, stuck accounts, funnel totals, and revenue by month.

### Team tables (migration 004)

| Table | Columns | Notes |
|---|---|---|
| `workspace_members` | `owner_uid, member_email (lower-case), member_uid, role, created_at`, unique `(owner_uid, member_email)` | `member_uid` is filled when the invite is claimed on the member's first sign-in (`workspaceOwner()` in `authenticate`) |
| `api_keys` | `uid, name, prefix, key_hash (unique), created_at, last_used_at, revoked_at` | Only the SHA-256 is stored |
| `custom_domains` | `uid, hostname (unique), cf_id, status` | Several per account (Pro 1, Team 10, Business 50); Cloudflare for SaaS custom hostname id |

### Business tables (migration 011)

| Table / column | Notes |
|---|---|
| `webhooks` | `uid, url, secret, events text[], created_at, last_status, last_delivery_at`. RLS on, no policies. |
| `workspaces` | `owner_uid, name`. RLS on, no policies. |
| `ai_usage` | AI cost ledger (migration 013): `uid`, `kind` (`menu_generate`, `menu_import`, `image`, `template_generate`), `model`, `quality`, `size`, `images`, `input_tokens`, `output_tokens`, `cached_tokens`, `cost_usd`, `unit_prices` (the prices used), `status`, `ref`, `created_at`. RLS on, no policies. |
| `cost_items` | Hand-entered monthly costs (`month` YYYY-MM, `label`, `amount_usd`). RLS on, no policies. |
| `profiles.ai_grant_usd` | Extra monthly AI allowance granted by an admin, in USD of provider cost |
| `page_templates` | Pages-builder presets (Phase 13): `id` (text pk), `name`, `description`, `category`, `tags[]`, `content` (jsonb), `status` (`draft`/`published`), `sort`, `source` (`manual`/`ai`), `pro_only`. RLS on, no policies. |
| `qr_codes.workspace_id` | → `workspaces(id)` on delete set null; `null` is the owner's default workspace, so existing rows need no backfill |
| `qr_codes.domain` | the verified custom domain this code prints with; `null` = the account default |
| `workspace_members.workspace_id` | a member held to one workspace; `null` = all |

Also (migration 010): `scan_events.lang`, `scan_events.lat/lng` (opt-in GPS, 3 decimals), `qr_stats.cities/languages/referrers` (jsonb maps), and a 13-argument `record_scan` (adds `p_id, p_city, p_lang, p_ref_host`; the 9-argument version stays so the deployed API keeps working until the new code ships). `qr_codes.tags` (text[], GIN-indexed, migration 008; folders stay the `client` column), `qr_stats.clicks` (jsonb `{key: n}`, written only by `record_click(p_slug, p_key)`, migration 007), `qr_codes.gtin` (GS1 GTIN-14, unique when set, migration 006), `profiles.brand_style` (jsonb, the saved default design, migration 006), the public Storage bucket `files` (100 MB cap, PDF and images, written only through API-signed upload URLs, migration 006), `qr_codes.client` (folder name, indexed with `user_uid`), and `profiles.agency_name` / `profiles.agency_logo` (≤64 KB data URL) for white-label printed reports.

### `form_submissions` (migration 009)

| Column | Notes |
|---|---|
| `id` | uuid |
| `slug` | → `qr_codes(slug)`, on delete cascade |
| `data` | jsonb `{fieldId: value}`, only fields in the form's definition |
| `ip_hash` | the Worker's daily, salted visitor hash (never the IP) |
| `created_at` | indexed with `slug` |

RLS is on with no policies.

### `scan_events`, one per scan (bots excluded)

| Column | Written | Notes |
|---|---|---|
| `id` uuid, `slug`, `scanned_at` | ✅ | indexed on `slug` and `scanned_at desc` |
| `country`, `device`, `os`, `browser`, `referer`, `is_unique` | ✅ | |
| `city` | ❌ | always null, shown as "Unknown" |
| `ip_hash` | ❌ | never written |

`failed_password` attempts are inserted here too. The table has no `status` column, so they look like normal scans in "recent".

Retention: the daily cron deletes events older than 400 days. Aggregates in `qr_stats` are kept.

### `subscriptions`, orders and payments

| Column | Notes |
|---|---|
| `id` uuid, `uid` → profiles | |
| `plan` | `pro` or `team` |
| `interval` | `monthly` or `annual` |
| `order_id` | `ORDER_{uid}_{ms}`, indexed. One order can have several rows: the first payment plus renewals. |
| `amount` (text), `currency` | for example `2290.00` and `LKR`. These are checked against the provider's notify. |
| `provider` | `payhere` (Polar arrives in Phase 1) |
| `payment_id` | the provider's payment id. **Unique per provider**, which makes notify idempotent. |
| `status` | `pending` (written at checkout), `active`, `failed`, `cancelled` (recurring stopped; plan kept until expiry) or `chargeback` |
| `expires_at`, `created_at`, `updated_at` | |

`POST /api/billing/checkout` writes the pending row. `applyPayment()` claims it, or inserts a renewal row. Invoices show every row except `pending` and `failed`.

### `addon_purchases`

`id, uid, addon_id, order_id, amount, created_at`. **Unused.** The add-on checkout and its webhook branch were removed in Phase 0.

## Database functions (migration 003)

| Function | Purpose | Who may call |
|---|---|---|
| `record_scan(slug, owner, country, device, browser, os, referer, is_unique, failed)` | One scan in one transaction: the event plus every counter, and `first_scan` | `service_role` only (revoked from `anon` and `authenticated`) |
| `jsonb_inc(j, k)` | `{k: n}` → `{k: n+1}` | `service_role` only |

## Row-level security

RLS is enabled on every table. The API uses the service-role key, which **bypasses** RLS. Browsers hold only the public anon key.

| Table | Policies (after 001_phase0.sql) | Effect |
|---|---|---|
| `profiles` | select where `auth.uid() = id` | Users can read their own row and cannot write it. All writes go through the API. |
| `qr_codes`, `qr_stats`, `scan_events`, `subscriptions`, `addon_purchases` | none | Deny-all for anon and authenticated users |

Before Phase 0 the "Service role full access … using (true)" policies (with no `to service_role`) let **anyone** with the anon key read and write these tables, and the profile update policy let users set their own plan. The QA run on 2026-10-10 proved both: a QR title was overwritten through the anon key, and a user set `plan='team'`. QA section 20 now checks that both are blocked.

## Workers KV (`QR_CACHE`)

See [doc 03](03-scan-flow-and-gate-engine.md#5-counters-written-to-kv-after-the-gates-pass). Keys: `{slug}`, `ratelimit:{slug}:{hash}`, `uniq:{slug}:{hash}`, `uniq:{slug}:{hash}:pw_ok`.

## Write-path summary

| Event | Writes |
|---|---|
| First login | `profiles` upsert |
| Create QR | `qr_codes` upsert, `qr_stats` upsert (empty maps) |
| Edit QR | `qr_codes` update, then a KV purge |
| Scan (success) | `scan_events` insert, `qr_stats` RMW upsert, `profiles.monthly_scans` RMW update, KV puts |
| Scan (wrong PIN) | `scan_events` insert |
| Scan limit hit | `qr_codes.is_active=false` (via PUT), KV delete |
| Checkout | `subscriptions` insert (`pending`) |
| Payment success | `subscriptions` claim or insert (`active`, unique `payment_id`), `profiles` update |
| Recurring stopped / chargeback | `subscriptions.status` `cancelled` / `chargeback`; a chargeback also sets `profiles.plan='free'` |
| Delete QR | delete `qr_codes`, `qr_stats`, then background `scan_events` |
| Delete account | the above for each QR, plus `profiles`, `subscriptions`, auth user |
