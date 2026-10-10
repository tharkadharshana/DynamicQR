# 08 — Analytics

## What is captured per scan

| Field | Source | Stored in |
|---|---|---|
| Timestamp | server `now()` (UTC) | `scan_events.scanned_at`, `qr_stats.days[YYYY-MM-DD]`, `monthly_scans[YYYY-MM]` |
| Country (ISO-2) | Cloudflare `request.cf.country` | `scan_events.country`, `qr_stats.countries` |
| Device / OS / Browser | regex on the User-Agent ([server.ts:2396](../server.ts#L2396)) | `scan_events`, `qr_stats.devices/os/browsers` |
| Referer | `Referer` header | `scan_events.referer` only |
| Daily unique flag | KV `uniq:{slug}:{visitorHash}` set until end of day | `scan_events.is_unique`, `qr_stats.unique_scans` |
| ASN, colo, TLS, EU flag, Accept-Language, IP, full UA | Worker payload | **discarded** |

Bots are not recorded. The regex is in `isBot()` ([server.ts:2433](../server.ts#L2433)). Note that it also drops link previews from WhatsApp and Telegram, which is intended.

Static QR codes produce **no analytics**. They never reach the platform.

## Definitions (what the numbers on screen mean)

| Metric | Exact meaning |
|---|---|
| **Total scans** | Successful, non-bot scans that passed every gate. Wrong-PIN attempts are excluded. |
| **Unique visitors** | The sum, over days, of distinct (IP + UA + UTC date) fingerprints per QR. One person scanning on 3 days counts 3 times. On the account view, the per-QR uniques are added together, so one person scanning 2 codes counts twice. |
| **Unique scans per day** (chart) | **Estimated**: `round(day_total × unique_scans / total_scans)`. Per-day uniques are not stored. |
| **Mobile %** | `devices.mobile / total_scans`. iPads count as mobile. |
| **First / last scan** | The smallest and largest key in `qr_stats.days`. Only the day, no time. |
| **Days active** (`/api/user/plan`) | Days since the earliest day key across all codes |
| **Monthly scans used** | `profiles.monthly_scans[current month]`. Falls back to the sum of `qr_stats.monthly_scans`. The same account-wide counter drives the Worker's quota gate (`quota_exceeded`). |

## Aggregation model

Each scan updates a single pre-aggregated `qr_stats` row with jsonb maps. The dashboard never queries `scan_events`, except for the "recent" lists.

Trade-offs:

- **Fast and cheap reads.** One row per QR.
- **Lost increments under concurrency.** The server reads the row, adds 1 and upserts the whole row. Two scans at the same time can both write N+1. A Postgres function (`update qr_stats set total_scans = total_scans + 1, days = jsonb_set(…)`) called through `supabase.rpc` would fix this in one round trip.
- **No breakdown slicing.** Countries, devices, browsers and OS are lifetime totals, so the date-range picker **filters only the time series**. Every other chart always shows all-time data. The UI does not say so.
- **The `days` map grows without limit**, by one key per active day.

## Endpoints

[Doc 04](04-backend-api-reference.md#analytics-one-qr-user-and-owner) lists every route. The per-QR and account families mirror each other. The account routes fetch the user's code list and then `qr_stats` in chunks of 30 (a Firestore leftover). That is 1 + ⌈n/30⌉ queries per chart, and the Dashboard fires about 5 such calls on load.

## Placeholder or broken analytics features

| Feature | Why it shows nothing |
|---|---|
| ~~Referrers and "advanced" panels~~ | Removed in Phase 1 (they were always empty). The referer of each scan is still shown in recent scans. |
| City | Never captured (`scan_events.city` is always null) |
| Peak-hours heatmap | Not built. It needs an `hours` map or an hourly query on `scan_events`. |
| ~~Fake "vs last month" deltas and "Live" labels~~ | Removed in Phase 1 |

## Making the numbers trustworthy (minimum changes)

1. Move the stats increment into one Postgres function (atomic, one call).
2. Store `days` as `{date: {t, u}}` so per-day uniques are real.
3. ~~Base the monthly quota on `profiles.monthly_scans` (account-wide)~~: done in Phase 0.
4. Either hide the referrer and advanced panels, or write the fields the Worker already sends (`asn`, `colo`, `lang`, hour of day).
5. Label the breakdown charts "all time", or compute them from `scan_events` for the selected range.
