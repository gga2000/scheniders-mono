
-- Create public bucket for tenant assets (logos, etc.)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'tenant-assets',
    'tenant-assets',
    true,
    524288, -- 512KB max
    ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- RLS: Authenticated users can upload to their tenant's folder
CREATE POLICY "Tenant members can upload assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'tenant-assets'
    AND (storage.foldername(name))[1] IN (SELECT get_user_tenant_ids()::text)
);

-- RLS: Anyone can read (public bucket)
CREATE POLICY "Public read tenant assets"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'tenant-assets');

-- RLS: Tenant members can delete their own assets
CREATE POLICY "Tenant members can delete assets"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'tenant-assets'
    AND (storage.foldername(name))[1] IN (SELECT get_user_tenant_ids()::text)
);
;
