-- Phase 6: more code types (PDF, GS1, events, app links) and saved brand style.
-- Run once in the Supabase SQL editor. Safe to re-run.

-- GS1 Digital Link: one code per GTIN-14 (/01/<gtin> on the short domain resolves to it).
alter table public.qr_codes add column if not exists gtin text;
create unique index if not exists qr_codes_gtin_key on public.qr_codes(gtin) where gtin is not null;

-- "Save as my default" design for new codes.
alter table public.profiles add column if not exists brand_style jsonb;

-- Uploads (PDF codes now, page images in Phase 7). Public read so a scan opens the file directly;
-- writes only through signed upload URLs that the API creates with the service role.
-- 100 MB is the hard cap (Business); smaller plans are checked by the API before it signs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('files', 'files', true, 104857600, array['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
