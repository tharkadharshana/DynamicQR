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
| **Unique scans per day** (chart) | Real, from `days_unique`, for days recorded after migration 003. Older days are estimated as `round(day_total × unique_scans / total_scans)`. |
| **Busiest hours** | `qr_stats.hours`: scans per UTC hour, all time. The weekly digest converts it to the owner's time zone. |
| **Mobile %** | `devices.mobile / total_scans`. iPads count as mobile. |
| **First / last scan** | The smallest and largest key in `qr_stats.days`. Only the day, no time. |
| **Days active** (`/api/user/plan`) | Days since the earliest day key across all codes |
| **Monthly scans used** | `profiles.monthly_scans[current month]`. Falls back to the sum of `qr_stats.monthly_scans`. The same account-wide counter drives the Worker's quota gate (`quota_exceeded`). |

## Aggregation model

Each scan calls `record_scan()`, which increments one pre-aggregated `qr_stats` row atomically. The dashboard never queries `scan_events`, except for "recent" and the CSV export.

- **Fast, consistent reads.** One row per code, with no lost increments.
- **Breakdowns are all time.** Countries, devices, browsers, OS and hours are lifetime totals, so the date range filters only the time series. The UI labels them "all time".
- **Retention.** Raw events are deleted after 400 days by the daily cron; aggregates stay.

## Endpoints

See [doc 04](04-backend-api-reference.md#analytics). One set of views serves both a single code and the account (`loadScope()` plus a `views` map in server.ts), with a single `in` query for the stats rows.

## Placeholder or broken analytics features

| Feature | Why it shows nothing |
|---|---|
| ~~Referrers and "advanced" panels~~ | Removed in Phase 1 (they were always empty). The referer of each scan is still shown in recent scans. |
| City | Never captured (`scan_events.city` is always null) |
| Peak-hours heatmap | Not built. It needs an `hours` map or an hourly query on `scan_events`. |
| ~~Fake "vs last month" deltas and "Live" labels~~ | Removed in Phase 1 |

## Weekly digest

`buildDigest()` ([src/lib/digest.ts](../src/lib/digest.ts), with a self-check) takes the last 7 days of scans and produces the total, the busiest hour in the owner's time zone, the top code and a short tip. The Monday cron emails it through Resend. Owners opt out in Settings.
