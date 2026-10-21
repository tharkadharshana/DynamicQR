-- Phase 7: Pages builder. Clicks per tracked link ("Engagements").
-- Run once in the Supabase SQL editor. Safe to re-run. Requires 003 (jsonb_inc).

alter table public.qr_stats add column if not exists clicks jsonb not null default '{}'::jsonb;  -- { "2": 14, "1-0": 3 }

-- One call per click on /<slug>/l/<key>. Not a scan: totals, uniques and the monthly quota are untouched.
create or replace function public.record_click(p_slug text, p_key text)
returns void language sql security definer set search_path = public as $$
  update qr_stats set clicks = jsonb_inc(clicks, p_key), updated_at = now() where slug = p_slug;
$$;

revoke all on function public.record_click(text, text) from public, anon, authenticated;
grant execute on function public.record_click(text, text) to service_role;
