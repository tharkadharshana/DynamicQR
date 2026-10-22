-- Phase 13: Page templates as data, so an admin (and later the AI generator) can add and edit them without a deploy.
-- Run once in the Supabase SQL editor. Safe to re-run. The API seeds the built-in templates on first use.

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
-- No policies: RLS denies anon/authenticated; the API uses the service role.
