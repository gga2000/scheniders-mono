-- tenant_assets_drop_svg_mime (header and rollback notes: packages/supabase/tests/p1_db_security_holes.sql).
-- tenant-assets bucket no longer accepts SVG uploads.
UPDATE storage.buckets
   SET allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp']
 WHERE id = 'tenant-assets';
