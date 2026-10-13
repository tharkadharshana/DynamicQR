-- Phase 9: Forms. One row per submission; the definition lives in qr_codes.content_data (qr_type 'form').
-- Run once in the Supabase SQL editor. Safe to re-run.
create table if not exists public.form_submissions (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null references public.qr_codes(slug) on delete cascade,
  data        jsonb not null default '{}'::jsonb,
  ip_hash     text,                     -- the Worker's daily, salted visitor hash; never the IP
  created_at  timestamptz not null default now()
);
create index if not exists form_submissions_slug_created_idx on public.form_submissions(slug, created_at desc);

-- No policies: RLS denies anon/authenticated. The API uses the service-role key, which bypasses RLS.
alter table public.form_submissions enable row level security;
