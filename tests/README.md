# tests/

`qa.ts` is the end-to-end suite. It creates a throwaway user, drives the API, runs `worker/worker.js` in-process against it with an in-memory KV, and deletes everything it created. It also sweeps leftover `qa-*@test.dynamicqr.local` users older than one hour.

Run it against a running server (see the QA recipe in [CLAUDE.md](../CLAUDE.md)):

```bash
QA_API_URL=http://localhost:3100 npx tsx tests/qa.ts
```

CI runs it on every push and pull request against the real Supabase project. Add a numbered `section()` with `check()` calls for every new API or Worker behaviour. Pure logic in `src/lib` carries its own assert-based self-check at the bottom of the file (`npx tsx src/lib/<file>.ts`).
