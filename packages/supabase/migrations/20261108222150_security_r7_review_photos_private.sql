-- Security wave 7 (C-05, Ali 2026-11-08: "review photos hidden until approved").
-- A shopper's upload used to get a public link the moment it was stored, so
-- an unmoderated photo was reachable before the merchant saw it. The bucket
-- is now private: the store shows a photo only through its own route, which
-- checks the review is approved, and store staff read pending photos through
-- short signed links under the policy below.
UPDATE storage.buckets SET public = false WHERE id = 'review-photos';

ALTER TABLE public.product_reviews
    ADD COLUMN IF NOT EXISTS photo_paths text[] NOT NULL DEFAULT '{}';
COMMENT ON COLUMN public.product_reviews.photo_paths IS
    'Object paths in the private review-photos bucket (<tenant_id>/<product_id>/<uuid>.<ext>). photo_urls holds the store route links that serve them once approved.';

DROP POLICY IF EXISTS review_photos_staff_read ON storage.objects;
CREATE POLICY review_photos_staff_read ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'review-photos'
        AND (storage.foldername(name))[1] IN (
            SELECT t::text FROM public.get_user_tenant_ids() AS t
        )
    );
