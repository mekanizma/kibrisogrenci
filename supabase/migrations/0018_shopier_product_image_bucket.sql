-- ===========================================================================
-- 0018_shopier_product_image_bucket.sql
-- Public asset used as Shopier product thumbnail (Shopier rehosts by URL fetch;
-- Cloudflare-protected site logos often fail that fetch → broken checkout image).
-- ===========================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'public-assets',
  'public-assets',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Public read for objects in this bucket
drop policy if exists public_assets_read on storage.objects;
create policy public_assets_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'public-assets');
