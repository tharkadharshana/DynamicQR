-- Phase 8: short links and organisation. Tags on any code; folders stay the existing qr_codes.client column.
-- Run once in the Supabase SQL editor. Safe to re-run.
alter table public.qr_codes add column if not exists tags text[] not null default '{}';
create index if not exists qr_codes_tags_idx on public.qr_codes using gin (tags);
