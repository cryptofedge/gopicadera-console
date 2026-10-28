-- ============================================================================
-- Creating ads from the console: where their images and videos live, and where
-- they are aimed.
--
-- Run after ads_sync.sql. Safe to run more than once.
-- ============================================================================

-- Ad images (Meta) and videos (TikTok), uploaded from the Promoción form. Public
-- to read -- the platforms fetch them by URL -- and only an owner may add,
-- replace or remove one, the same rule as dish photos in integrations.sql.
insert into storage.buckets (id, name, public)
values ('ads', 'ads', true)
on conflict (id) do nothing;

drop policy if exists "ad media is public" on storage.objects;
create policy "ad media is public"
  on storage.objects for select
  using (bucket_id = 'ads');

drop policy if exists "owner uploads ad media" on storage.objects;
create policy "owner uploads ad media"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'ads' and is_owner());

drop policy if exists "owner replaces ad media" on storage.objects;
create policy "owner replaces ad media"
  on storage.objects for update to authenticated
  using (bucket_id = 'ads' and is_owner());

drop policy if exists "owner deletes ad media" on storage.objects;
create policy "owner deletes ad media"
  on storage.objects for delete to authenticated
  using (bucket_id = 'ads' and is_owner());

-- Where ads point and who they reach, editable in Ajustes. The coordinates are
-- 4820 4th Ave, Sunset Park, as OpenStreetMap geocodes it (looked up 2026-10-28).
-- TikTok targets by its own location ids rather than a radius; they are filled
-- in once from TikTok Ads Manager and launches on TikTok refuse until they are.
insert into settings (key, value) values ('ads_targeting', jsonb_build_object(
  'lat', 40.6473819,
  'lng', -74.0121613,
  'radius_mi', 3,
  'destination_url', 'https://gopicadera.com',
  'tiktok_location_ids', '[]'::jsonb
))
on conflict (key) do nothing;
