# db/

- `schema.sql`: the full end-state schema. Use it for a brand-new Supabase project.
- `migrations/`: incremental, idempotent files (`001_...` to `011_...`). On an existing project, run the ones you have not applied, in order, in the Supabase SQL editor. Add the next number for every schema change and mirror the end state into `schema.sql`.
- `queries.sql`: saved analysis queries (for example the activation funnel).

New tables enable row level security with no policies: the API uses the service-role key, which bypasses RLS, and the public anon key gets nothing.

Details: [docs/05-data-model.md](../docs/05-data-model.md).
