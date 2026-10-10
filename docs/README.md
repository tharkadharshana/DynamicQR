# Scnr (DynamicQR) — Technical Documentation

This folder documents the whole application end to end: what it does, how every part works, and what the full code review on 2026-10-10 found.

The repository is called **DynamicQR**. The product ships as **Scnr** (`scnr.tharkak.com`). Older names still appear in the code: qik.app, MLQR, dynamicqr.app and scnr.app. Doc 01 has the full list.

> **Important:** the root [README.md](../README.md) is out of date. It describes a Firebase / Firestore / Cloud Run stack, plus features that were never built (device routing, SMS QR, UTM tags, REST API keys, webhooks). These docs describe the code as it actually is.

## Reading order

| # | Document | Read it when you need to… |
|---|---|---|
| 01 | [Product overview](01-product-overview.md) | understand what the product is, who it is for, and what it does |
| 02 | [System architecture](02-architecture.md) | see how the components fit together and how requests travel |
| 03 | [Scan flow and gate engine](03-scan-flow-and-gate-engine.md) | understand what happens when someone scans a QR code |
| 04 | [Backend API reference](04-backend-api-reference.md) | call or change an Express route |
| 05 | [Data model](05-data-model.md) | read or write the database, or change the schema |
| 06 | [Frontend](06-frontend.md) | work on the React dashboard |
| 07 | [Plans, billing and PayHere](07-plans-billing-payhere.md) | change pricing, limits, trials or payment handling |
| 08 | [Analytics](08-analytics.md) | understand what each number on screen means and where it comes from |
| 09 | [Security model](09-security.md) | review auth, secrets, RLS and the attack surface |
| 10 | [Operations](10-operations.md) | run it locally, deploy it, set environment variables, run QA |
| 11 | [Review findings and roadmap](11-review-findings.md) | see the ranked list of bugs, gaps and recommended fixes |

## One-paragraph summary

Scnr is a SaaS that creates static and dynamic QR codes. A **dynamic** QR code encodes `https://<app-domain>/<slug>`. A **Cloudflare Worker** sits in front of that domain. It reads the code's config from Workers KV and runs a chain of gates (active, expiry, visitor rate limit, PIN, scan limit, monthly quota). Then it sends the visitor to the destination with a 302 redirect. Each scan is reported to an **Express API** that runs as a Vercel serverless function. The API stores raw scan events and pre-aggregated counters in **Supabase Postgres**. A **React 19 SPA** (Vite, React Router 7, Recharts) is the dashboard. Users create and style codes, set gates, view analytics and pay through **PayHere** (Free / Pro $7 / Team $29). Users sign in with Google through Supabase Auth.

## Status at a glance

Phases 0 (safe and working), 1 (credible) and 2 (Restaurant Kit) are merged. The change log is in [CHANGELOG.md](CHANGELOG.md).

- **Redirects fixed.** `vercel.json` now routes `/internal/*` to Express, so the Worker's origin lookup works ([doc 11, C1](11-review-findings.md#c1)). The Worker never crashes: origin failures show a branded 503 page.
- **RLS closed** by [migrations/001_phase0.sql](../migrations/001_phase0.sql). It must be run in the Supabase SQL editor; QA section 20 fails until it has been.
- **Billing is correct.** Server-side orders, amount and currency checks, idempotent payments, interval-aware expiry, LKR pricing ([doc 07](07-plans-billing-payhere.md)).
- **Credible (Phase 1):** honest Landing, SaaS legal pages, capped plans (Pro 100 / Team 600 codes), a free dynamic pilot, the 30-day grace then pause rule, LKR/USD with Polar for cards, print-ready downloads.
- **Restaurant Kit (Phase 2):** one table code opens a hosted guest page (menu, reviews, WhatsApp, Wi-Fi, today's offer) in English, Sinhala and Tamil, plus an A6 print view. "Swap today's offer" from the dashboard, the WhatsApp code type, dynamic vCard/Text/Email/Wi-Fi, and activation events (migration 002).
- The phase plan is in [doc 11](11-review-findings.md#recommended-order-of-work).

## Source map

```
server.ts               Express API: every route, the Firestore-compat DB shim, analytics capture (2,438 lines)
api/index.ts            Vercel entry point: re-exports the Express app
worker/worker.js        Cloudflare Worker: edge redirect and gate engine
worker/wrangler.toml    Worker config and KV binding (QR_CACHE)
supabase_schema.sql     Postgres schema and RLS policies (6 tables)
logger.ts               Winston logger (JSON in prod, pretty output plus log files in dev)
qa.ts                   End-to-end API QA suite (run by GitHub Actions)
src/                    React SPA
  App.tsx               Router and auth gate
  supabase.ts           Browser Supabase client, Google OAuth
  lib/api.ts            apiFetch() with JWT injection
  lib/plans.ts          Plan limits, trial limits, add-ons (shared with server)
  pages/                Dashboard, CreateQR, Analytics, AccountAnalytics, Billing, Pricing, Settings, ApiDocs, Landing, legal
  components/           DynamicQRLayout (app shell), QRViewerModal, modals, toasts, ErrorBoundary
  lib/qrContent.ts      getQRContent()/vcardText() and SHORT_DOMAIN: what every QR encodes (shared with server)
migrations/             Incremental SQL, run in order in the Supabase SQL editor (001_phase0.sql, …)
vercel.json             Static build plus Node function; rewrites /api/* and /internal/* to the function
.github/workflows/      api-qa.yml: typecheck, boot the server, run qa.ts (API + in-process Worker) on push and PR
```

These docs are committed with the code. The private business files (`docs/SCNR*`, the competitor research and the plan exports) stay git-ignored.
