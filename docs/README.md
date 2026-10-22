# Scnr — Technical Documentation

This folder documents the whole application end to end: what it does, how every part works, and what the full code review on 2026-10-10 found.

The repository is called **Scnr** (renamed from DynamicQR in 2026-10). The product ships as **Scnr** (`scnr.tharkak.com`). Older names still appear in the code: qik.app, MLQR, dynamicqr.app and scnr.app. Doc 01 has the full list.

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

Scnr is a SaaS that creates static and dynamic QR codes. A **dynamic** QR code encodes `https://<app-domain>/<slug>`. A **Cloudflare Worker** sits in front of that domain. It reads the code's config from Workers KV and runs a chain of gates (active, expiry, visitor rate limit, PIN, scan limit, monthly quota). Then it sends the visitor to the destination with a 302 redirect. Each scan is reported to an **Express API** that runs as a Vercel serverless function. The API stores raw scan events and pre-aggregated counters in **Supabase Postgres**. A **React 19 SPA** (Vite, React Router 7, Recharts) is the dashboard. Users create and style codes, set gates, view analytics and pay through **PayHere** or Polar (Free / Pro $7 / Team $29 / Business $79). Users sign in with Google through Supabase Auth.

## Status at a glance

All five phases are merged: safe and working, credible, Restaurant Kit, retention, and the Team plan. The change log is in [CHANGELOG.md](CHANGELOG.md).

- **Redirects fixed.** `vercel.json` now routes `/internal/*` to Express, so the Worker's origin lookup works ([doc 11, C1](11-review-findings.md#c1)). The Worker never crashes: origin failures show a branded 503 page.
- **RLS closed** by [db/migrations/001_phase0.sql](../db/migrations/001_phase0.sql). It must be run in the Supabase SQL editor; QA section 20 fails until it has been.
- **Billing is correct.** Server-side orders, amount and currency checks, idempotent payments, interval-aware expiry, LKR pricing ([doc 07](07-plans-billing-payhere.md)).
- **Credible (Phase 1):** honest Landing, SaaS legal pages, capped plans (Pro 100 / Team 600 codes), a free dynamic pilot, the 30-day grace then pause rule, LKR/USD with Polar for cards, print-ready downloads.
- **Restaurant Kit (Phase 2):** one table code opens a hosted guest page (menu, reviews, WhatsApp, Wi-Fi, today's offer) in English, Sinhala and Tamil, plus an A6 print view. "Swap today's offer" from the dashboard, the WhatsApp code type, dynamic vCard/Text/Email/Wi-Fi, and activation events (migration 002).
- **Retention (Phase 3):** atomic scan recording (`record_scan`, migration 003), real per-day uniques, a busiest-hours chart, CSV export and a print report, a weekly email digest, and 400-day retention. The Firestore shim is gone (server/index.ts went from 2,457 to about 1,600 lines).
- **Team plan (Phase 4):** API keys and `/api/v1`, 5 seats (invite by email), client folders, bulk CSV creation with a print sheet, one custom short domain (Cloudflare for SaaS), and white-label report branding (migration 004).
- **Plans v2 (Phase 5):** a fourth tier, Business ($79 / LKR 25,990), and per-object caps for short links, pages and forms, generated pricing cards with an FAQ (they list shipped features only), Free history raised to 90 days ([doc 07](07-plans-billing-payhere.md)). Migration 005 adds `qr_codes.kind`.
- **Code types and design (Phase 6):** PDF, Google review, socials, phone, SMS, location, event, app-store and GS1 codes; dot styles, gradient, circle shape, frames and a saved brand style. Migration 006 adds `gtin`, `brand_style` and the `files` bucket.
- **Pages builder (Phase 7):** block-based pages with 12 templates, a live-preview editor and click analytics. Migration 007 adds `qr_stats.clicks` and `record_click`.
- **Short links and organisation (Phase 8):** short links with custom back-halves, folders, tags, sort and search, Select mode with bulk actions and a ZIP download, and UTM tags. Migration 008 adds `qr_codes.tags`.
- **Forms (Phase 9):** a form builder with validated, spam-controlled answers, email notifications and CSV export. Migration 009 adds `form_submissions`.
- **Tracking and smart routing (Phase 10):** cities, languages, referrers, opt-in GPS with a map, and routing rules by device, country, language and time. Migration 010 adds the tracking columns and the new `record_scan`.
- **Business tier (Phase 11):** signed webhooks, workspaces, several custom domains per account and a regrouped Settings menu. Migration 011 adds `webhooks`, `workspaces`, `qr_codes.workspace_id`/`domain` and `workspace_members.workspace_id`.
- **Public tools, help and What's new (Phase 12):** a QR scanner, UTM builder, Google review and WhatsApp link makers and a static QR generator at `/tools`, a help button, and a customer-facing change list. No migration.
- Run the migrations in order: 001 → 002 → 003 → 004 → 005 → 006 → 007 → 008 → 009 → 010 → 011 ([doc 10](10-operations.md#deployment)).
- The phase plan for phases 0–4 is in [doc 11](11-review-findings.md#recommended-order-of-work).
- **What is next:** [ROADMAP.md](ROADMAP.md) plans phases 5–12 (competitor parity with Hovercode and Bitly: a Business tier, more code types, a Pages builder with templates, short links and folders, forms, advanced tracking, webhooks and workspaces, public tools). It also holds the working agreement for every change. Competitor screenshots are in [competitors/](competitors/).

## Source map

```
api/index.ts              Vercel entry point: re-exports the Express app
server/                   Express API (see server/README.md)
  index.ts                every route, analytics views, crons, scan capture (direct supabase-js)
  logger.ts               Winston logger (JSON in prod, pretty output plus log files in dev)
src/                      React SPA (see src/README.md)
  App.tsx                 router and auth gate
  supabase.ts             browser Supabase client, Google OAuth
  pages/                  Landing, Dashboard, CreateQR, Pages, Forms, Analytics, Billing, Pricing, Settings, tools, legal
  components/             app shell, modals, toasts, switchers, footer hub
  lib/                    pure modules shared by the browser, the API and the Worker (plans, qrContent, guestPage,
                          routing, forms, webhooks, csv, digest, pageTemplates, changelog, site, api)
worker/                   Cloudflare Worker: edge redirect and gate engine (see worker/README.md)
db/                       SQL (see db/README.md)
  schema.sql              the full end-state schema, for a new project
  migrations/             incremental files, run in order in the Supabase SQL editor (001_phase0.sql, ...)
  queries.sql             saved analysis queries (activation funnel)
tests/qa.ts               end-to-end QA suite: API plus the in-process Worker (see tests/README.md)
scripts/                  CI guards: server import extensions, bundle size
docs/                     these docs, the roadmap, the changelog, competitor screenshots
vercel.json               static build plus Node function; rewrites /api/* and /internal/* to the function
.github/workflows/        api-qa.yml: typecheck, build, boot the server, run tests/qa.ts on push and PR
```

These docs are committed with the code. The private business files (`docs/SCNR*`, the competitor research and the plan exports) stay git-ignored.
