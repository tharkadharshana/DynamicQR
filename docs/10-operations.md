# 10 — Operations: Local Dev, Configuration, Deployment, QA

## Local development

Prerequisites: Node 20+, a `.env` at the repo root (copy [.env.example](../.env.example)), and a Supabase project with the schema applied.

```powershell
npm install
npm run dev        # tsx server.ts → http://localhost:3000 (Express + Vite middleware, HMR)
```

`npm run dev` already mounts Vite as middleware, so one process serves both the API and the SPA on port 3000. The two-terminal setup (`npx vite` on 5173, which proxies `/api` to 3000) also works and gives faster HMR.

Worker, needed only for gate work:

```powershell
cd worker; npx wrangler dev     # needs API_URL / INTERNAL_SECRET / HASH_SALT in .dev.vars
```

Without the Worker, the dev redirect `GET /:slug` checks only `is_active`. It does **not** run the expiry, PIN, scan-limit, Visitor Guard or quota gates.

One-time Supabase setup for Google sign-in on localhost: add `http://localhost:5173` (and `:3000`) under Authentication → URL Configuration → Redirect URLs.

QR codes made while the dashboard runs on localhost encode `http://localhost…/slug`. Do not print them. See [doc 06](06-frontend.md#qr-content-depends-on-the-origin).

## Scripts ([package.json](../package.json))

| Script | Does |
|---|---|
| `dev` / `start` | `tsx server.ts` |
| `build` | `vite build` → `dist/` |
| `preview` | `vite preview` |
| `lint` | `tsc --noEmit` (the only static check; it passes as of PR #6) |
| `clean` | `rm -rf dist` (POSIX only) |

## Environment variables

### Where the values live

- **Local `.env` is the master copy** of every value: local dev, shared Vercel values, per-environment notes, values not set yet, and an archive of variables removed from Vercel.
- `vercel env pull .env.vercel-backup.<env> --environment=<env>` takes a backup. All `.env*` files are git-ignored.
- Vercel (Production, Preview, Development) holds exactly:
  - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`, `INTERNAL_SECRET`, `HASH_SALT`, `CRON_SECRET` (all Sensitive)
  - `VITE_SHORT_DOMAIN`, `LOG_LEVEL`, `PAYHERE_SANDBOX`
  - `APP_URL`, `NODE_ENV` (per environment)
- **Never give a secret a `VITE_` name.** Vite inlines `VITE_*` into the browser bundle. The old Supabase-integration variables (`VITE_POSTGRES_*`, `VITE_SUPABASE_JWT_SECRET`, `VITE_SUPABASE_SERVICE_ROLE_KEY`, …) were removed on 2026-10-11; their values are archived in `.env`.
- **Client env access:** write `import.meta.env.VITE_X` out in full. Vite only inlines full property accesses (`(import.meta as any).env` compiles to an empty object). Guard it with `typeof import.meta.env !== 'undefined'` in modules the server or QA also imports.

### Express (Vercel project env and local `.env`)

| Variable | Required | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` (or `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL`) | ✅ | Supabase project URL. Shared with the SPA. |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Backend admin key. **Never give it a `VITE_` name.** Vite inlines `VITE_*` variables into the browser bundle. The server reads only this exact name. |
| `APP_URL` | ✅ in prod | CORS origin, PayHere return/notify URLs, KV purge target. The server exits without it in production. |
| `INTERNAL_SECRET` | ✅ | Worker-to-API auth. Must match the Worker secret. |
| `HASH_SALT` | Worker only | The server does not read it. `.env.example` lists it for convenience. |
| `PAYHERE_MERCHANT_ID`, `PAYHERE_SECRET` | for billing | Checkout returns 500 "Billing configuration error" without them |
| `PAYHERE_SANDBOX` | optional | `true` switches the SPA to `sandbox.payhere.lk`. Checkouts are charged in **LKR**. |
| `NODE_ENV` | | `production` on Vercel |
| `PORT` | | default 3000 |
| `LOG_LEVEL` | | `error` / `warn` / `info` / `debug`. Default: `info` in prod, `debug` in dev. |
| `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`, `POLAR_SANDBOX` | for USD card payments | Without the token, USD checkouts fall back to PayHere in USD. Webhook URL to register in Polar: `{APP_URL}/api/billing/polar/webhook`. |
| `POLAR_PRODUCT_PRO_MONTHLY`, `…_PRO_ANNUAL`, `…_TEAM_MONTHLY`, `…_TEAM_ANNUAL`, `…_BUSINESS_MONTHLY`, `…_BUSINESS_ANNUAL` | for Polar | Product ids created in the Polar dashboard ($7, $70, $29, $290, $79, $790). A plan without a product id gets a 503 on card checkout and can still pay in LKR. |
| `POLAR_PORTAL_URL` | optional | Customer portal link shown on Billing |
| `CRON_SECRET` | ✅ for crons | Vercel sends it as `Authorization: Bearer …` to `/api/cron/*`. Set it in Vercel env; CI uses a dummy. |
| `RESEND_API_KEY`, `DIGEST_FROM` | for the weekly digest | Resend API key and sender (e.g. `Scnr <digest@yourdomain>`, on a domain verified in Resend). Without the key the digest cron skips. |
| `CF_API_TOKEN`, `CF_ZONE_ID`, `CF_CNAME_TARGET` | for custom domains (Team) | A Cloudflare API token with SSL and Certificates edit plus custom hostnames on the zone, the zone id, and the fallback hostname customers CNAME to. Without them, adding a domain returns 503. |
| `RATE_LIMIT_MAX`, `RATE_LIMIT_WRITE_MAX` | QA only | Override the per-IP limits (default 300 / 60 per 15 min). CI raises them because QA runs every call from one IP. |
| `VERCEL` | auto | Set by Vercel. Skips `listen()` and static serving. |

### SPA (build time, Vercel env)

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Browser Supabase client. The anon key is public by design, so RLS must be correct ([doc 09](09-security.md)). |
| `VITE_SHORT_DOMAIN` | Permanent short-link domain encoded into every dynamic QR. Default `https://scnr.tharkak.com`. It must be the domain the Worker fronts. **Never change it after codes are printed.** |
| `VITE_LEGAL_NAME`, `VITE_BUSINESS_ADDRESS`, `VITE_SUPPORT_EMAIL` | Business identity on Landing and the legal pages |
| `VITE_SUPPORT_WHATSAPP`, `VITE_SUPPORT_HOURS` | WhatsApp support and "Book setup" buttons (digits with country code, e.g. `94771234567`) |
| `VITE_STATUS_URL`, `VITE_DEMO_SLUG`, `VITE_FOUNDER_NAME` | Public status page, the live demo code on Landing, the founder's name in the trust strip |

### Worker (Wrangler secrets)

| Name | Purpose |
|---|---|
| `API_URL` | Base URL of Express. **It must serve `/internal/*`.** See [doc 02](02-architecture.md#topology). |
| `INTERNAL_SECRET` | Same value as the API |
| `HASH_SALT` | Visitor fingerprint salt |
| KV binding `QR_CACHE` | id in [wrangler.toml](../worker/wrangler.toml) |
| `MAIN_HOST` (var) | The main app host (`scnr.tharkak.com`), set in `[vars]` of wrangler.toml. On customer custom domains, paths that aren't codes redirect here. |

Check what the live Worker has with `npx wrangler secret list` (names only). An empty list means every scan fails with a 503.

## Deployment

The four parts deploy separately.

1. **Supabase**
   1. New project: run [supabase_schema.sql](../supabase_schema.sql), which is the end state. Existing project: run each file in [migrations/](../migrations) in order (`001_phase0.sql`, …) that has not been applied yet. Every file is idempotent. **Run a phase's migration before merging its PR**, because CI runs QA against the real database.
   2. Enable the Google provider.
   3. Set the Site URL and Redirect URLs to the production domain.
2. **Vercel**
   1. Import the repo. [vercel.json](../vercel.json) builds `dist/` and the `api/index.ts` Node function.
   2. Set the env vars above.
   3. `vercel.json` already rewrites `/api/*` and `/internal/*` to the function.
   4. All other paths fall back to `index.html` (the SPA), except `/assets/*` and `/.well-known/*`. A missing `/.well-known/` file returns a real 404, not HTML with status 200; Lighthouse flagged the HTML as a malformed `ai-catalog.json`.
   5. `/assets/*` is served with `Cache-Control: public, max-age=31536000, immutable`. Those files are content-hashed.
   6. [public/robots.txt](../public/robots.txt), [public/sitemap.xml](../public/sitemap.xml) and [public/llms.txt](../public/llms.txt) are served as static files. List only public pages in the sitemap and llms.txt: `/` and the three legal pages. Every other route redirects a logged-out visitor to `/login`.
3. **Cloudflare Worker**
   1. Run `cd worker`, `wrangler kv namespace create QR_CACHE` (update the id), `wrangler secret put API_URL|INTERNAL_SECRET|HASH_SALT`, then `wrangler deploy`.
   2. Attach the Worker as a **route** on the app domain (`scnr.tharkak.com/*`). The domain's DNS must be proxied (orange cloud) with Vercel as the origin. Then the Worker's pass-through `fetch(request)` reaches Vercel.
   3. The route must name **`dynamic-qr-worker`**. Until 2026-10-11 it pointed at an older Worker, `qr-redirect`, which answered every scan with `503 Service Unavailable (Origin error)`. The workers.dev URL (`dynamic-qr-worker.tharkadharshana.workers.dev/<slug>`) tests the Worker without the route.
4. **PayHere**
   1. Register the domain with the merchant account.
   2. Set `notify_url` reachability (it is sent per request).
   3. Test in sandbox with `PAYHERE_SANDBOX=true`.

Smoke test after a deploy:

```bash
curl -s https://<domain>/api/health                      # status ok
curl -s -o /dev/null -w "%{http_code}\n" https://<domain>/internal/slug/xxxxxxx   # expect 401 from Express, NOT 404 from Vercel
# create a dynamic QR in the dashboard, then:
curl -sI https://<domain>/<slug>                          # expect 302 Location: <destination>
```

## CI — [.github/workflows/api-qa.yml](../.github/workflows/api-qa.yml)

The workflow runs on push and PR to `main` and `development`:

1. `npm ci`
2. `npm run lint` (tsc), then `node scripts/check-server-imports.mjs`. Vercel runs the server as Node ESM, so every relative import reachable from `api/index.ts` must end in `.js`. `tsx` resolves extensionless paths, so local runs and QA can't catch this.
3. `npm run build`, then `node scripts/check-bundle.mjs`. This fails if:
   - the landing entry chunk is over 800 KB,
   - `public/llms.txt` lacks an H1 or links,
   - `public/sitemap.xml` lists a page that isn't public.
4. `npm run dev &`
5. wait for `/api/health`
6. `npx tsx qa.ts`. This includes the Worker gate engine, run in-process (section 15b).
7. upload `logs/` on failure

Required repository secrets: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `INTERNAL_SECRET`, `HASH_SALT`. Keep them in sync with `.env` whenever the Supabase project changes.

The workflow also sets dummy `PAYHERE_MERCHANT_ID=qa-merchant` and `PAYHERE_SECRET=qa-secret`. The billing QA signs notify payloads with the same secret the server checks, so no real merchant is needed. Locally, export the same two variables before `npm run dev` and `qa.ts` if your `.env` has none.

**CI runs against the real Supabase project.** qa.ts creates a throwaway user (`qa-<ts>@test.dynamicqr.local`) and deletes it at the end. A crashed run deletes its own users on the way out. Each run also starts by deleting `@test.dynamicqr.local` users older than one hour, so leftovers from a killed run are gone by the next run, and a parallel CI run is never touched. Deleting the auth user cascades to all of its rows.

## QA suite — [qa.ts](../qa.ts)

An end-to-end HTTP suite of about 730 lines with 20 sections. It covers auth setup, health, plan bootstrap, auth guards, validation, QR CRUD, empty analytics shapes, account analytics, the internal scan and stats increment, the internal slug lookup, profile, billing validation, gate config storage, type redirects, UA, referrer and country parsing, token revocation, plan limits, deactivate-all and export, the redirect engine, and cleanup.

Phase 0 added these sections:

- **15b, Worker gate engine.** Imports `worker/worker.js` and calls `fetch(request, env, ctx)` in Node with an in-memory KV and the local API as origin. It covers redirects on a cache miss and hit, the 404 and 503 pages, expiry, Visitor Guard, the scan limit and its deactivation, PIN lockout, the monthly quota page and a legacy row with no destination. No Wrangler or Cloudflare account is needed.
- **20, Security.** RLS checks for anon and signed-in users (read and write, including self-upgrade), and no `password_hash` in API responses.
- **21, Edit persistence.** A PUT with `options` persists `rate_limit` and the Visitor Guard settings. `/internal/slug` returns the policy fields.
- **22, Billing.** A PayHere order plus signed notifies, testing tampered `custom_2`, replay, wrong amount or currency, unknown order, annual (+12 months), recurring stopped, and chargeback.
- **23, USD billing.** PayHere USD fallback, Polar checkout disabled without a token, and Polar Standard-Webhooks events (bad signature, active, same-period replay, canceled, revoked, unknown product). CI uses a dummy `POLAR_WEBHOOK_SECRET` and product id.
- **25, Restaurant Kit.** Guest page rendering through the in-process Worker: EN/SI/TA, escaping, unsafe links dropped, the WhatsApp link, branding for Free, language switch not counted. Dynamic vCard/Text/Email/Wi-Fi at the edge, `content_data` edits and the 20 KB cap, activation events (needs migration 002), `/api/events` allowlist, `waLink`.
- **26, Retention.** 10 concurrent scans count exactly 10, real per-day uniques, hours, `events.csv`, range clamp, cron auth, digest dry run and opt-out, `record_scan` not callable with the anon key, no `password_hash` in the list (needs migration 003).
- **27, Team plan.**
  - Keys: API keys through `/api/v1` (create, use, scope limits, revoke, downgrade → 403).
  - Seats, with a second real test user: member sees the owner's workspace, can't pay or invite, the seat cap holds, and removal works.
  - Client folders through the API.
- **31, Short links.** A custom back-half resolves at the edge; `pricing` and an `api…` prefix → 400; duplicate → 409; a slash → 400; tag, kind and folder filters; bulk deactivate, folder, tag and delete (a foreign slug is reported as failed); UTM appended without clobbering existing parameters (needs migration 008).
- **30, Pages builder.** A block page at the edge (escaping, `javascript:` dropped), tracked clicks (302 for a page link, 404 for a dropped one, counted with label and CTR, not a scan), Save as contact (`text/vcard`), `/internal/click` needs the secret, a template page saves (needs migration 007). The `guestPage.ts` self-check also holds a hash of a legacy Kit page, so its output cannot drift.
- **29, Code types.** URL builders, a PDF through a signed upload (size cap, redirect to the public file), GS1 (stored as GTIN-14, duplicate → 409, bad check digit → 400 on create and at the Worker, `/01/<gtin>/10/<batch>` → 302), an event → `text/calendar`, app-store routing for iPhone, Android and desktop, and `brand_style` (needs migration 006). Cleanup also checks that the user's uploads are gone.
- **28, Plans v2.** Business checkout amounts (LKR monthly and annual, USD fallback), an unknown plan → 400, Business limits, the Free caps on short links (4th → `LIMIT_SHORT_LINKS`, also when reactivating; no destination → 400) and pages (2nd → `LIMIT_PAGES`), short links outside the QR cap, a short link redirecting at the edge, Free's 90-day history and a logo on Free (needs migration 005).
  - Custom domain: validation, 503 without Cloudflare, the Worker redirect on a custom host, and QR content using the domain.
  - Also covered: white-label branding and the CSV parser.
  - Needs migration 004.
- **24, Plan limits and lapse.** Pro caps (100 codes, 365 days, timeseries capped), the Free dynamic pilot (`LIMIT_DYNAMIC_QR`), and the lapse rule end to end: `pause_on`, `/internal/slug` paused flags, and the Worker serving the holding page while the oldest code stays live.

Not covered yet: the frontend (no browser tests) and real Cloudflare KV behaviour (eventual consistency, TTLs).

## Logging — [logger.ts](../logger.ts)

- **Production:** JSON lines on the console, with a `severity` field in Google Cloud style (a leftover). Vercel captures them.
- **Development:** coloured console output plus `logs/combined.log` and `logs/error.log`.
- Every request is logged on finish with the request id, ms, uid, IP and UA. 4xx responses log at warn, 5xx at error.
- Worker logs use `console.error` only. View them with `wrangler tail`.

There is no alerting, error tracking (Sentry or similar) or uptime check. The cheapest useful addition is an external uptime monitor that checks a real slug for a 302, because that is the path customers depend on and it is broken today.
