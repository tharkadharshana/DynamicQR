-- Phase 11: Business tier. Webhooks, workspaces, several custom domains per account.
-- Run once in the Supabase SQL editor. Safe to re-run.

-- Webhooks: signed like Standard Webhooks with `secret`; last_status is the last HTTP status (0 = unreachable).
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

-- Workspaces: null workspace_id = the owner's default workspace, so existing rows need no backfill.
create table if not exists public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  owner_uid   uuid not null references public.profiles(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists workspaces_owner_idx on public.workspaces(owner_uid);
alter table public.workspaces enable row level security;

alter table public.qr_codes add column if not exists workspace_id uuid references public.workspaces(id) on delete set null;
create index if not exists qr_codes_workspace_idx on public.qr_codes(workspace_id) where workspace_id is not null;
-- A member invited to one workspace only sees that one; null = every workspace.
-- Deleting the workspace removes the scoped member (cascade), never widens their access to every workspace.
alter table public.workspace_members add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

-- Several custom domains per account (Pro 1, Team 10, Business 50): each code prints with one of them.
alter table public.qr_codes add column if not exists domain text;
create index if not exists custom_domains_uid_idx on public.custom_domains(uid);
-- No policies on the new tables: RLS denies anon/authenticated; the API uses the service role.
