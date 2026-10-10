-- Phase 0: close open RLS, make billing idempotent.
-- Run once in the Supabase SQL editor. Safe to re-run.

-- 1. RLS: the backend uses the service-role key, which bypasses RLS.
--    These "for all using (true)" policies had no `to service_role`, so they
--    granted anon + authenticated full read/write. With no policy, RLS denies.
drop policy if exists "Service role full access qr_codes"        on public.qr_codes;
drop policy if exists "Service role full access qr_stats"        on public.qr_stats;
drop policy if exists "Service role full access scan_events"     on public.scan_events;
drop policy if exists "Service role full access subscriptions"   on public.subscriptions;
drop policy if exists "Service role full access addon_purchases" on public.addon_purchases;

-- 2. Profiles: users must not write their own plan. The SPA only reads; writes go via the API.
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Users can insert own profile" on public.profiles;

-- 3. Subscriptions: pending orders + one row per provider payment (idempotency by constraint).
alter table public.subscriptions
  add column if not exists interval   text,
  add column if not exists payment_id text,
  add column if not exists provider   text not null default 'payhere',
  add column if not exists currency   text not null default 'USD';

create unique index if not exists subscriptions_provider_payment_id_key
  on public.subscriptions(provider, payment_id);
create index if not exists subscriptions_order_id_idx
  on public.subscriptions(order_id);
