# Scnr

Menu, review and offer QR codes for Sri Lankan businesses. Print once, change the destination any time, and see when people scan.

- **Dynamic QR codes** on a permanent short domain (`scnr.tharkak.com/<slug>`), edited without reprinting
- **Edge gates** (Cloudflare Worker): active, expiry, PIN with lockout, scan limit, per-visitor limit, monthly quota, pause after plan lapse
- **Scan statistics:** scans per day, unique visitors, country, device, OS, browser
- **Plans:** Free (3 codes, 1 dynamic), Pro and Team. Billed in LKR through PayHere or in USD by card (Polar).

## Stack

React 19 + Vite SPA · Express API on Vercel · Supabase (Postgres + Google sign-in) · Cloudflare Worker + KV for redirects · PayHere and Polar for billing.

## Run locally

```bash
npm install
cp .env.example .env     # fill in Supabase keys, INTERNAL_SECRET, HASH_SALT
npm run dev              # API + SPA on http://localhost:3000
npx tsx tests/qa.ts            # end-to-end QA (API + in-process Worker), against the running server
```

## Project structure

```
api/        Vercel entry point (re-exports the Express app)
server/     Express API: routes, billing, analytics, webhooks, crons
src/        React SPA; src/lib holds the pure code shared with the API and the Worker
worker/     Cloudflare Worker: edge redirect and gate engine
db/         schema.sql, migrations/ (run in order in Supabase), saved queries
tests/      end-to-end QA suite
scripts/    CI guards
docs/       documentation, roadmap, changelog
```

Each folder has its own README.

## Documentation

Everything else lives in [docs/](docs/README.md): architecture, the scan flow, the API reference, the data model, billing, security, operations, and the [changelog](docs/CHANGELOG.md).
