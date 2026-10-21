# 02 — System Architecture

## Components

| Component | Tech | Runs on | Code |
|---|---|---|---|
| Edge redirect and gate engine | Cloudflare Worker (JS) and Workers KV (`QR_CACHE`) | Cloudflare, as a route in front of the app domain | [worker/worker.js](../worker/worker.js) |
| API | Express 4 on Node, `tsx` | Vercel serverless function (`@vercel/node`) | [server/index.ts](../server/index.ts), [api/index.ts](../api/index.ts) |
| Dashboard SPA | React 19, Vite 6, React Router 7, Recharts, qr-code-styling, Tailwind 4 plus hand-written CSS | Vercel static build (`dist/`) | [src/](../src) |
| Database | Supabase Postgres (6 tables, jsonb counters) | Supabase | [db/schema.sql](../db/schema.sql) |
| Auth | Supabase Auth, Google OAuth provider | Supabase | [src/supabase.ts](../src/supabase.ts) |
| Payments | PayHere hosted checkout and server notify webhook | PayHere (LK) | `server/index.ts` billing routes |

## Topology

```
                         ┌───────────────────────────────────────┐
  Phone camera ─────────▶│  Cloudflare Worker (route on domain)  │
  GET /{slug}            │  • known SPA paths, /api, /assets,    │
                         │    files, /internal  → pass through   │
  Browser (dashboard) ──▶│  • /{slug} → gate engine              │
                         └──────┬──────────────┬─────────────────┘
                     pass-through│              │ KV get/put (config, counters)
                                ▼              ▼
             ┌──────────────────────────┐   ┌──────────────┐
             │  Vercel                  │   │ Workers KV   │
             │  • /assets, index.html   │   │ QR_CACHE     │
             │  • /api/* → Express fn   │   └──────────────┘
             │  • everything else → SPA │
             └──────────┬───────────────┘
                        │ supabase-js (service-role key)
                        ▼
             ┌──────────────────────────┐        ┌────────────┐
             │  Supabase                │◀───────│  Browser   │ supabase-js (anon key):
             │  Postgres + Auth         │        │  SPA       │ auth/session only
             └──────────────────────────┘        └────────────┘
                        ▲
                        │ POST /api/billing/notify (server-to-server)
                  ┌─────┴─────┐
                  │  PayHere  │◀── browser form POST to payhere.lk/pay/checkout
                  └───────────┘
```

The Worker also calls the API directly through its `API_URL` secret:

- `GET  {API_URL}/internal/slug/:slug`: config lookup on a KV miss
- `POST {API_URL}/internal/scan`: scan report, sent with `ctx.waitUntil` (the redirect never waits for it). The monthly quota comes from the config instead (`quota_exceeded`).
- `PUT  {API_URL}/api/qr/:slug`: deactivate the code once the scan limit is hit

The Worker authenticates with the `x-internal-secret` header.

> **Fixed in Phase 0.** `vercel.json` now rewrites `/internal/(.*)` to the function. Before that, Vercel answered `404 NOT_FOUND` to every Worker lookup on a KV miss, so dynamic codes could not resolve (a live probe on 2026-10-10 confirmed it). Smoke test after any deploy: `curl -s -o /dev/null -w "%{http_code}" https://scnr.tharkak.com/internal/slug/xxxxxxx` must return **401** (Express), not 404.

## Request flows

### 1. Sign in

1. The Landing page (shown at `/login`) calls `loginWithGoogle()`. That function runs `supabase.auth.signInWithOAuth({provider:'google', redirectTo: origin + '/'})`.
2. Google sends the browser back to Supabase, and Supabase sends it back to the SPA. supabase-js stores the session in localStorage.
3. `App.tsx` `onAuthStateChange` sets `user`, then calls `GET /api/user/plan`.
4. On the **first** call, `/api/user/plan` creates the `profiles` row with `is_trial=true` and `trial_expires_at = now + 14 days`.

### 2. Dashboard API call

`apiFetch(url)` → `supabase.auth.getSession()` → `Authorization: Bearer <access_token>`. Express `authenticate` then calls `supabase.auth.getUser(token)`. That is one network round-trip to Supabase Auth on **every** API request, and `req.user.uid` is set from the result. Ownership is checked per route.

### 3. Create a QR

`POST /api/qr`. The route validates input, then loads the license with `getLicense(uid)`. It counts the user's active codes against the plan limit and checks feature gates. It generates a unique 7-character slug (nanoid with a no-lookalike alphabet). Last, it upserts `qr_codes` and an empty `qr_stats` row. The SPA renders the QR image itself: the server never makes the image.

### 4. Scan (the core path)

See [doc 03](03-scan-flow-and-gate-engine.md). In short: Worker → KV config (or origin lookup) → gates → `POST /internal/scan` (waited for) → `302` to the destination.

### 5. Payment

The SPA calls `POST /api/billing/checkout`. The server returns signed PayHere form fields. The SPA builds a hidden `<form>` and POSTs it to PayHere. After payment, PayHere POSTs to `/api/billing/notify`. The server checks `md5sig`, then upgrades the profile. See [doc 07](07-plans-billing-payhere.md).

## How Express runs in each environment

[server/index.ts](../server/index.ts) builds `app` inside `startServer()` and runs it with a top-level `await` when the module loads.

| Environment | What happens |
|---|---|
| `npm run dev` (local) | `NODE_ENV` ≠ production and no `VERCEL`, so Vite runs as middleware and `app.listen(3000)`. The `/:slug` dev redirect works. |
| Production, not on Vercel | Serves `dist/` statically, with an SPA fallback, and listens |
| Vercel | No listen. `api/index.ts` re-exports `app` and Vercel runs it per request. In-memory state (rate limiters) is per instance and resets on cold start. |

## Hosting the web app and the API separately

Today the SPA, the API and the Worker's pass-through all share one origin (`scnr.tharkak.com`) and one Vercel project. They are separate code but not yet separately deployable. Moving the API to another host (or the SPA to a static host) needs:

1. **An API base URL in the SPA.** Every call uses a relative `/api/...` path (`src/lib/api.ts` plus one raw `fetch` in `Analytics.tsx`, and the base shown in `ApiDocs.tsx`). Add a `VITE_API_URL` prefix in one place.
2. **CORS.** The API already restricts CORS to `APP_URL`; it would be set to the SPA's origin. Calls use bearer tokens, not cookies, so no credentialed-CORS work is needed.
3. **The Worker with two upstreams.** Today everything that is not a code is passed through to one origin. It would send `/api/*` and `/internal/*` to the API host (`API_URL`) and the rest to the SPA host.
4. **Webhook and return URLs.** PayHere `notify_url` and the Polar webhook must point at the API host; `APP_URL` stays the SPA origin for return links.
5. **Crons.** `vercel.json` schedules `/api/cron/*`; another host needs its own scheduler.
6. **Shared code.** `server/` and `worker/` import pure modules from `src/lib/`. In a split repo these move to a shared package.

Estimated effort: about one day. It was deliberately not done yet; nothing is lost by waiting.

## Database access

`server/index.ts` calls supabase-js directly through three small helpers: `row(table, col, val)`, `rows(table, col, val)` and `statsFor(slugs)`. The Firestore-compat shim that used to sit here was removed in Phase 3. It had hidden fake batches, read-modify-write increments, dotted-key updates and 30-item `in` chunking.

Writes that must be atomic happen in Postgres: `record_scan()` (migration 003) records one scan in one transaction. Deletes rely on `on delete cascade`: deleting a code removes its stats and events, and deleting the auth user removes everything the account owns.

## Key design decisions (and their costs)

| Decision | Benefit | Cost |
|---|---|---|
| Gates at the edge with a KV cache (TTL 300 s) | Fast decisions on a cache hit | Edits call `purgeEdge(slug)`, so they apply on the next scan. KV is eventually consistent, so scan counts are approximate. |
| Quota decided in `/internal/slug`, analytics sent with `waitUntil` | The redirect never waits for the DB write | The quota can overshoot by up to 300 s of traffic |
| Pre-aggregated jsonb counters in `qr_stats` | Dashboard reads one row per QR | The `days` map grows by one key per active day. Counters are atomic through `record_scan()`. |
| Express as a single file | Simple to deploy | About 1,600 lines. Analytics is one set of views served for both a code and the account. |
| Client-side QR rendering | No server image work | None. Dynamic content comes from `VITE_SHORT_DOMAIN` through `getQRContent()` ([doc 06](06-frontend.md#qr-content-and-the-short-domain)). |
