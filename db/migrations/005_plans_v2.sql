-- Phase 5: Plans v2 (Business tier and per-object limits).
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- profiles.plan and subscriptions.plan have no CHECK constraint, so 'business' needs no schema change.
-- Short links are qr_codes rows with kind='link' (no QR image, counted against the short_links cap).
alter table public.qr_codes add column if not exists kind text not null default 'qr';
alter table public.qr_codes drop constraint if exists qr_codes_kind_check;
alter table public.qr_codes add constraint qr_codes_kind_check check (kind in ('qr', 'link'));
