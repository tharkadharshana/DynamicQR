# worker/

The Cloudflare Worker that fronts `scnr.tharkak.com`. It decides what a scan does: it reads the code's config from KV (falling back to the API's `/internal/slug/:slug`), applies the gates (active, expiry, quota, PIN, scan limit, Visitor Guard, pause), then redirects or serves a hosted page. Everything that is not a code is passed through to the web app.

Deploy: `cd worker && npx wrangler deploy`. Secrets (`API_URL`, `INTERNAL_SECRET`, `HASH_SALT`) are set with `wrangler secret put`; `MAIN_HOST` and the KV binding live in `wrangler.toml`. The route `scnr.tharkak.com/*` is attached in the Cloudflare dashboard. Details: [docs/03-scan-flow-and-gate-engine.md](../docs/03-scan-flow-and-gate-engine.md) and [docs/10-operations.md](../docs/10-operations.md).

It imports pure code from `../src/lib`, which is bundled in at deploy time.
