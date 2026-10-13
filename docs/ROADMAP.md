# Scnr roadmap: competitor parity (Hovercode + Bitly), phases 5–12

## Context

Phases 0–4 shipped (PRs #7–#14), and production is live. Five competitor screenshots are in [competitors/](competitors/):
- Hovercode: the plan page, the dashboard, and the dashboard settings menu
- Bitly: the Pages landing and the template picker

They asked for every feature competitors already have.

**Decisions (from the user):**
- **Scope.** Parity with Hovercode and Bitly self-serve, meaning everything in the screenshots plus their self-serve tiers. **Out:** SSO, CRM/CDP sync, retargeting audiences, mobile apps.
- **Plans.** Add a 4th tier, **Business**.

**What Scnr has today:**
- **Types:** URL, vCard, Wi-Fi, Text, Email, WhatsApp, and a `page` guest page (EN/SI/TA, offer, links, Wi-Fi).
- **Gates:** PIN, expiry, scan limit, Visitor Guard, pause.
- **Analytics:** country, device, OS, browser, hours, CSV.
- **Team plan:** 5 seats, API keys, bulk CSV, 1 custom domain, `client` folders, white-label report.
- **Other:** weekly digest; LKR/USD billing.

### Gap list (from the screenshots and the competitor facts below)

| Competitor feature | Seen in | Phase |
|---|---|---|
| 4 tiers; "in total" vs "per month" wording; FAQ; currency and interval switch | Hovercode plan page | 5 |
| Limits per object (short links, pages, forms, domains, workspaces) | Hovercode plan page | 5 |
| Logo on Free | Hovercode Free | 5 |
| Types: PDF, Google review, GS1 Digital Link, Instagram and other socials, phone, SMS, location, event, app store | Hovercode type tabs, "More" | 6 |
| Design: frames with "Scan me" text, dot and corner styles, circle QR, saved brand style | Hovercode "circle generator", "logo best practices" | 6 |
| **Pages**: block builder, socials, image, video, products, contact card with "Save as contact" | Bitly Pages | 7 |
| **Page templates** by use case: link-in-bio, products and services, digital business card, promotions | Bitly templates | 7 |
| Click analytics on Pages ("Engagements") | Bitly Pages | 7 |
| **Short links** tab, with custom back-half | Hovercode tabs, Bitly Links | 8 |
| Folders, tags, sort, search, Select (bulk actions) | Hovercode dashboard | 8 |
| UTM builder and campaigns | Bitly, Hovercode free tools | 8 |
| **Forms**: builder, submissions, CSV export | Hovercode Forms tab, "Form builder" | 9 |
| Advanced tracking: city, GPS, referrer, language; unlimited history on top tiers | Hovercode Pro, Business | 10 |
| Smart routing by device, country, time or language | Flowcode, Bitly deep links | 10 |
| Webhooks, multiple workspaces (up to 10), 10 or 50 custom domains, 25 seats | Hovercode Business, Business Plus | 11 |
| Export data, Developer API, Bulk generator (already built) | Hovercode settings menu | 11 (move into the new Settings menu) |
| What's new, Help button, free public tools (QR scanner, UTM builder, Google review and WhatsApp link generators) | Hovercode header and footer | 12 |

**Not doing** (out of scope, per the user's choice): SSO, Zapier app (webhooks cover it), CRM/CDP, retargeting pixels, mobile app, S3 export, and per-month quotas (we keep caps "in total", which is simpler and honest).

### Core design rule (ponytail)

**Every new object is a row in `qr_codes`.** That means short links, pages and forms too. They then reuse what exists:
- the slug
- the Worker gate engine
- `record_scan` analytics
- plan caps in `POST /api/qr`
- `purgeEdge`, the API (`/api/v1`), bulk, folders and lapse-pause

The differences are carried in two places:
- `qr_type`: new values `pdf`, `form`, …, plus the existing `page`
- a new `kind` column: `'qr' | 'link'`. A short link is a dynamic URL row with `kind='link'`. It is shown without a QR image and counted against `short_links`.

There is no second router, no second analytics pipeline, and no new table per type. The exception is form submissions, which are real new data.

---

## Operating manual (read before any phase)

### Who does what

| Task | Cloud session | Needs the user |
|---|---|---|
| Code, tests, docs, branches, PRs, merges | Yes (`gh` and git work with the repo token) | – |
| Run `qa.ts` against Supabase | Only if the sandbox has the secrets (see Environment) | Provide secrets |
| Run migrations `00N_*.sql` | No (no DB password, no Supabase CLI) | **Paste the file into the Supabase SQL editor** and say "done" |
| Deploy the Worker (`wrangler deploy`) | No (no Cloudflare login on cloud) | Run it locally, or run `wrangler login` in the session if the sandbox allows a browser step |
| Cloudflare route / DNS changes | No | The user, in the dashboard |
| Vercel env vars | No (no `vercel` login) | The user, or run locally with the CLI |
| Vercel deploy | Automatic when a PR merges to `main` | – |

When a phase needs a migration, the session **stops before merging**, prints the exact file path, and waits for "done". CI runs QA against the real database, so the PR cannot go green first.

### Per-change workflow (one phase = one branch = one PR)

1. `git checkout main && git pull`, then `git checkout -b <type>/<short-name>` (`feat/`, `fix/`, `chore/`, `docs/`). Never commit to `main`.
2. Plan the phase's tasks, then build in small commits. Commit messages are normal English and end with the attribution line from the session's system reminder.
3. Tests are part of the change, not a follow-up:
   - Add a numbered `section()` in `qa.ts` using `check()` for every new API behavior.
   - Worker behavior goes in section 15b (the Worker runs in-process with a fake KV).
   - Pure logic gets an assert-based self-check at the bottom of its own file (see `src/lib/guestPage.ts`, `csv.ts`, `digest.ts`). Run it with `npx tsx <file>`.
   - Anything the server imports needs a `.js` extension on relative imports; `scripts/check-server-imports.mjs` enforces it.
4. Docs are part of the change: update the matching file in `docs/01–11`, add an entry to `docs/CHANGELOG.md`, and update `docs/README.md` if a page is added. Mark any review finding fixed in `docs/11-review-findings.md`.
5. If the schema changed: add `migrations/00N_<name>.sql` (idempotent: `if not exists`, `drop policy if exists`) and mirror the end state into `supabase_schema.sql`. Stop for the user to run it.
6. Local checks, all green before pushing:
   - `npm run lint`
   - `node scripts/check-server-imports.mjs`
   - the self-checks for any touched `src/lib` file
   - `qa.ts` (see "Running QA")
7. `git push -u origin <branch>`, then `gh pr create --base main`. The body has a summary, the verification run, and a `🤖 Generated with [Claude Code](https://claude.com/claude-code)` line.
8. `gh pr checks <n> --watch`. Fix and push until green. Never skip hooks or bypass checks.
9. `gh pr merge <n> --squash --delete-branch`, then `git checkout main && git pull && git branch -D <branch>`.
10. After a merge that touched `worker/worker.js`: ask the user to deploy it (`cd worker && npx wrangler deploy`), then smoke test.
11. Smoke test production: `curl -s https://scnr.tharkak.com/api/health` → `status: ok`; a real slug returns 302; `/internal/slug/x` returns 401.
12. Update the plan's checklist (below) in the same PR, so the next session sees what is done.

### Running QA

- CI (`.github/workflows/api-qa.yml`) runs `qa.ts` against the real Supabase project with dummy PayHere/Polar/Cron secrets. A PR cannot merge red.
- Locally or in a sandbox with secrets, start the server on another port and give it CI's env:
  ```
  export PAYHERE_MERCHANT_ID=qa-merchant PAYHERE_SECRET=qa-secret \
    POLAR_WEBHOOK_SECRET=qa-polar-secret POLAR_PRODUCT_PRO_MONTHLY=prod_qa_pro_monthly \
    CRON_SECRET=qa-cron-secret RATE_LIMIT_MAX=5000 RATE_LIMIT_WRITE_MAX=1000 \
    NODE_ENV=test APP_URL=http://localhost:3100 PORT=3100
  npx tsx server.ts &
  QA_API_URL=http://localhost:3100 npx tsx qa.ts
  ```
  Without those variables the billing checks fail with 500/401; that is the env, not a regression.
- Required variables for QA: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `INTERNAL_SECRET`, `HASH_SALT`. If a cloud sandbox has none, rely on CI and say so in the PR.
- Kill the test server afterwards. A leftover server on the port makes the next run hit stale code.
- `qa.ts` creates users `qa-*@test.dynamicqr.local`, sweeps ones older than 1 hour at start, and deletes its own at the end and on a crash.

### Environment and secrets

- Never commit secrets or put them in a `VITE_*` variable (Vite inlines those into the public bundle). The local `.env` on the user's machine is the master copy; it is git-ignored and **not available in the cloud**.
- Production values live in Vercel (11 variables, see `docs/10-operations.md` "Where the values live") and in Wrangler secrets (`API_URL`, `INTERNAL_SECRET`, `HASH_SALT`; `MAIN_HOST` is in `wrangler.toml`).
- New env variables: document them in `docs/10-operations.md` and `.env.example`, add a dummy to the CI workflow if QA needs one, and tell the user to add the real value to Vercel.

### Code conventions (match the surrounding code)

- **Ponytail style** (the `ponytail:plugin` skill): the shortest working diff; reuse an existing helper before writing a new one; prefer stdlib, native browser features and DB constraints; no abstraction for a single use; mark a deliberate corner with a `ponytail:` comment naming the ceiling and the upgrade path. Never be lazy about input validation, security, or data-loss paths.
- Server runs as **Node ESM on Vercel**: relative imports in the server graph (`api/index.ts` → `server.ts` → `src/lib/*`) must end in `.js`. Files shared with the browser must read env as `typeof import.meta.env !== 'undefined' && import.meta.env.VITE_X` (a full static access, or Vite won't inline it).
- All plan limits live in `src/lib/plans.ts`. All prices live in `PRICES`. Nothing hard-codes a limit elsewhere.
- Supabase: the service role bypasses RLS; new tables enable RLS **with no policies** (deny-all for the public anon key).
- Every dynamic-code edit calls `purgeEdge(slug)`; every grant of paid state goes through `applyPayment()`.
- Escape all user content in HTML (`esc`), and run every user URL through `safeUrl`.
- Line endings: the repo is checked out as CRLF on Windows. In a Linux cloud session use LF; do not mass-convert files in a feature PR.
- Write docs and PR text in plain English prose (no terse style).

### Subagents and skills (how to use them in this project)

Use agents to parallelize **independent** work, not to split one file between two writers.

| Use | For | Rules |
|---|---|---|
| `Explore` agents (up to 3, parallel) | Locating code before a phase: where a route, type or helper lives | Read-only. Give each a distinct area. |
| `Plan` agent | Designing a phase's task list when the shape is uncertain | One per phase. |
| Builder agents (`general-purpose` or `caveman:cavecrew-builder` for 1–2 file edits) | Independent slices inside a phase: for example the Worker change, the UI page and the QA section | Each gets its own files and its own worktree (`isolation: "worktree"`). The main session merges them onto the phase branch and resolves conflicts. |
| `caveman:cavecrew-reviewer` / `/code-review` | Review of the diff before opening the PR | Fix findings, don't skip them. |
| `claude-code-guide` | Questions about Claude Code itself | – |

Rules for parallel slices: (a) split by **file ownership**, never two agents on `server.ts`'s same region; (b) shared files (`plans.ts`, `qa.ts`, `server.ts`, `worker.js`, docs) are edited by the main session or serialized; (c) every slice ends with its own self-check passing; (d) the main session runs the full local checks once at the end.

Skills available in the user's setup (a cloud session only has the ones committed to the repo or installed there; check `/skills` first):
- `ponytail:ponytail` — build style (above). Level `full`.
- `browser-automation` — drive and screenshot the running app (`node <skill>/browser.mjs <url> --snapshot`), used for UI checks after each UI phase.
- `graphify` — knowledge-graph view of the codebase, when a phase touches many files.
- `/code-review` — review before PR.
- `caveman` — terse chat style only. Code, docs, commits and PR text stay normal English.

If a skill is missing in the cloud session, follow its rules from this document instead of stopping.

### Definition of done (per phase)

- [ ] Branch created from fresh `main`; one PR; squash merged; branch deleted locally and remotely.
- [ ] Tests: new `qa.ts` section(s) and any `src/lib` self-checks; all green locally or in CI.
- [ ] Docs: the matching `docs/*.md`, `CHANGELOG.md`, README links; findings updated.
- [ ] Migration file added, mirrored in `supabase_schema.sql`, **run by the user before merge**.
- [ ] CI green (QA + Vercel preview).
- [ ] Production smoke test passed after deploy; Worker redeployed if it changed.
- [ ] This checklist below updated.

### Progress checklist

- [x] Step 0: roadmap and CLAUDE.md on GitHub
- [x] Phase 5: Plans v2
- [x] Phase 6: Code types and design
- [x] Phase 7: Pages builder and templates
- [x] Phase 8: Short links and organization
- [x] Phase 9: Forms
- [ ] Phase 10: Tracking and smart routing
- [ ] Phase 11: Business tier
- [ ] Phase 12: Public tools and help

### Kickoff prompt for the cloud session

> Read `CLAUDE.md` and `docs/ROADMAP.md`. Do the next unchecked phase in the progress checklist, following the Operating manual exactly: one branch, tests and docs in the same PR, stop for the user to run the migration, merge and delete the branch, then update the checklist. Use Explore agents for discovery and parallel builder agents in worktrees for independent slices. Use the ponytail skill style. After the merge, report what shipped and what I must do next (migration, Worker deploy, env vars).

---

## Delivery workflow, per phase (details)

For each phase:
1. Create a branch from `main`.
2. Make the changes as small commits, each ending with the attribution line from the session's system reminder.
3. Add `migrations/00N_*.sql`, idempotent, and mirror it into `supabase_schema.sql`. **The user runs it in the Supabase SQL editor before merge**, because CI runs QA against the real DB.
4. Add a numbered `section()` in `qa.ts` for every new behavior. Worker behavior goes into section 15b (in-process Worker with fake KV).
5. Update the docs: `docs/01–11`, `docs/CHANGELOG.md`, and `docs/README.md`.
6. Run locally: `npm run lint`, `node scripts/check-server-imports.mjs`, and `qa.ts` with CI's dummy env.
7. Push, open the PR (ending with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`), run `gh pr checks --watch`, then `gh pr merge --squash --delete-branch`, then `git checkout main && git pull && git branch -D`.
8. After any phase that changes `worker/worker.js`, the Worker must be deployed (`cd worker && npx wrangler deploy`; the user does this unless the session has a Cloudflare login). Then smoke-test a live slug.

---

## Phase 5: Plans v2 (Business tier and per-object limits). Branch `feat/plans-v2`

[src/lib/plans.ts](src/lib/plans.ts) stays the only place limits live.

**New `PlanLimits` fields:** `short_links`, `pages`, `forms`, `custom_domains` (a number, replacing the boolean), `workspaces`, `webhooks`, `gps_tracking`, `smart_routing`, `remove_branding`, `file_mb`.

| | Free | Pro $7 / LKR 2,290 | Team $29 / LKR 9,490 | **Business $79 / LKR 25,990** |
|---|---|---|---|---|
| QR codes (dynamic) | 3 (1) | 100 | 600 | 2,000 |
| Short links | 3 | 100 | 600 | 2,000 |
| Pages | 1 | 5 | 50 | 400 |
| Forms | 0 | 3 | 20 | 100 |
| Scans per month | 1,000 | 75,000 | 500,000 | 2,000,000 |
| Analytics history | 90 days (was 7) | 365 | 730 | 1,825 |
| Custom domains | 0 | 1 | 10 | 50 |
| Seats and workspaces | 1 / 1 | 1 / 1 | 10 / 1 | 25 / 10 |
| API, bulk, CSV | – | – | ✓ | ✓ |
| GPS tracking, smart routing | – | ✓ | ✓ | ✓ |
| Webhooks | – | – | – | ✓ |
| Logo on QR | ✓ (now on Free) | ✓ | ✓ | ✓ |
| Branding removed, upload size | – / 5 MB | ✓ / 20 MB | ✓ / 50 MB | ✓ / 100 MB |

Annual is 10× monthly, as today. LKR prices use the same ratio as today: 2,290 / 7 ≈ 327 per USD.

**Changes:**
- `PRICES.business`, and `PlanId` gains `'business'`.
- Billing:
  - Checkout, `applyPayment` and the PayHere/Polar plan maps accept `business`.
  - Add the `POLAR_PRODUCT_BUSINESS_*` env vars.
  - Migration `005_plans_v2.sql` widens any `plan` check constraint.
- A single helper replaces the `custom_domain` / `api_access` boolean checks:
  - `countLimit(uid, field, filter)` in `server.ts`.
  - It reuses the existing count query in `POST /api/qr`, now keyed by `kind` / `qr_type`.
  - It returns 403 with codes `LIMIT_SHORT_LINKS`, `LIMIT_PAGES` and `LIMIT_FORMS`.
- Pricing page ([Pricing.tsx](src/pages/Pricing.tsx), [Billing.tsx](src/pages/Billing.tsx), Landing):
  - 4 cards, all generated from `PLANS` + `PRICES`, so there's no second feature list.
  - "in total" wording.
  - An FAQ using `<details>` (native), with Hovercode's question set answered honestly: free really free, codes don't expire, lapse pauses, no ads, static unlimited, cancel any time, analytics history, non-profit discount on WhatsApp.
- `CreateQR` allows a logo on Free.
- **QA:**
  - a Business checkout charges the right amount
  - the 4th short link on Free returns 403 `LIMIT_SHORT_LINKS`
  - a 2nd page on Free returns 403 `LIMIT_PAGES`
  - Free timeseries is capped at 90 days
  - Free can save a logo

## Phase 6: More code types and QR design. Branch `feat/code-types-design`

**Types.** URL builders live in `src/lib/qrContent.ts`: one pure `buildDestination(type, data)` with an assert self-check, next to `waLink`. Most new types are **URL types**: they store `qr_type:'url'`, `content_data.kind = <type>`, and `destination_url = build(...)`. That matches how WhatsApp works today, so the Worker and analytics need nothing new.

| Type | Destination |
|---|---|
| Google review | `https://search.google.com/local/writereview?placeid=<id>`. A place-ID helper link opens Google's Place ID finder. |
| Instagram, Facebook, TikTok, YouTube, LinkedIn, X | profile URL built from a handle |
| Phone / SMS | `tel:` / `sms:?body=`. Static if non-dynamic; dynamic goes through a Worker redirect. |
| Location | `https://maps.google.com/?q=<lat,lng or address>` |
| Event | dynamic `qr_type:'event'`. `renderGuestPage` returns `{kind:'ics'}` (like vCard). |
| App store | dynamic URL with device rules (Phase 10's routing engine). In this phase: iOS URL, Android URL and fallback stored in `content_data.app`; the Worker picks by UA (3 lines). |
| **PDF** | upload → Supabase Storage → destination = public file URL |
| **GS1 Digital Link** | encodes `https://<short domain>/01/<GTIN>[/10/<batch>]` |

- **PDF:**
  - Bucket `files`, public read, created in migration 006.
  - `POST /api/files` returns a `createSignedUploadUrl`, checked against `limits.file_mb`. The client uploads directly, with no file bytes through Vercel and so no body limit.
  - Replacing the file keeps the same QR. Account delete removes the user's folder.
- **GS1:**
  - New unique column `qr_codes.gtin`; the GTIN check digit is validated in the self-check.
  - The Worker routes `/01/<gtin>...` to `/internal/gs1/<gtin>`, which resolves to the owning row's config. From there it is the normal gate flow.
- **Design** (all from `qr-code-styling`, already installed):
  - dot styles: square, dots, rounded, classy, extra-rounded
  - corner square and corner dot styles
  - linear gradient
  - circle shape (`shape:'circle'`)
  - **frame + CTA text** ("Scan me", "Menu", "Review us"). A frame is an SVG wrapper composed around the QR at download time, in one function in `qrContent.ts` (`stylingOptions` already lives there).
  - **Saved brand style:** `profiles.brand_style jsonb`, with a "Save as my default" button and new codes prefilled from it.
- **CreateQR tabs** reorganized like Hovercode: Link, PDF, WhatsApp, Google review, GS1, vCard, Page, Form, and a More ▾ menu for socials, phone, SMS, location, event, app, Wi-Fi, text and email.
- **QA:**
  - each URL builder (self-check)
  - an uploaded PDF URL redirects
  - a GS1 path resolves and an invalid check digit returns 400
  - an event download is `text/calendar`
  - app routing: an iPhone UA goes to the App Store, Android to Play
  - `brand_style` persists

## Phase 7: Pages builder and templates (Bitly Pages). Branch `feat/pages-builder`

- **Content model.** `qr_type:'page'` gains `content_data.blocks[]`. The existing `name / subtitle / offer / links / wifi / i18n` fields keep rendering unchanged for Restaurant Kit codes.
  - **Block kinds:** `header` (logo, avatar, name, tagline), `socials` (icon row), `button` (label, URL, icon), `text`, `image` (from storage), `video` (YouTube or Vimeo embed via `youtube-nocookie`), `products` (image, title, price, link, as a horizontal scroll), `contact` (phone, email, address, website, **Save as contact** → the vCard endpoint `/<slug>?vcf=1`), `offer`, `wifi`, `divider`.
  - **Theme:** `{bg, text, accent, button style, font}`. Translations per block (EN/SI/TA) through the same `i18n` overrides the Kit uses today.
- **Renderer.** Extend `renderGuestPage` in [src/lib/guestPage.ts](src/lib/guestPage.ts): one `block()` switch, still pure, still escaped, still `safeUrl`. The Worker and Express dev route already call it.
- **Click tracking ("Engagements").** Buttons link to `/<slug>/l/<blockIndex>`. The Worker logs the click with `waitUntil`, and `record_scan` gains a `p_click` arg (migration 007 adds a `clicks` jsonb to `qr_stats`), then the Worker 302s to the block URL. Analytics shows a per-button click table and CTR.
- **Editor.** New `src/pages/PageEditor.tsx`:
  - block list (add, reorder with up/down buttons, delete; no drag-and-drop library)
  - live preview: an iframe with `srcdoc = renderGuestPage(...)`, so preview is exactly what guests see
  - the Kit wizard becomes one of the templates
- **Templates.** `src/lib/pageTemplates.ts` holds a plain array of 12 `content_data` presets, grouped by use case:
  - Link-in-bio
  - Products and services
  - Digital business card
  - Promotions
  - Restaurant menu (our Kit)
  - Real estate
  
  The picker is a grid of iframe previews, plus "Start from scratch". Images come from the user's own uploads; templates ship with plain color blocks, not stock photos.
- **Pages tab.** Pages are reachable by short URL alone. The QR is optional, shown on demand.
- **QA:**
  - every block renders and escapes
  - a `javascript:` URL is dropped in every block
  - a click on `/l/2` counts and redirects
  - "Save as contact" returns `text/vcard`
  - an old Kit page still renders identically (snapshot of the current test)
  - the page cap is enforced

## Phase 8: Short links and organization. Branch `feat/links-organize`

- **Short links.**
  - `kind='link'` rows; Dashboard gets tabs **QR codes / Pages / Short links / Forms** (a query param on the existing `GET /api/qr?kind=`).
  - Create from a single "Paste a link" box (Hovercode's top input), which works for codes too.
  - **Custom back-half:** an optional `slug` on create.
    - Charset `[A-Za-z0-9-]{3,40}`.
    - Not reserved: the Worker's `FRONTEND_ROUTES` set moves into `src/lib/qrContent.ts` as `RESERVED_SLUGS` and is imported by both the Worker and the server, so one list prevents collisions.
    - Unique via the primary key. Pro and up.
    - The Worker's slug regex widens to match. A ponytail check runs every App.tsx route against `RESERVED_SLUGS` (self-check).
- **Folders.** Rename the `client` field to **Folders** in the UI; it stays the `qr_codes.client` column, so there's no migration and the API keeps `client`. Add a folder picker with "New folder…".
- **Tags.** `qr_codes.tags text[]` plus a GIN index (migration 008). A tag chip input; filter by tag.
- **Sort and search.** Sort by newest, oldest, most scans or name, plus search on title, slug and destination. Client-side over the already-loaded list. `ponytail:` move server-side if a list exceeds 2,000 rows.
- **Select mode.** Checkboxes, then a bar with: move to folder, add tag, activate/deactivate, delete, and **download ZIP**. The ZIP is built client-side with each code's SVG; it reuses `StyledQR`, and `fflate` is about 8 KB. One new dependency; it's justified because no native ZIP exists.
  - Server: `POST /api/qr/bulk {slugs, action, value}`. One endpoint, ownership checked per slug, `purgeEdge` for each.
- **UTM builder.** UTM fields on any URL code or link (`utm_source/medium/campaign/term/content`). They are stored in `content_data.utm`, and the Worker appends them on redirect (5 lines; existing query params win). A public UTM builder page ships in Phase 12.
- **Campaigns** (Bitly) = a folder with a folder-level analytics view. `AccountAnalytics` already accepts `?slugs=`, so the view passes the folder's slugs. No new table.
- **QA:**
  - a link with a custom back-half resolves
  - a reserved word (`pricing`) returns 400
  - a duplicate returns 409
  - tags filter
  - bulk deactivate on 3 slugs gives 3 inactive and edge-purged
  - a UTM is appended without clobbering existing params
  - links don't count against the QR cap

## Phase 9: Forms. Branch `feat/forms`

- **Content.** `qr_type:'form'`, with `content_data = {title, intro, fields:[{id, type: text|email|phone|number|textarea|select|checkbox|date|rating, label, required, options}], submit_label, thank_you, notify_email}`.
- **Data.** Migration 009 adds `form_submissions(id, slug fk cascade, data jsonb, created_at, ip_hash)`, with RLS on and no policies.
- **Render.** `renderGuestPage` case `form`: native HTML inputs, so `required` and `type=email` give client-side validation for free, with POST to the same URL.
- **Submit.**
  - The Worker POST goes to `/internal/form/:slug` (secret header).
  - The server validates fields against the stored definition, which is the trust boundary.
  - Spam control: a honeypot field plus the existing KV counter (5 per 15 min per visitor).
  - The server inserts the submission, emails `notify_email` through the existing Resend `fetch` helper from the digest, and fires the `form.submitted` webhook (Phase 11).
- **Dashboard.** A Forms tab with a submissions table, CSV export (reuse `csv.ts` / Blob), and delete. Form submissions are included in `/api/user/export`.
- **Builder UI.** It reuses the PageEditor block-list pattern, with field list and preview iframe.
- **QA:**
  - a valid submit stores the row and shows the thank-you page
  - a missing required field returns 400
  - a filled honeypot is silently dropped
  - an unknown field is stripped
  - the 6th rapid submit returns 429
  - the CSV includes the row
  - the form cap is enforced (Free = 0 forms)

## Phase 10: Advanced tracking and smart routing. Branch `feat/tracking-routing`

- **City, region, language, referrer.**
  - The Worker already has `request.cf.city/region` and `Accept-Language`; it sends them to `/internal/scan`.
  - `record_scan` gains `p_city`, `p_lang` and a `cities` jsonb (migration 010). `referer` is already stored.
  - Analytics gets top cities, languages and referrer domains. These are all-time maps like `countries`, so no new query shape.
- **GPS tracking (opt-in per code, Pro and up).**
  - When `config.gps`, the Worker serves a tiny interstitial that calls `navigator.geolocation.getCurrentPosition` with a 4 s timeout, POSTs the coordinates rounded to 3 dp to `/<slug>/geo`, then redirects. Deny or timeout redirects anyway.
  - The interstitial carries a short consent line, and the privacy policy is updated.
  - Coordinates are stored in `scan_events.lat/lng`.
  - Analytics shows a map using Leaflet + OSM tiles (`leaflet`, about 40 KB, the one new dependency in this phase).
- **Smart routing (Pro and up).**
  - `content_data.rules = [{if:{device?, os?, country?, lang?, days?, from?, to?}, url}]`, first match wins, else `destination_url`.
  - One pure `pickRoute(rules, ctx)` lives in `src/lib/routing.ts`, imported by the Worker (it already imports `guestPage`), with an assert self-check.
  - Phase 6's app-store type becomes a preset of these rules.
- **History caps** from Phase 5 enforced in the timeseries (the existing `analytics_days` clamp).
- **QA:**
  - `pickRoute` self-check (device, country, time window, fallback)
  - Worker: an iPhone UA with an iOS rule redirects to the iOS URL
  - GPS: an interstitial is served when on, and a posted fix is stored rounded
  - a city appears in the account analytics map

## Phase 11: Business tier features. Branch `feat/business-tier`

- **Webhooks (Business).**
  - Migration 011 adds `webhooks(id, uid, url, secret, events text[], created_at, last_status)`.
  - Events: `scan.created`, `form.submitted`, `qr.created/updated/deleted`.
  - `scan.created` is sent for every scan. The server fans it out from `/internal/scan`, which the Worker already calls in `waitUntil`, so scans aren't slowed.
  - Delivery: one `deliver(uid, event, payload)` helper. It signs with HMAC-SHA256 in the **same Standard Webhooks format we already verify for Polar** (reuse that code, sign side), retries 3 times with backoff inside the request, and records `last_status`.
  - Settings UI: add, test ping, delete.
- **Multiple workspaces (Business, up to 10).**
  - Migration 011 adds `workspaces(id, owner_uid, name)` and `qr_codes.workspace_id` (nullable; null = the owner's default workspace, so existing rows need no backfill). `workspace_members` gains `workspace_id`.
  - The client sends an `X-Workspace` header, set by a workspace switcher in the header.
  - `authenticate` resolves the effective `{owner, workspace}` in **the existing `workspaceOwner` choke point** ([server.ts:153](server.ts#L153)). Routes then filter by `workspace_id` with one `.match()` added in `GET/POST /api/qr`, bulk and account analytics.
  - Caps stay account-wide.
- **Multiple custom domains.**
  - Drop the "1 per account" check ([server.ts:1462](server.ts#L1462)) and count against `limits.custom_domains`.
  - `activeDomain(uid)` returns a list, and the code editor picks which domain a code prints with (`qr_codes.domain`). `qrContent` builds from it.
  - The Worker already serves any host.
- **Seats.** Team 10 and Business 25 come from the Phase 5 limits; no code change beyond the cap.
- **Settings menu like Hovercode's.** Workspace settings, Members, Custom domains, Webhooks, Export data, Bulk generator, Developer API, What's new, Billing, Account. This regroups existing pages.
- **QA:**
  - a webhook receives a signed `qr.created` and the signature verifies with the shared verifier
  - a member of workspace B cannot list workspace A's codes
  - a 2nd custom domain on Team succeeds and the 11th returns 403
  - Business limits apply after a Business payment

## Phase 12: Public tools, help and What's new. Branch `feat/public-tools`

- **Free tools** for SEO and acquisition; public routes need no login:
  - `/tools/qr-scanner`: native `BarcodeDetector` when present, else the `jsQR` fallback (about 10 KB)
  - `/tools/utm-builder`
  - `/tools/google-review-link`
  - `/tools/whatsapp-link`
  - `/tools/qr-generator`: static only, with a CTA to sign up for dynamic
  
  Each is one small page reusing the Phase 6 `buildDestination`.
- **Help button.** A floating WhatsApp button using `SITE.whatsapp` / `waLink`, shown on the dashboard and pricing.
- **What's new.** `/whats-new` renders a short `src/lib/changelog.ts` array, written for customers, not the dev CHANGELOG.
- **Footer link hub** like Hovercode's: generators, features, tools, articles (placeholders only once real articles exist; no fake links).
- **Landing.** Add feature sections for Pages, Forms, Short links and Business. All claims must be true by then, so this phase runs last.
- **QA:** each tool route returns 200 without auth; the UTM builder output matches the Phase 8 Worker append; the scanner page loads with no console errors (browser-automation skill).

---

## Critical files

- `src/lib/plans.ts`: limits and prices, the only source
- `src/lib/qrContent.ts`: `buildDestination`, `RESERVED_SLUGS`, frames
- `src/lib/guestPage.ts`: blocks, forms, events
- new `src/lib/routing.ts` and `src/lib/pageTemplates.ts`
- `server.ts`: `countLimit`, `/api/files`, `/api/qr/bulk`, `/internal/form`, `/internal/gs1`, webhooks, workspace scoping in `workspaceOwner`
- `worker/worker.js`: GS1 path, `/l/<i>` clicks, `/geo`, form POST, UTM append, `pickRoute`, wider slug regex
- `src/pages/CreateQR.tsx`, `Dashboard.tsx`, `Pricing.tsx`, `Analytics.tsx`; new `PageEditor.tsx`, `FormEditor.tsx` (or one shared editor), `Tools*.tsx`
- `migrations/005…011`, `supabase_schema.sql`, `qa.ts`, `docs/*`

## Reuse (don't rebuild)

- `renderGuestPage` and its `esc` / `safeUrl`: every hosted surface
- `record_scan` RPC: clicks, city, language (extend the args; don't add an RPC)
- `purgeEdge`, `logEvent`, `getLicense`, `workspaceOwner`, `sessionOwner`
- the Polar Standard Webhooks verifier, used as the webhook signer
- the digest's Resend `fetch` for form notifications
- `csv.ts` and the Blob download for submission CSVs
- `StyledQR` from `KitPrint.tsx` for the ZIP and print views
- the KV counter pattern (`pwfail`) for form spam

## Verification (every phase)

1. `npm run lint` is clean; `node scripts/check-server-imports.mjs` passes. Run the self-checks: `npx tsx src/lib/{qrContent,guestPage,routing,csv,digest}.ts`.
2. Run `qa.ts` locally against a `PORT=3100` server with CI's dummy env (PayHere, Polar, Cron, rate-limit values). It must be all green, and CI must be green.
3. After a Worker change is deployed, live smoke tests:
   - `curl -sI https://scnr.tharkak.com/<slug>` returns 302
   - the new path (`/01/<gtin>`, `/l/0`, a form POST) behaves
   - `/internal/*` returns 401
4. UI check with the browser-automation skill on the new pages: no console errors, and a snapshot of key elements.
5. Real-phone scan for phases 6, 7 and 10: PDF, Page, GPS prompt, app routing on iOS and Android.
6. The user runs each phase's migration before its PR merges.

## Order and size (rough)

| Phase | Size | Notes |
|---|---|---|
| 5 | 1–2 days | Unblocks every cap below |
| 6 | 3–4 days | |
| 7 | 4–5 days | The biggest UX win, after Bitly Pages |
| 8 | 3 days | |
| 9 | 3 days | |
| 10 | 3 days | |
| 11 | 4–5 days | |
| 12 | 2 days | |

Phases 6–10 are independent after Phase 5 and can be reordered. Phase 12 goes last because the landing copy must only claim shipped features.

---

## Competitor facts (public pricing pages, checked 2026-10; screenshots in [competitors/](competitors/))

### Hovercode (see `hovercode-plans.png`, `hovercode-dashboard.png`, `hovercode-settings-menu.png`)

| Plan | Price | Dynamic QR codes | Other limits |
|---|---|---|---|
| Free | $0 | 3 in total, never expire | 3 short links, 1 multi-link page, logo on QR, 3 months analytics |
| Pro | $12/mo ($120/yr) | 100 in total | 100 short links, 5 pages, form builder, branding removed, GS1 codes, advanced tracking, 12 months analytics, 1 custom domain |
| Business | $39/mo ($390/yr) | 600 per month | 600 short links, 50 pages, unlimited analytics, 10 custom domains, API, bulk generator, CSV export, 10 team members, GPS tracking |
| Business Plus | $99/mo ($990/yr) | 2,000 per month | 2,000 short links, 400 pages, 50 domains, 25 team members, 10 workspaces, webhooks |

Dashboard: tabs QR codes / Pages / Short links / Forms; a "paste a link" box with type tabs (Link, PDF, WhatsApp, Google review, GS1, vCard, Page, Form, More); folders, tags, sort, search and a Select mode. Settings menu: workspace settings, members, custom domains, export data, bulk generator, developer API, what's new, billing, account. A Help chat button, a footer of free tools (QR scanner, UTM builder, Google review and WhatsApp link generators), and a yearly toggle ("2 months free") with a currency picker.

### Bitly (see `bitly-pages.png`, `bitly-templates.png`)

| Plan | Price | QR codes | Data history |
|---|---|---|---|
| Free | $0 | 2 | none |
| Core | $10/mo | 5 | 30 days |
| Growth | $29/mo | 10 | 4 months, custom domain, bulk 10 per upload |
| Premium | $199/mo | 200 | 1 year, city and device data, bulk 200 per upload |
| Enterprise | custom | custom | 2 years, SSO, webhooks, 99.99% uptime |

Pages: a block-based landing page (header, social icons, buttons, image, video, product collection, contact card with "Save as contact") with an "Engagements" analytics card. The template picker has "Start from scratch" and templates grouped by use case: link-in-bio, products and services, digital business card, promotions. Sidebar: Home, Links, QR Codes, Pages, Analytics, Campaigns, Custom domains, Integrations, Settings.

### Other platforms (feature notes)

- **Flowcode:** landing pages and forms with a visual editor, smart routing by time, device or location, webhooks, scheduled email reports, a design studio with logo and colour customisation.
- **QR Tiger:** advanced analytics on paid plans, bulk creation up to 3,000 per batch.
- **QRLynx:** free plan that never expires; excess dynamic codes pause rather than being deleted when a paid plan lapses.
- **QR.io and QRFY:** dynamic codes pause or stop when a trial ends; static codes keep working.
- **Uniqode / QR Code Generator:** premium support on the top paid tier; white-label and extra API on Enterprise.
