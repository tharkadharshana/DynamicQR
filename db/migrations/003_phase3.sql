-- Phase 3: atomic scan recording, real per-day uniques, hour-of-day counts, digest opt-out.
-- Requires 002_phase2.sql (events). Run once in the Supabase SQL editor. Safe to re-run.

alter table public.qr_stats
  add column if not exists days_unique jsonb not null default '{}'::jsonb,  -- { "2026-10-11": 9 }
  add column if not exists hours       jsonb not null default '{}'::jsonb;  -- { "19": 40 } (UTC hour)

alter table public.profiles
  add column if not exists digest_opt_out boolean not null default false;

-- { "k": n } → { "k": n + 1 }
create or replace function public.jsonb_inc(j jsonb, k text)
returns jsonb language sql immutable as $$
  select jsonb_set(coalesce(j, '{}'::jsonb), array[k], to_jsonb(coalesce((j ->> k)::int, 0) + 1))
$$;

-- One call per scan: event row + every counter, in one transaction (no lost increments).
create or replace function public.record_scan(
  p_slug text, p_owner uuid, p_country text, p_device text, p_browser text, p_os text,
  p_referer text, p_is_unique boolean, p_failed boolean
) returns void
language plpgsql security definer set search_path = public as $$
declare
  d text := to_char(now() at time zone 'utc', 'YYYY-MM-DD');
  m text := to_char(now() at time zone 'utc', 'YYYY-MM');
  h text := extract(hour from now() at time zone 'utc')::int::text;
  c text := coalesce(nullif(p_country, ''), 'Unknown');
  first_scan boolean;
begin
  insert into scan_events (slug, country, device, browser, os, referer, is_unique)
  values (p_slug, c, p_device, p_browser, p_os, nullif(p_referer, ''), p_is_unique);

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

-- Only the API (service role) may call these through PostgREST; never the public anon key.
revoke all on function public.record_scan(text, uuid, text, text, text, text, text, boolean, boolean) from public, anon, authenticated;
revoke all on function public.jsonb_inc(jsonb, text) from public, anon, authenticated;
grant execute on function public.record_scan(text, uuid, text, text, text, text, text, boolean, boolean) to service_role;
grant execute on function public.jsonb_inc(jsonb, text) to service_role;
