-- Phase 2: activation events (funnel: created → printed → first scan → offer changed → paid).
-- Run once in the Supabase SQL editor. Safe to re-run.

create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  uid         uuid not null references public.profiles(id) on delete cascade,
  name        text not null,   -- qr_created | print_opened | first_scan | offer_changed | paid
  slug        text,
  created_at  timestamptz not null default now()
);

create index if not exists events_uid_idx  on public.events(uid);
create index if not exists events_name_idx on public.events(name, created_at desc);

-- RLS on, no policies: only the API (service role) reads or writes.
alter table public.events enable row level security;
