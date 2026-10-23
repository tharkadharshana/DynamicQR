# Scnr: instructions for Claude Code sessions

Dynamic QR SaaS for Sri Lankan businesses. React 19 + Vite SPA, Express (`server/index.ts`) as a Vercel serverless function, Supabase (Postgres + Google OAuth), a Cloudflare Worker with KV (`worker/worker.js`), PayHere (LKR) and Polar (USD). Production: https://scnr.tharkak.com.

**Read first:** [docs/ROADMAP.md](docs/ROADMAP.md) (what to build, phases 5–12, and the progress checklist) and [docs/README.md](docs/README.md) (how the app works). The ROADMAP's "Operating manual" is the full version of this file.

## Workflow: one phase = one branch = one PR

1. `git checkout main && git pull`, then `git checkout -b <feat|fix|chore|docs>/<name>`. Never commit to `main`.
2. Build in small commits. End each commit message with the attribution line from the session's system reminder.
3. **Tests ship with the change.**
   - Add a numbered `section()` with `check()` calls to `tests/qa.ts` for every new API behavior.
   - Worker behavior goes in section 15b (the Worker runs in-process with a fake KV).
   - Pure logic gets an assert-based self-check at the bottom of its file (see `src/lib/guestPage.ts`, `csv.ts`, `digest.ts`); run it with `npx tsx <file>`.
4. **Docs ship with the change.** Update the matching `docs/01–11`, add an entry to `docs/CHANGELOG.md`, update `docs/README.md` for new pages, and tick the ROADMAP checklist.
5. **Schema change?** Add an idempotent `db/migrations/00N_<name>.sql`, mirror the end state into `db/schema.sql`, run `node scripts/build-db-dump.mjs` (rebuilds `db/full-setup.sql`, the one-paste setup for a new project), then **stop**. The user must paste the file into the Supabase SQL editor. CI runs QA against the real database, so the PR cannot go green before that. Wait for "done".
6. Before pushing, all green: `npm run lint`, `node scripts/check-server-imports.mjs`, `node scripts/build-db-dump.mjs --check` (fails if `db/schema.sql` lacks anything a migration adds, or `db/full-setup.sql` is stale), the self-checks you touched, and `tests/qa.ts` (see below).
7. `git push -u origin <branch>`, `gh pr create --base main` (end the body with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`), `gh pr checks <n> --watch`, then `gh pr merge <n> --squash --delete-branch`, then `git checkout main && git pull && git branch -D <branch>`. Never skip hooks or bypass checks.
8. If `worker/worker.js` changed: ask the user to run `cd worker && npx wrangler deploy` (cloud sessions have no Cloudflare login). Smoke test: `curl -s https://scnr.tharkak.com/api/health` → `status: ok`; a real slug → 302; `/internal/slug/x` → 401.
9. Finish by reporting what shipped and what the user must do next (migration, Worker deploy, env vars).

## What a cloud session cannot do (ask the user)

Run SQL migrations, deploy the Worker, change Cloudflare routes or DNS, change Vercel env vars, or read the local `.env`. Merging to `main` deploys the web app on Vercel automatically.

## Running QA

CI (`.github/workflows/api-qa.yml`) runs it against the real Supabase project. To run it yourself you need `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `INTERNAL_SECRET`, `HASH_SALT`. If the sandbox has none, rely on CI and say so in the PR.

```
export PAYHERE_MERCHANT_ID=qa-merchant PAYHERE_SECRET=qa-secret \
  POLAR_WEBHOOK_SECRET=qa-polar-secret POLAR_PRODUCT_PRO_MONTHLY=prod_qa_pro_monthly \
  CRON_SECRET=qa-cron-secret ADMIN_EMAILS=qa-templates-admin@test.dynamicqr.local OPENAI_API_KEY=qa-openai-key OPENAI_BASE_URL=http://localhost:3101/v1 AI_RATE_MAX=500 RATE_LIMIT_MAX=5000 RATE_LIMIT_WRITE_MAX=1000 \
  NODE_ENV=test APP_URL=http://localhost:3100 PORT=3100
npx tsx server/index.ts &
QA_API_URL=http://localhost:3100 npx tsx tests/qa.ts
```

Without those variables the billing checks fail with 500/401; that is the environment, not a regression. Kill the server afterwards: a leftover server on the port makes the next run hit stale code. QA users (`qa-*@test.dynamicqr.local`) are swept after 1 hour and deleted at the end of every run.

## Code rules

- **Ponytail style:** the shortest working diff. Reuse an existing helper before writing one; prefer stdlib, native browser features and DB constraints; no abstraction for a single use. Mark a deliberate corner with a `ponytail:` comment that names the ceiling and the upgrade path. Never cut corners on input validation, security or data loss.
- **Vercel runs the server as Node ESM.** Relative imports in the server graph (`api/index.ts` → `server/index.ts` → `src/lib/*`) must end in `.js`. `scripts/check-server-imports.mjs` enforces this.
- Code shared by the browser and the server reads env as `typeof import.meta.env !== 'undefined' && import.meta.env.VITE_X` (a full static access, or Vite will not inline it).
- **Never put a secret in a `VITE_*` variable**; Vite inlines those into the public bundle. New env variables go into `docs/10-operations.md` and `.env.example`; if QA needs one, add a dummy to the CI workflow.
- All plan limits live in `src/lib/plans.ts` and all prices in `PRICES`. Nothing else hard-codes a limit.
- The Supabase service role bypasses RLS. New tables enable RLS **with no policies** (deny-all for the public anon key).
- Every dynamic-code edit calls `purgeEdge(slug)`. Every grant of paid state goes through `applyPayment()`.
- Escape user content in HTML with `esc`, and pass every user URL through `safeUrl`.
- Every new object is a row in `qr_codes` (reuse the slug, Worker gates, `record_scan`, caps, API, bulk).
- Docs, commit messages and PR text are plain English prose.
- Line endings: files are CRLF on the owner's Windows machine and LF in Linux sessions. Do not mass-convert files inside a feature PR.

## Subagents and skills

Use agents to parallelize **independent** work.
- `Explore` agents (up to 3 in parallel, read-only) to locate code before a phase.
- A `Plan` agent when the shape of a phase is uncertain.
- Builder agents for independent slices (for example the Worker change, a UI page, a QA section), each in its own worktree (`isolation: "worktree"`). Split by **file ownership**. The main session owns the shared files (`plans.ts`, `tests/qa.ts`, `server/index.ts`, `worker.js`, docs) and merges the slices onto the phase branch.
- `/code-review` or the `caveman:cavecrew-reviewer` agent on the diff before opening the PR; fix the findings.
- Skills when installed: `ponytail:ponytail` (build style, level `full`), `browser-automation` (drive and screenshot the running app after UI changes), `graphify`. If a skill is missing, follow the rules in this file.

## Definition of done (per phase)

- [ ] One branch from fresh `main`; one PR; squash merged; branch deleted locally and on GitHub.
- [ ] New `tests/qa.ts` section(s) and `src/lib` self-checks pass.
- [ ] Docs, CHANGELOG and ROADMAP checklist updated.
- [ ] Migration added, mirrored in `db/schema.sql`, and run by the user before merge.
- [ ] CI green (QA + Vercel preview); production smoke test passes; Worker redeployed if it changed.
