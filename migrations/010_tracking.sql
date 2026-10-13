-- Phase 10: advanced tracking (city, language, referrer domain, opt-in GPS).
-- Run once in the Supabase SQL editor. Safe to re-run. Requires 003 (jsonb_inc, record_scan).

alter table public.scan_events
  add column if not exists lang text,              -- primary Accept-Language subtag, e.g. 'si'
  add column if not exists lat  double precision,  -- opt-in GPS, rounded to 3 decimals (~100 m)
  add column if not exists lng  double precision;

-- The map reads only rows with a fix.
create index if not exists scan_events_geo_idx on public.scan_events(slug, scanned_at desc) where lat is not null;

alter table public.qr_stats
  add column if not exists cities    jsonb not null default '{}'::jsonb,  -- { "Colombo": 40 }
  add column if not exists languages jsonb not null default '{}'::jsonb,  -- { "si": 12 }
  add column if not exists referrers jsonb not null default '{}'::jsonb;  -- { "instagram.com": 7 }

-- record_scan with the new fields. The 9-argument version from 003 stays, so the deployed API keeps
-- recording scans between running this file and deploying the new code. No defaults on the new
-- arguments: PostgREST must never find two candidates for one call.
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
