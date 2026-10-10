# 03 — Scan Flow and Gate Engine

A dynamic QR code encodes `${VITE_SHORT_DOMAIN}/<slug>`, which today is `https://scnr.tharkak.com/<slug>`. Everything below happens in [worker/worker.js](../worker/worker.js). The config, policy and analytics writes happen in [server.ts](../server.ts) (`/internal/slug`, `/internal/scan`, `captureAnalyticsFromPayload`).

A static QR code encodes its final content directly (URL, vCard text, a `WIFI:` string, `mailto:`). **Scanning one never reaches the platform.** We cannot gate it, count it or change it.

Every type can be dynamic. URL codes redirect; the others are rendered at the edge. See [Non-URL types](#non-url-types).

## Step by step

### 1. Routing

- `slug` = the first path segment.
- `/internal/purge/{slug}` with a valid `x-internal-secret` deletes KV `{slug}`. The API calls this through `purgeEdge(slug)` after every edit, deactivation and delete.
- These pass through to the origin (`fetch(request)`):
  - SPA routes: `'' create edit analytics settings billing login legal pricing api-docs`
  - anything containing `.`
  - anything starting with `api`, `internal`, `assets` or `_`
  - anything that does not match the slug alphabet `^[23456789a-km-zA-HJ-NP-Z…]{5,12}$` (no 0/1/i/l/o/I/O)

### 2. Visitor fingerprint

```
visitorHash = SHA-256( CF-Connecting-IP : UA[0..100] : YYYY-MM-DD : HASH_SALT )
```

It changes every UTC day. It is used only inside KV keys and never stored in Postgres.

### 3. Config lookup

1. `KV.get(slug, json)`.
2. On a miss, `GET {API_URL}/internal/slug/{slug}` with a 5 s timeout. Vercel routes `/internal/*` to Express; the rewrite was added in Phase 0.
   - 404 → branded "QR code not found" page (404).
   - Any other non-2xx, **or a network error**, → branded "Temporarily unavailable" page (503). The Worker never throws.
3. The Worker sets `config.scan_count = total_scans` and caches the config for 300 s.

Config shape, built by `/internal/slug` from the owner's **license** (`getLicense`):

```json
{
  "destination_url": "https://…",
  "is_active": true,
  "expiry_date": "2026-12-31T23:59" | null,
  "password_hash": "<sha256(password+slug)>" | null,
  "scan_limit": 100 | null,
  "total_scans": 42,
  "visitor_rate_limit": 5,          // already resolved: forced to 5 unless the plan has Visitor Guard; 0 = unlimited
  "visitor_rate_period": 3600,
  "visitor_guard": true,            // plan feature flag
  "quota_exceeded": false,          // account-wide monthly scans >= plan limit
  "paused": false,                  // lapse rule: grace over and this code is above the dynamic allowance
  "title": "Menu",                  // shown on the paused page (HTML-escaped)
  "owner_plan": "free|pro|team",    // effective plan (informational)
  "scan_count": 42                  // added by the Worker
}
```

### 4. Gates, in order

| # | Gate | Check | Result on trigger |
|---|---|---|---|
| 1 | Active | `!is_active` | 410 page "This QR code is inactive" |
| 1b | Paused | `paused` | 410 page with the code's title: "paused by its owner". The code is kept. |
| 2 | Expiry | `new Date(expiry_date) < now` | 410 page "has expired" |
| 3 | Monthly quota | `quota_exceeded` | 429 page "Monthly limit reached", with an upgrade link to `{origin}/pricing` |
| 4 | No destination | URL code with an empty `destination_url` | 404 page "Nothing to open yet" |
| 5 | Visitor Guard | KV `ratelimit:{slug}:{hash}` ≥ `visitor_rate_limit` (when > 0) | 429 page "Slow down!" |
| 6 | PIN | `password_hash` set and KV `…:pw_ok` missing | PIN form (200). After **5 wrong PINs in 15 min** for this visitor: 429 "Too many attempts". |
| 7 | Scan limit | `++scan_count > scan_limit` | 410 page "Scan limit reached". The Worker also PUTs `is_active:false` and deletes the KV key. |
| — | Result | | URL code: `302 Location: destination_url`. Other types: `renderGuestPage()` (below). |

Every non-redirect outcome uses one `page()` helper, so the scanner always sees a branded HTML page and never a bare error.

**The PIN check.** The server stores `sha256(password + slug)`. The Worker hashes the POSTed `password + slug` the same way. A match sets `pw_ok` for 24 h. A miss increments `pwfail:{slug}:{hash}` (TTL 15 min) and logs a `failed_password` scan event.

### 5. KV keys

| Key | Value | TTL | Purpose |
|---|---|---|---|
| `{slug}` | config JSON with the incremented `scan_count` | 300 s | gate config and approximate scan counter |
| `ratelimit:{slug}:{hash}` | count | `visitor_rate_period` | Visitor Guard |
| `uniq:{slug}:{hash}` | `"1"` | until end of day (min 60 s) | daily-unique flag |
| `uniq:{slug}:{hash}:pw_ok` | `"1"` | 86,400 s | PIN unlocked |
| `pwfail:{slug}:{hash}` | count | 900 s | PIN brute-force lockout |

### 6. Analytics, off the critical path

After the gates pass, the Worker sends `POST {API_URL}/internal/scan` with `ctx.waitUntil`. The redirect **does not wait** for it.

```json
{ "slug", "ip", "ua", "referer", "lang", "country": cf.country,
  "asn", "colo", "tls", "is_eu", "is_unique", "status": "success" }
```

`/internal/scan` checks the secret, looks up the code's owner, and records the scan. It no longer enforces the quota; gate 3 does that from the cached config.

Recording is **one call**: `supabase.rpc('record_scan', …)` (migration 003). The function runs in one transaction and:

1. inserts the `scan_events` row
2. stops for `failed_password` attempts (logged, not counted)
3. increments `qr_stats`: `total_scans`, `unique_scans`, and the maps `days`, `days_unique`, `hours` (UTC), `countries`, `browsers`, `os`, `devices` and `monthly_scans`
4. increments `profiles.monthly_scans[YYYY-MM]`, the account-wide counter behind `quota_exceeded`
5. writes a `first_scan` event the first time a code is scanned

Bots are dropped before the call (a regex on the UA). Until migration 003 is applied, the server falls back to a non-atomic read-modify-write (`recordScanLegacy`, marked `ponytail:`). QA section 26 shows the difference: 10 concurrent scans give exactly 10 with the RPC, and fewer with the fallback.

## Sequence

```
Scanner          Worker                 KV            Vercel/Express          Supabase
  │ GET /Ab3xYz9    │                     │                 │                     │
  │────────────────▶│ get(slug) ─────────▶│                 │                     │
  │                 │◀──── miss ──────────│                 │                     │
  │                 │ GET /internal/slug ──────────────────▶│ qr_codes, qr_stats, │
  │                 │                     │                 │ profiles (license) ▶│
  │                 │◀──────── config (+quota_exceeded) ────│                     │
  │                 │ put(slug, 300s) ───▶│                 │                     │
  │                 │ gates… ratelimit/uniq/pw_ok/pwfail ──▶│                     │
  │◀── 302 dest ────│                     │                 │                     │
  │                 │ waitUntil: POST /internal/scan ──────▶│ insert event, RMW ─▶│
```

## Local dev redirect (no Worker)

`GET /:slug` in [server.ts](../server.ts) (`// Redirect Engine`) renders every type when you run `npm run dev`:

- vCard: a `.vcf` built by `vcardText()` from [src/lib/qrContent.ts](../src/lib/qrContent.ts)
- text and wifi: HTML pages
- email: `mailto:`
- url: 302

It checks only `is_active` and records analytics. On Vercel this route never runs, because the SPA rewrite catches `/{slug}`.

## Testing the Worker

[qa.ts](../qa.ts) section **15b** imports `worker.js` and runs it in Node against the local API, with an in-memory KV. No Wrangler or Cloudflare account is needed. It covers:

- a redirect on a cache miss, then on a cache hit
- the 404 and 503 pages
- expiry
- Visitor Guard
- the scan limit and the deactivation it triggers
- PIN lockout
- the monthly quota page
- a legacy row with no destination

## Non-URL types

After the gates pass, the Worker calls `renderGuestPage(config, lang, url)` from [src/lib/guestPage.ts](../src/lib/guestPage.ts). This is a pure function, and the dev server uses the same one.

| `qr_type` | Scanner sees |
|---|---|
| `page` | Hosted guest page: name, subtitle, today's offer, link buttons, Wi-Fi box with copy, EN/සිං/தமி switch, brand colour. Free owners get a "Made with Scnr" footer (`config.branding`). |
| `vcard` | `.vcf` download (`text/vcard`) |
| `text` | HTML page with the text (escaped) |
| `email` | `302` to `mailto:` |
| `wifi` | Page with the network and a copyable password (a *static* Wi-Fi code joins directly, so the kit prints a static one next to the guest page) |

- **Language** comes from `?lang=en|si|ta`, then `Accept-Language`, then English. Sinhala and Tamil text uses Noto Sans from Google Fonts. **A language switch (`?lang=` on a non-URL code) is not counted as a scan** and does not touch the scan or visitor counters.
- **Safety.** All text is HTML-escaped. Link URLs must start with `http(s)://`, `tel:` or `mailto:`; anything else (`javascript:`, `data:`) is dropped.
- **Size.** `content_data` is capped at 20 KB by the API and travels inside the cached config.

## Known limits

- **Approximate scan limit.** `scan_count` lives in a per-edge KV copy, rewritten on every scan and reset from the DB every 5 minutes. A burst across regions can go past the limit (marked `ponytail:` in the code).
- **Quota lag.** The quota decision comes from a config cached for up to 300 s, so an owner can go over by up to 5 minutes of traffic. That is the price of not waiting on the analytics write.
- **KV write volume.** A successful scan does 1–3 `put`s. The free tier allows 1,000 writes a day, and KV allows 1 write per second per key, so a very busy code will hit KV limits.
- **Bots are counted at the edge.** The server drops bots from analytics, but the Worker has already incremented `scan_count` and the visitor counters.
- **Lapse rule.** When a trial or plan ends, every code keeps working for `GRACE_DAYS` (30). After that, `/internal/slug` counts the owner's *older* active dynamic codes; when that count is at or above `limits.dynamic_qr_codes`, the code is `paused`. The oldest codes stay live up to the allowance (Free keeps 1). Upgrading un-pauses on the next config refresh (≤ 5 min, or immediately after an edit).
- **Expiry time zone.** `datetime-local` has no zone, so the Worker compares it as UTC.
