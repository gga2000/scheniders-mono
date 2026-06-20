-- =============================================
-- FEATURE: photo reviews — review-photos storage bucket
--
-- Public-read bucket for customer review images. Uploads happen ONLY through
-- the trusted /api/reviews route (service role, which bypasses storage RLS), so
-- there is no anon write policy. Public bucket → images are readable by URL on
-- the storefront PDP. Hard-capped to 5 MB and image mime types.
-- =============================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'review-photos',
    'review-photos',
    true,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
    SET public = EXCLUDED.public,
        file_size_limit = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;
