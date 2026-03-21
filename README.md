<div align="center">

<br />

```
███╗   ███╗██╗      ██████╗ ██████╗
████╗ ████║██║     ██╔═══██╗██╔══██╗
██╔████╔██║██║     ██║   ██║██████╔╝
██║╚██╔╝██║██║     ██║▄▄ ██║██╔══██╗
██║ ╚═╝ ██║███████╗╚██████╔╝██║  ██║
╚═╝     ╚═╝╚══════╝ ╚══▀▀═╝ ╚═╝  ╚═╝

Multi-Layered Quick Response Code
```

**The QR platform with intelligence built in — multi-layer gate controls, global edge routing, and real-time analytics in one system.**

<br />

![Status](https://img.shields.io/badge/status-active-brightgreen?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)
![Platform](https://img.shields.io/badge/platform-web-lightgrey?style=flat-square)
![Edge](https://img.shields.io/badge/edge-Cloudflare_Workers-orange?style=flat-square)
![Auth](https://img.shields.io/badge/auth-Firebase-yellow?style=flat-square)
![DB](https://img.shields.io/badge/database-Firestore-blue?style=flat-square)
![Hosting](https://img.shields.io/badge/hosting-Cloud_Run-4285F4?style=flat-square)
![Payments](https://img.shields.io/badge/payments-PayHere-red?style=flat-square)

<br />

> **Multi-layered** because every QR code is more than a link. It is a programmable gate with expiry rules, scan limits, password protection, smart device routing, and a full analytics layer — all enforced at the network edge before the user ever reaches their destination.

<br />

</div>

---

## What is MLQR?

MLQR is a production-grade **dynamic QR code platform** where every scan passes through a configurable stack of layers — active status, expiry date, scan limit, password verification, device routing — before the user is redirected. Each layer is evaluated in under 50ms on a Cloudflare edge server nearest to the scanner, with no database roundtrip on the critical path.

Businesses get a dashboard to create and manage QR codes, inspect real-time analytics, set gate rules, and manage their subscription. Developers on the Team plan get a REST API and webhook system to integrate MLQR into their own workflows.

MLQR is built to compete directly with platforms like Flowcode, QR TIGER, and Beaconstac — at a fraction of the infrastructure cost, with full ownership of the codebase.

---

## Why "multi-layered"?

A conventional QR code encodes a URL. That is a single layer: scan → destination.

MLQR treats every scan as a request that passes through a programmable middleware stack:

```
Scan
 │
 ├── Layer 1 · Active check      Is this QR enabled?
 ├── Layer 2 · Expiry check      Has the expiry date passed?
 ├── Layer 3 · Scan limit check  Has the allowed scan count been reached?
 ├── Layer 4 · Password check    Is a PIN required and has it been entered?
 ├── Layer 5 · Device routing    Should iOS and Android go to different URLs?
 ├── Layer 6 · Analytics         Capture scan metadata without blocking the user
 └── Layer 7 · Redirect          Send the user to their destination
```

Each layer is optional. A basic URL QR skips layers 2–5. A ticketing QR for an event might use all seven.

---

## Feature overview

### QR code creation
- Six content types: URL, vCard contact card, WiFi credentials, plain text, email, and SMS
- Live canvas preview that regenerates instantly as content or style changes
- Custom foreground and background colours with preset swatches and a full colour picker
- Five dot styles: square, dots, rounded, diamond, star
- Three corner styles: square, rounded, extra-rounded
- Center logo upload with drag-and-drop — error correction automatically set to H when a logo is present
- Download as PNG, SVG, or print-ready PDF at 400px, 800px, or 1200px
- Static or dynamic mode selected per QR code
- UTM campaign tag appended automatically to destination URLs

### Multi-layer gate controls
All gate logic runs inside the Cloudflare Worker at the network edge — no server roundtrip, no database query on the redirect path.

| Layer | What it does | Behaviour on trigger |
|---|---|---|
| Active toggle | Enable or disable a QR instantly | Returns 410 Gone |
| Expiry date | Deactivate at a chosen date and time | Returns 410 Gone, async deactivation written back |
| Scan limit | Deactivate after N total scans | Returns 410 Gone, near-limit uses authoritative count |
| Password / PIN | Require a code before redirecting | Serves a PIN entry page from the Worker itself |

### Smart device routing
- One printed QR code, two destinations — iOS users and Android users can be sent to different URLs
- App Store routing — send iOS to the App Store and Android to Google Play automatically, detected from User-Agent at the edge

### Real-time analytics
- Total scans and unique visitors with week-over-week velocity tracking
- 30-day time-series chart with automatic gap filling for zero-scan days
- Device breakdown: mobile, desktop, tablet with percentage split
- Country-level geolocation from Cloudflare's free edge metadata — no GeoIP subscription required
- Browser and OS breakdown
- 24-hour peak activity heatmap in UTC
- Per-QR performance table across all codes
- Live scan feed on the dashboard showing country flag, device type, and QR name as scans arrive
- Privacy-first: visitor identity is a salted SHA-256 daily fingerprint — raw IP addresses are never stored anywhere

### Dashboard
- Live scan counter updating in real time
- Manage, edit, copy, and deactivate all QR codes from a single view
- Scanability checker on every preview: contrast, error correction level, content validity
- Per-QR analytics accessible from the QR list with one click

### Billing
- Free, Pro ($7/month), and Team ($29/month) tiers
- Payments processed via PayHere — optimised for South Asian markets
- Full invoice history with per-invoice PDF download
- Plan comparison table and one-click upgrade

### REST API (Team plan)
- Full documented API built into the dashboard under API Docs
- Endpoints covering QR code CRUD, analytics summary, time-series data, geo breakdown, and device split
- Webhook delivery for scan events, QR lifecycle events, and scan milestones
- HMAC-SHA256 webhook signature on every delivery
- Per-account API key management with read or read-write scope

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        User scans QR code                         │
└──────────────────────────────┬───────────────────────────────────┘
                               │  HTTP GET  mlqr.app/{slug}
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                    Cloudflare Worker  (edge)                      │
│                                                                   │
│   Layer 1 · Validate slug format                                  │
│   Layer 2 · Read config from KV  ──KV miss──▶  Firestore fetch   │
│   Layer 3 · Gate stack                                            │
│             • inactive     →  410 page                           │
│             • expired      →  410 page  +  async deactivate      │
│             • limit hit    →  410 page  +  async deactivate      │
│             • password set →  PIN page  (Worker-served HTML)     │
│   Layer 4 · Smart device routing  (iOS / Android URL swap)        │
│   Layer 5 · ctx.waitUntil → analytics POST  (non-blocking)        │
│   Layer 6 · ctx.waitUntil → KV scan counter increment             │
│   Layer 7 · 302 redirect  →  destination                          │
└──────────────────────────────┬───────────────────────────────────┘
                               │
             ┌─────────────────┼──────────────────┐
             ▼                 ▼                  ▼
      Destination URL    Cloud Run API      Cloudflare KV
      (user arrives)    (analytics write)  (config + counters)
                              │
                              ▼
                          Firestore
                    (scan events · users
                     QR docs · stats)
```

### Why this topology

| Concern | Solution | Why |
|---|---|---|
| Redirect latency | Cloudflare Workers | 300+ edge locations, ~10ms globally |
| Gate logic | Cloudflare KV | Config read in ~1ms at the edge |
| Analytics writes | Cloud Run — async | Never on the redirect critical path |
| Persistent storage | Firestore | Pre-aggregated stats, low read cost |
| Auth | Firebase Auth + JWT | Stateless, verified in middleware |
| Frontend | Firebase Hosting | CDN-backed SPA with zero config |
| Payments | PayHere webhooks | Async plan upgrade on payment confirmation |

---

## Tech stack

| Layer | Technology |
|---|---|
| Edge redirect + gate middleware | Cloudflare Workers |
| Edge key-value store | Cloudflare Workers KV |
| Dashboard API | Node.js on Google Cloud Run |
| Database | Firebase Firestore |
| Authentication | Firebase Auth |
| Frontend hosting | Firebase Hosting |
| Frontend framework | React |
| UI design tooling | Stitch |
| Payments | PayHere |
| QR image generation | Server-side canvas rendering |

---

## Project structure

```
mlqr/
├── worker/                   Cloudflare Worker — all gate + redirect logic
├── api/                      Cloud Run API — dashboard endpoints + analytics
├── frontend/                 React SPA — full dashboard UI
│   ├── pages/
│   │   ├── Dashboard/        Live stats, scan feed, QR table
│   │   ├── Analytics/        Charts, heatmap, geo, device breakdown
│   │   ├── CreateQR/         Builder, style studio, gate options
│   │   ├── Billing/          Plan management, invoices, PayHere integration
│   │   ├── Profile/          Account settings, security, notifications
│   │   └── ApiDocs/          Inline REST API documentation
│   └── components/
├── firebase/
│   ├── firestore.rules       Database security rules
│   └── hosting/              Firebase hosting config and SPA rewrites
└── docs/
    ├── data-flow.svg         Full scan journey architecture diagram
    └── gate-logic.svg        Gate stack decision diagram
```

---

## Data model

### Firestore collections

**`qr_codes/{slug}`** — one document per QR code, scoped to an owning user.

Stores: destination URL, content type, all gate settings (expiry, scan limit, hashed password), style configuration, dynamic/static flag, smart routing URLs, and the generated SVG string. The slug is the document ID and is immutable after creation — printed QR codes must always resolve.

**`qr_stats/{slug}`** — one aggregated stats document per QR code.

Updated atomically on every scan using atomic field increments. Stores: total scans, unique scans, device counters, per-country map, per-day map, per-hour map, browser map, and OS map. The dashboard reads exclusively from this document — no aggregation queries over raw events are ever needed.

**`users/{uid}`** — one document per authenticated user.

Stores: plan tier, plan expiry timestamp, PayHere customer reference, and account metadata.

### Cloudflare KV key patterns

**`qr_config:{slug}`** — compact JSON gate config for a QR code. Written on create or update by the Cloud Run API. Read on every scan by the Worker. TTL of 300 seconds ensures stale config is never served beyond 5 minutes of a change.

**`pw_ok:{slug}:{visitor_hash}`** — session marker written when a visitor correctly enters a PIN. TTL of 24 hours. Prevents re-prompting the same visitor on subsequent scans within the same day.

---

## Gate stack decision flow

```
Scan arrives at mlqr.app/{slug}
        │
        ▼
  is_active = false? ──yes──▶  410 Gone
        │ no
        ▼
  expires_at < now?  ──yes──▶  410 Gone  +  deactivate (async)
        │ no
        ▼
  scan_count ≥ limit?──yes──▶  410 Gone  +  deactivate (async)
        │ no                         ↑
        │              (near limit: authoritative Firestore check)
        ▼
  password set?      ──yes──▶  Serve PIN page (Worker HTML)
        │ no                         │
        │                    PIN correct? ──no──▶  PIN page + error
        │                            │ yes
        ◀───────────────────────────◀┘
        │
        ▼
  Smart routing:
    iOS URL set + iOS device?    →  ios_url
    Android URL set + Android?   →  android_url
    Otherwise                    →  destination_url
        │
        ▼
  302 Redirect  (user is gone at this point)
        │
        ├── ctx.waitUntil →  analytics POST to Cloud Run
        └── ctx.waitUntil →  scan_count increment in KV
```

---

## Analytics data captured per scan

Everything is derived from the HTTP request and Cloudflare's free edge metadata. No third-party lookup service is required.

| Field | Source | Privacy |
|---|---|---|
| Country (ISO 3166-1 alpha-2) | `request.cf.country` | Non-personal |
| Timestamp (UTC) | Worker server time | Non-personal |
| Device type | User-Agent parsing | Non-personal |
| Operating system | User-Agent parsing | Non-personal |
| Browser | User-Agent parsing | Non-personal |
| Unique visitor flag | Daily KV fingerprint | Hashed, non-reversible |
| Bot flag | User-Agent regex match | Silently dropped, not counted |
| Referer type | Referer header | Non-personal |
| Visitor hash | SHA-256(IP + UA + date + salt) | Salt prevents reversal |

Raw IP addresses are never written to any persistent store.

---

## Security model

**API authentication** — every Cloud Run endpoint behind `/api/*` verifies a Firebase JWT before any logic runs. Expired or malformed tokens return 401 immediately.

**Ownership enforcement** — every read and write operation checks the requesting user's UID against the resource owner field. A user cannot read, update, or delete another user's QR code or analytics data.

**Internal route protection** — the Worker-to-API route is protected by a 32-character random secret injected as a Cloudflare Worker secret. It is never committed to source and never exposed in responses.

**Firestore security rules** — rules enforce user-scoped access at the database layer, independent of the API. Even if the API layer were bypassed, direct Firestore access is blocked for cross-user operations.

**Webhook verification** — PayHere webhooks are verified using HMAC-MD5 signature before any plan state change is applied. Invalid signatures return 400 and are logged.

**Visitor fingerprint privacy** — the salt used in visitor hash derivation is the internal Worker secret. Fingerprints computed by different systems cannot be correlated, and an external party with access to raw scan event data cannot reverse a fingerprint to an IP address.

---

## Scalability characteristics

| Metric | Capacity | Limiting factor |
|---|---|---|
| QR redirects | Effectively unlimited | Cloudflare Workers global autoscale |
| KV config reads | ~1ms per scan | Cloudflare edge-local storage |
| Analytics writes | Cloud Run 0 → 1000 instances | Firestore write throughput |
| Dashboard load time | Sub-100ms | Pre-aggregated `qr_stats` documents |
| Scan counter accuracy | ±5 near limit boundaries | KV eventual consistency |
| Gate decisions | ~5ms total | KV read + Worker CPU |

The only location where KV eventual consistency matters is near a scan limit. Within 10 scans of the configured maximum, the Worker makes a synchronous authoritative count check via Cloud Run before allowing the scan through.

---

## Pricing tiers

| Plan | Monthly price | QR codes | Analytics history | API access |
|---|---|---|---|---|
| Free | $0 — forever | 3 static | Not available | No |
| Pro | $7 | Unlimited dynamic | 90 days | No |
| Team | $29 | Unlimited dynamic | 365 days | Full REST + webhooks |

Static QR codes on the Free plan never expire and never require an active subscription to redirect. Dynamic QR codes require an active Pro or Team plan — they return 410 if the subscription lapses.

---

## Deployment overview

MLQR consists of four independently deployable components. They can be deployed in any order, though the Worker requires the Cloud Run API URL to be configured before scans will resolve.

### Prerequisites

- Node.js 20 or later
- Cloudflare account — free plan is sufficient to start
- Firebase project on the Blaze (pay-as-you-go) plan
- Google Cloud project with Cloud Run and Artifact Registry enabled
- PayHere merchant account — optional, required only for live billing

### Deployment sequence

**Step 1 — Firebase**
Create the project, enable Firestore in production mode, enable Firebase Auth with the email/password provider, deploy Firestore security rules, build the React frontend, and deploy to Firebase Hosting.

**Step 2 — Cloud Run**
Build the API container image, push to Google Artifact Registry, deploy the Cloud Run service with all required environment variables set as secrets, and note the service URL.

**Step 3 — Cloudflare Worker**
Create the Worker, create and bind a KV namespace, set `INTERNAL_SECRET` and `API_URL` as Worker secrets (never as plain-text variables), and deploy.

**Step 4 — Connect**
Add the Worker domain to Firebase Auth's list of authorised domains so tokens issued from that origin are accepted by the API.

Each component has a `.env.example` documenting every required variable. No values are committed to source.

---

## Environment configuration

All sensitive configuration is injected at runtime. Required variables span Firebase project credentials, Cloud Run service URL, Cloudflare account and KV namespace identifiers, the internal Worker-to-API secret, and PayHere merchant credentials. Refer to the `.env.example` in each sub-directory for the complete list of required keys and their expected formats.

---

## Production readiness checklist

- [x] JWT verified on every protected API route
- [x] User ownership enforced on every resource read and write
- [x] Firestore security rules deployed and locked
- [x] Raw IP addresses never written to persistent storage
- [x] PayHere webhook signature verified before plan state changes
- [x] Cloudflare Worker secrets used — no sensitive values in `wrangler.toml`
- [x] Bot scans filtered before analytics counters are incremented
- [x] Analytics fully async — never blocks the 302 redirect
- [x] KV cache invalidated immediately on QR update and deactivation
- [x] 302 used for all redirects (not 301 — prevents destination being cached in browser)
- [x] Graceful error handling — Worker never crashes on bad KV read or API timeout
- [x] Scan limit near-boundary authoritative Firestore check
- [ ] Automated test suite — in progress
- [ ] Per-route rate limiting on API — roadmap
- [ ] Worker error rate alerting — roadmap

---

## Roadmap

- [ ] Bulk QR creation from CSV upload
- [ ] Custom short domain support per account (white-label)
- [ ] A/B destination testing — split traffic across two URLs from one QR
- [ ] City-level geolocation via MaxMind GeoLite2 (Pro+ feature)
- [ ] Google Analytics 4 event forwarding on each scan
- [ ] Zapier and Make.com native integrations
- [ ] QR code template marketplace — community-contributed styles
- [ ] Mobile companion app for scan history and QR management
- [ ] Rate limiting on all dashboard API routes

---

## Contributing

Pull requests are welcome. Please open an issue first for any significant change so direction can be discussed before implementation begins. Describe what changed and why in every PR. Contributions toward the automated test suite are especially welcome — it is the most significant known gap before a formal v1.0 release.

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

<div align="center">

**MLQR — Multi-Layered Quick Response Code**

Built on Cloudflare Workers · Firebase · Google Cloud Run · React

*Every scan. Every layer. Every insight.*

</div>