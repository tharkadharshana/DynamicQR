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
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- ──────────────────────────────────────────────────────────────
-- 2. QR_CODES (replaces Firestore 'qr_codes' collection)
-- ──────────────────────────────────────────────────────────────
create table if not exists public.qr_codes (
  slug                text primary key,
  user_uid            uuid not null references public.profiles(id) on delete cascade,
  title               text,
  destination_url     text,
  qr_type             text not null default 'url',
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

alter table public.qr_codes enable row level security;

-- Backend (service role) can do anything
-- Frontend clients are NOT expected to call Supabase directly for QR data — all goes via backend API
create policy "Service role full access qr_codes"
  on public.qr_codes for all
  using (true)
  with check (true);

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
  updated_at    timestamptz not null default now()
);

alter table public.qr_stats enable row level security;

create policy "Service role full access qr_stats"
  on public.qr_stats for all
  using (true)
  with check (true);

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
  is_unique   boolean not null default false
);

create index if not exists scan_events_slug_idx on public.scan_events(slug);
create index if not exists scan_events_scanned_at_idx on public.scan_events(scanned_at desc);

alter table public.scan_events enable row level security;

create policy "Service role full access scan_events"
  on public.scan_events for all
  using (true)
  with check (true);

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
  status      text not null default 'active',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists subscriptions_uid_idx on public.subscriptions(uid);

alter table public.subscriptions enable row level security;

create policy "Service role full access subscriptions"
  on public.subscriptions for all
  using (true)
  with check (true);

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

create policy "Service role full access addon_purchases"
  on public.addon_purchases for all
  using (true)
  with check (true);
