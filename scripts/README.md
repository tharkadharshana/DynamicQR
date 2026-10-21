# scripts/

CI guards, run from the repo root:

- `check-server-imports.mjs`: fails when a relative import in the server graph (`api/index.ts` and everything it reaches) lacks a `.js` extension. Vercel's Node ESM would crash on it; `tsx` and Vite hide the mistake locally.
- `check-bundle.mjs`: fails the build when a JS chunk grows past its budget.
