-- Phase 4: Team plan features — seats, API keys, custom domain, client folders, white-label reports.
-- Run once in the Supabase SQL editor. Safe to re-run.

-- Team seats: the owner invites by email; the invite is claimed on the member's first sign-in.
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

-- API keys: shown once, stored as SHA-256.
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

-- One custom short domain per Team account (Cloudflare for SaaS custom hostname).
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

-- Client folders (printers/agencies) and white-label report branding.
alter table public.qr_codes  add column if not exists client text;
create index if not exists qr_codes_client_idx on public.qr_codes(user_uid, client);
alter table public.profiles
  add column if not exists agency_name text,
  add column if not exists agency_logo text;   -- small data URL (<= 64 KB), shown on printed reports
