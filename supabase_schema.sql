-- ============================================================
-- DynamicQR Supabase Schema
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

-- record_scan: see migrations 003 and 010 (the 13-argument version records city, language, referrer domain and the event id).

-- ──────────────────────────────────────────────────────────────
-- BUSINESS (migration 011): webhooks, workspaces. qr_codes.workspace_id / workspace_members.workspace_id
-- reference workspaces(id) on delete set null (added by the migration after workspaces exists).
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
