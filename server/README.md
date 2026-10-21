# server/

The Express API. It runs as one Vercel serverless function (`api/index.ts` re-exports the app) and locally with `npm run dev`.

- `index.ts` holds every route: auth, QR codes, analytics, billing (PayHere and Polar), forms, webhooks, workspaces, API keys, crons, and the `/internal/*` routes the Cloudflare Worker calls.
- `logger.ts` is the Winston logger.

Rules:
- Relative imports must end in `.js` (Vercel runs this as Node ESM). `npm run` checks it with `scripts/check-server-imports.mjs` in CI.
- Plan limits and prices come from `src/lib/plans.ts`; never hard-code them here.
- Every grant of paid state goes through `applyPayment()`; every edit of a dynamic code calls `purgeEdge(slug)`.

Details: [docs/04-backend-api-reference.md](../docs/04-backend-api-reference.md), [docs/07-plans-billing-payhere.md](../docs/07-plans-billing-payhere.md), [docs/09-security.md](../docs/09-security.md).
