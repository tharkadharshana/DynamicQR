-- ============================================================
-- Scnr Supabase Schema
-- Run this in the Supabase SQL Editor before deploying.
-- ============================================================

-- Enable UUID extension
create extension if not exists "pgcrypto";

-- ──────────────────────────────────────────────────────────────
-- 1. PROFILES (replaces Firestore 'users' collection)
-- ──────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text,
  plan          text not null default 'free',
  plan_expires_at timestamptz,
  plan_since    text,
  is_trial      boolean not null default true,
  trial_expires_at timestamptz,
  addons        jsonb not null default '{"extra_scans":0,"extra_qr_codes":0,"custom_domain":false,"api_access":false}'::jsonb,
  company       text default '',
  job_title     text default '',
  country       text default 'LK',
  timezone      text default 'Asia/Colombo',
  monthly_scans jsonb default '{}'::jsonb,
  payhere_order_id text,
  brand_style   jsonb,  -- saved default design for new codes (migration 006)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- No insert/update policies: profiles are written only by the API (service role).

-- ──────────────────────────────────────────────────────────────
-- 2. QR_CODES (replaces Firestore 'qr_codes' collection)
-- ──────────────────────────────────────────────────────────────
create table if not exists public.qr_codes (
  slug                text primary key,
  user_uid            uuid not null references public.profiles(id) on delete cascade,
  title               text,
  destination_url     text,
  qr_type             text not null default 'url',
  kind                text not null default 'qr' check (kind in ('qr', 'link')),  -- 'link' = short link (migration 005)
  gtin                text,  -- GS1 GTIN-14, unique when set (migration 006)
  tags                text[] not null default '{}',  -- lower-case labels (migration 008)
  workspace_id        uuid,  -- → workspaces(id) on delete set null; null = default workspace (migration 011)
  domain              text,  -- the verified custom domain this code prints with (migration 011)
  is_dynamic          boolean not null default true,
  is_active           boolean not null default true,
  content_data        jsonb default '{}'::jsonb,
  style               jsonb default '{}'::jsonb,
  password_hash       text,
  expiry_date         text,
  rate_limit          jsonb default '{"enabled":false,"max_scans":100,"period":"total"}'::jsonb,
  visitor_rate_limit  integer default 5,
  visitor_rate_period integer default 3600,
  qr_image_url        text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists qr_codes_user_uid_idx on public.qr_codes(user_uid);
create index if not exists qr_codes_tags_idx on public.qr_codes using gin (tags);
create unique index if not exists qr_codes_gtin_key on public.qr_codes(gtin) where gtin is not null;

alter table public.qr_codes enable row level security;

-- No policies: RLS denies anon/authenticated. The API uses the service-role key, which bypasses RLS.

-- ──────────────────────────────────────────────────────────────
-- 3. QR_STATS (replaces Firestore 'qr_stats' collection)
-- ──────────────────────────────────────────────────────────────
create table if not exists public.qr_stats (
  slug          text primary key references public.qr_codes(slug) on delete cascade,
  total_scans   integer not null default 0,
  unique_scans  integer not null default 0,
  -- JSONB maps for compatibility with existing frontend:
  -- days: { "2025-01-01": { total: 5, unique: 3 } }
  -- countries: { "US": 10, "LK": 4 }
  -- browsers: { "Chrome": 8 }
  -- os: { "Android": 12 }
  -- devices: { "mobile": 10 }
  days          jsonb not null default '{}'::jsonb,
  countries     jsonb not null default '{}'::jsonb,
  browsers      jsonb not null default '{}'::jsonb,
  os            jsonb not null default '{}'::jsonb,
  devices       jsonb not null default '{}'::jsonb,
  monthly_scans jsonb not null default '{}'::jsonb,
  clicks        jsonb not null default '{}'::jsonb,  -- Pages link clicks { "2": 14, "1-0": 3 } (migration 007)
  cities        jsonb not null default '{}'::jsonb,  -- migration 010: { "Colombo": 40 }
  languages     jsonb not null default '{}'::jsonb,  -- { "si": 12 }
  referrers     jsonb not null default '{}'::jsonb,  -- { "instagram.com": 7 }
  updated_at    timestamptz not null default now()
);

alter table public.qr_stats enable row level security;

-- No policies: RLS denies anon/authenticated. The API uses the service-role key, which bypasses RLS.

-- ──────────────────────────────────────────────────────────────
-- 4. SCAN_EVENTS (replaces Firestore 'scan_events' collection)
-- ──────────────────────────────────────────────────────────────
create table if not exists public.scan_events (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null references public.qr_codes(slug) on delete cascade,
  scanned_at  timestamptz not null default now(),
  country     text,
  city        text,
  device      text,
  os          text,
  browser     text,
  referer     text,
  ip_hash     text,
  is_unique   boolean not null default false,
  lang        text,              -- migration 010
  lat         double precision,  -- opt-in GPS, 3 decimals (migration 010)
  lng         double precision
);

create index if not exists scan_events_slug_idx on public.scan_events(slug);
create index if not exists scan_events_scanned_at_idx on public.scan_events(scanned_at desc);
create index if not exists scan_events_geo_idx on public.scan_events(slug, scanned_at desc) where lat is not null;  -- migration 010

alter table public.scan_events enable row level security;

-- No policies: RLS denies anon/authenticated. The API uses the service-role key, which bypasses RLS.

-- ──────────────────────────────────────────────────────────────
-- 5. SUBSCRIPTIONS (replaces Firestore 'subscriptions' collection)
-- ──────────────────────────────────────────────────────────────
create table if not exists public.subscriptions (
  id          uuid primary key default gen_random_uuid(),
  uid         uuid not null references public.profiles(id) on delete cascade,
  plan        text not null,
  order_id    text,
  amount      text,
  expires_at  timestamptz,
  status      text not null default 'active',  -- pending | active | failed | cancelled | chargeback
  interval    text,                             -- monthly | annual
  payment_id  text,                             -- provider payment id; unique per provider
  provider    text not null default 'payhere',  -- payhere | polar
  currency    text not null default 'USD',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists subscriptions_uid_idx on public.subscriptions(uid);
create index if not exists subscriptions_order_id_idx on public.subscriptions(order_id);
create unique index if not exists subscriptions_provider_payment_id_key on public.subscriptions(provider, payment_id);

alter table public.subscriptions enable row level security;

-- No policies: RLS denies anon/authenticated. The API uses the service-role key, which bypasses RLS.

-- ──────────────────────────────────────────────────────────────
-- 6. ADDON_PURCHASES (replaces Firestore 'addon_purchases' collection)
-- ──────────────────────────────────────────────────────────────
create table if not exists public.addon_purchases (
  id          uuid primary key default gen_random_uuid(),
  uid         uuid not null references public.profiles(id) on delete cascade,
  addon_id    text not null,
  order_id    text,
  amount      text,
  created_at  timestamptz not null default now()
);

alter table public.addon_purchases enable row level security;

-- No policies: RLS denies anon/authenticated. The API uses the service-role key, which bypasses RLS.

-- ──────────────────────────────────────────────────────────────
-- STORAGE: uploads (migration 006). Public read; writes only via API-signed upload URLs.
-- ──────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('files', 'files', true, 104857600, array['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ──────────────────────────────────────────────────────────────
-- record_click (migration 007; needs jsonb_inc from migration 003)
-- ──────────────────────────────────────────────────────────────
create or replace function public.record_click(p_slug text, p_key text)
returns void language sql security definer set search_path = public as $$
  update qr_stats set clicks = jsonb_inc(clicks, p_key), updated_at = now() where slug = p_slug;
$$;
revoke all on function public.record_click(text, text) from public, anon, authenticated;
grant execute on function public.record_click(text, text) to service_role;

-- ──────────────────────────────────────────────────────────────
-- FORM_SUBMISSIONS (migration 009). The definition is qr_codes.content_data of a qr_type 'form' code.
-- ──────────────────────────────────────────────────────────────
create table if not exists public.form_submissions (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null references public.qr_codes(slug) on delete cascade,
  data        jsonb not null default '{}'::jsonb,
  ip_hash     text,                     -- the Worker's daily, salted visitor hash; never the IP
  created_at  timestamptz not null default now()
);
create index if not exists form_submissions_slug_created_idx on public.form_submissions(slug, created_at desc);
alter table public.form_submissions enable row level security;
-- No policies: RLS denies anon/authenticated. The API uses the service-role key, which bypasses RLS.

-- ──────────────────────────────────────────────────────────────
-- Added by migrations 002 to 004, 010 (mirrored here so this file stays the full end state)
-- ──────────────────────────────────────────────────────────────

-- Activation events (funnel: created, printed, first scan, offer changed, paid).
create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  uid         uuid not null references public.profiles(id) on delete cascade,
  name        text not null,   -- qr_created | print_opened | first_scan | offer_changed | paid
  slug        text,
  created_at  timestamptz not null default now()
);
create index if not exists events_uid_idx  on public.events(uid);
create index if not exists events_name_idx on public.events(name, created_at desc);
alter table public.events enable row level security;

-- Real per-day uniques, hour-of-day counts, digest opt-out (003).
alter table public.qr_stats
  add column if not exists days_unique jsonb not null default '{}'::jsonb,  -- { "2026-10-11": 9 }
  add column if not exists hours       jsonb not null default '{}'::jsonb;  -- { "19": 40 } (UTC hour)
alter table public.profiles
  add column if not exists digest_opt_out boolean not null default false;

-- Team seats: the owner invites by email; the invite is claimed on the member's first sign-in (004).
create table if not exists public.workspace_members (
  id            uuid primary key default gen_random_uuid(),
  owner_uid     uuid not null references public.profiles(id) on delete cascade,
  member_email  text not null,
  member_uid    uuid references auth.users(id) on delete cascade,
  role          text not null default 'editor',
  created_at    timestamptz not null default now(),
  unique (owner_uid, member_email)
);
create index if not exists workspace_members_member_uid_idx on public.workspace_members(member_uid);
create index if not exists workspace_members_email_idx on public.workspace_members(lower(member_email));
alter table public.workspace_members enable row level security;

-- API keys: shown once, stored as SHA-256 (004).
create table if not exists public.api_keys (
  id            uuid primary key default gen_random_uuid(),
  uid           uuid not null references public.profiles(id) on delete cascade,
  name          text not null default 'API key',
  prefix        text not null,             -- first characters, for display
  key_hash      text not null unique,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz
);
create index if not exists api_keys_uid_idx on public.api_keys(uid);
alter table public.api_keys enable row level security;

-- Custom short domains (Cloudflare for SaaS custom hostnames) (004; several per account since 011).
create table if not exists public.custom_domains (
  id            uuid primary key default gen_random_uuid(),
  uid           uuid not null references public.profiles(id) on delete cascade,
  hostname      text not null unique,
  cf_id         text,
  status        text not null default 'pending',   -- pending | active | failed
  created_at    timestamptz not null default now()
);
create index if not exists custom_domains_uid_idx on public.custom_domains(uid);
alter table public.custom_domains enable row level security;

-- Client folders (printers/agencies) and white-label report branding (004).
alter table public.qr_codes  add column if not exists client text;
create index if not exists qr_codes_client_idx on public.qr_codes(user_uid, client);
alter table public.profiles
  add column if not exists agency_name text,
  add column if not exists agency_logo text;   -- small data URL (<= 64 KB), shown on printed reports
-- No policies on the tables above: RLS denies anon/authenticated; the API uses the service-role key.

-- { "k": n } becomes { "k": n + 1 } (003)
create or replace function public.jsonb_inc(j jsonb, k text)
returns jsonb language sql immutable as $$
  select jsonb_set(coalesce(j, '{}'::jsonb), array[k], to_jsonb(coalesce((j ->> k)::int, 0) + 1))
$$;

-- One call per scan: event row plus every counter, in one transaction (003, extended by 010).
-- No defaults on the arguments: PostgREST must never find two candidates for one call.
create or replace function public.record_scan(
  p_slug text, p_owner uuid, p_country text, p_device text, p_browser text, p_os text,
  p_referer text, p_is_unique boolean, p_failed boolean,
  p_id uuid, p_city text, p_lang text, p_ref_host text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  d text := to_char(now() at time zone 'utc', 'YYYY-MM-DD');
  m text := to_char(now() at time zone 'utc', 'YYYY-MM');
  h text := extract(hour from now() at time zone 'utc')::int::text;
  c text := coalesce(nullif(p_country, ''), 'Unknown');
  first_scan boolean;
begin
  insert into scan_events (id, slug, country, city, device, browser, os, referer, is_unique, lang)
  values (coalesce(p_id, gen_random_uuid()), p_slug, c, nullif(p_city, ''), p_device, p_browser, p_os, nullif(p_referer, ''), p_is_unique, nullif(p_lang, ''));

  if p_failed then return; end if;  -- wrong-PIN attempts are logged, not counted

  insert into qr_stats (slug) values (p_slug) on conflict (slug) do nothing;
  update qr_stats set
    total_scans   = total_scans + 1,
    unique_scans  = unique_scans + case when p_is_unique then 1 else 0 end,
    days          = jsonb_inc(days, d),
    days_unique   = case when p_is_unique then jsonb_inc(days_unique, d) else days_unique end,
    hours         = jsonb_inc(hours, h),
    countries     = jsonb_inc(countries, c),
    browsers      = jsonb_inc(browsers, coalesce(p_browser, 'Other')),
    os            = jsonb_inc(os, coalesce(p_os, 'Unknown')),
    devices       = jsonb_inc(devices, coalesce(p_device, 'desktop')),
    monthly_scans = jsonb_inc(monthly_scans, m),
    cities        = case when coalesce(p_city, '') <> '' then jsonb_inc(cities, p_city) else cities end,
    languages     = case when coalesce(p_lang, '') <> '' then jsonb_inc(languages, p_lang) else languages end,
    referrers     = case when coalesce(p_ref_host, '') <> '' then jsonb_inc(referrers, p_ref_host) else referrers end,
    updated_at    = now()
  where slug = p_slug
  returning total_scans = 1 into first_scan;

  if p_owner is not null then
    update profiles set monthly_scans = jsonb_inc(monthly_scans, m) where id = p_owner;
    if first_scan then
      insert into events (uid, name, slug) values (p_owner, 'first_scan', p_slug);
    end if;
  end if;
end $$;

revoke all on function public.record_scan(text, uuid, text, text, text, text, text, boolean, boolean, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.record_scan(text, uuid, text, text, text, text, text, boolean, boolean, uuid, text, text, text) to service_role;

-- ──────────────────────────────────────────────────────────────
-- BUSINESS (migration 011): webhooks, workspaces. qr_codes.workspace_id / workspace_members.workspace_id
-- reference workspaces(id) (qr_codes: on delete set null; workspace_members: on delete cascade), added by the migration after workspaces exists.
-- ──────────────────────────────────────────────────────────────
create table if not exists public.webhooks (
  id                uuid primary key default gen_random_uuid(),
  uid               uuid not null references public.profiles(id) on delete cascade,
  url               text not null,
  secret            text not null,
  events            text[] not null default '{}',
  created_at        timestamptz not null default now(),
  last_status       integer,
  last_delivery_at  timestamptz
);
create index if not exists webhooks_uid_idx on public.webhooks(uid);
alter table public.webhooks enable row level security;
create table if not exists public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  owner_uid   uuid not null references public.profiles(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists workspaces_owner_idx on public.workspaces(owner_uid);
alter table public.workspaces enable row level security;

-- Workspace links (011): qr_codes.workspace_id and workspace_members.workspace_id point at workspaces once it exists.
alter table public.workspace_members add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'qr_codes_workspace_id_fkey') then
    alter table public.qr_codes add constraint qr_codes_workspace_id_fkey foreign key (workspace_id) references public.workspaces(id) on delete set null;
  end if;
end $$;
create index if not exists qr_codes_workspace_idx on public.qr_codes(workspace_id) where workspace_id is not null;

-- Page templates (Phase 13): content is a Pages-builder content_data preset. Seeded by the API on first use.
create table if not exists public.page_templates (
  id           text primary key,
  name         text not null,
  description  text not null default '',
  category     text not null,
  tags         text[] not null default '{}',
  content      jsonb not null,
  status       text not null default 'draft' check (status in ('draft', 'published')),
  sort         integer not null default 0,
  source       text not null default 'manual' check (source in ('manual', 'ai')),
  pro_only     boolean not null default false,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists page_templates_status_idx on public.page_templates(status, category, sort);
alter table public.page_templates enable row level security;
-- No policies: RLS denies anon/authenticated; the API uses the service-role key, which bypasses RLS.

-- AI cost ledger (Phase 13c): one row per provider call; cost_usd comes from the provider's reported usage and unit_prices keeps the prices used.
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

-- Hand-entered fixed monthly costs (hosting, database, email, payment fees).
create table if not exists public.cost_items (
  id          uuid primary key default gen_random_uuid(),
  month       text not null check (month ~ '^\d{4}-\d{2}$'),
  label       text not null,
  amount_usd  numeric(12, 2) not null check (amount_usd >= 0),
  created_at  timestamptz not null default now()
);
create index if not exists cost_items_month_idx on public.cost_items(month);
alter table public.cost_items enable row level security;

-- Extra monthly AI allowance for one user (USD of provider cost), on top of the plan's ai_usd.
alter table public.profiles add column if not exists ai_grant_usd numeric(10, 2) not null default 0;
-- No policies: RLS denies anon/authenticated; the API uses the service-role key, which bypasses RLS.
