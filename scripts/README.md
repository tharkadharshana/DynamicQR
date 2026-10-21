# scripts/

CI guards, run from the repo root:

- `check-server-imports.mjs`: fails when a relative import in the server graph (`api/index.ts` and everything it reaches) lacks a `.js` extension. Vercel's Node ESM would crash on it; `tsx` and Vite hide the mistake locally.
- `check-vercel-routes.mjs`: checks which `vercel.json` rewrite each path hits. It exists because the SPA catch-all once excluded everything starting with `api`, so a direct load of `/api-docs` returned 404.
- `check-bundle.mjs`: fails the build when a JS chunk grows past its budget.
