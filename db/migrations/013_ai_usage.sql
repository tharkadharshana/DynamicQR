-- Phase 13: AI cost ledger, hand-entered fixed costs and per-user AI grants.
-- Run once in the Supabase SQL editor. Safe to re-run.

-- One row per provider call (errors too, with cost 0 unless billed). cost_usd is computed from the provider's reported usage;
-- unit_prices keeps the prices it was computed with, so a later price change never rewrites history.
create table if not exists public.ai_usage (
  id             uuid primary key default gen_random_uuid(),
  uid            uuid not null references public.profiles(id) on delete cascade,
  kind           text not null check (kind in ('menu_generate', 'menu_import', 'image', 'template_generate')),
  model          text not null,
  quality        text,
  size           text,
  images         integer not null default 0,
  input_tokens   integer not null default 0,
  output_tokens  integer not null default 0,
  cached_tokens  integer not null default 0,
  cost_usd       numeric(12, 6) not null default 0,
  unit_prices    jsonb not null default '{}',
  status         text not null default 'ok' check (status in ('ok', 'error')),
  ref            text,
  created_at     timestamptz not null default now()
);
create index if not exists ai_usage_uid_idx on public.ai_usage(uid, created_at desc);
create index if not exists ai_usage_created_idx on public.ai_usage(created_at desc);
alter table public.ai_usage enable row level security;

-- Fixed monthly costs that are not metered per call (hosting, database, email, payment fees), entered by an admin.
create table if not exists public.cost_items (
  id          uuid primary key default gen_random_uuid(),
  month       text not null check (month ~ '^\d{4}-\d{2}$'),
  label       text not null,
  amount_usd  numeric(12, 2) not null check (amount_usd >= 0),
  created_at  timestamptz not null default now()
);
create index if not exists cost_items_month_idx on public.cost_items(month);
alter table public.cost_items enable row level security;

-- Extra monthly AI allowance for one user, in USD of provider cost, on top of the plan's ai_usd.
alter table public.profiles add column if not exists ai_grant_usd numeric(10, 2) not null default 0;
-- No policies: RLS denies anon/authenticated; the API uses the service role.
