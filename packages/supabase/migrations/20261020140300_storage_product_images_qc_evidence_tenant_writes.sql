-- Storage: tenant-scoped writes on product-images and qc-evidence (2026-10-20).
--
-- FIXES  NEW-P1-04 (P0) = SEC-02 / SEC-06, prod-readiness B-07, F-07, F-23,
--        N-5 (audit-final/REGRESSION.md, D-04, D-05).
--
-- WHY (live storage.objects policies, 2026-10-20)
--   product-images  "Allow Uploads to Product Images"   INSERT TO public  bucket_id only
--                   "Allow Updates to Product Images"   UPDATE TO public  bucket_id only
--                   "Allow Deletions for Product Images" DELETE TO public  bucket_id only
--     -> anyone with the public anon key can upload, overwrite or delete any
--        tenant's product images.
--   qc-evidence     "Authenticated delete qc-evidence"  DELETE TO authenticated  bucket_id only
--                   "Authenticated upload to qc-evidence" INSERT TO authenticated bucket_id only
--     -> any signed-up user (any tenant, or none) can delete any tenant's QC
--        evidence or upload into it. The bucket has no size or MIME limit.
--
-- PATH CONVENTIONS THE UPLOAD CODE USES TODAY (read, not changed)
--   product-images (apps/platform):
--     products/<productId|temp>-<ts>.<ext>      product-image-upload.tsx, use-products-crud.ts
--     gallery/<productId>/<ts>.<ext>            product-gallery-section.tsx (delete: use-product-images-query.ts)
--     digital/<productId|temp>/<ts>.<ext>       editor/digital-fields-section.tsx
--     note-cards/<productId|temp>/<ts>.<ext>    editor/note-cards-tab.tsx
--     (several use upsert: true, so INSERT and UPDATE are both exercised)
--   qc-evidence:
--     <qcItemId>/<ts>-<rand>.<ext>              products/qc/qc-photo-uploader.tsx (qc_quarantine.id)
--   Live objects match: product-images 76 gallery/ + 46 products/; qc-evidence 1
--   object under a qc_quarantine id.
--   None of these paths carries the tenant id, so the unapplied
--   20260518000003_storage_lockdown.sql (tenant-id first folder) would reject
--   every current upload. Instead the tenant is derived from the row the path
--   names: products.tenant_id for a product id, qc_quarantine.tenant_id for a
--   QC item id. A "temp" path (a product not saved yet) has no tenant, so it
--   is writable only by its own uploader (owner_id) while they are an active
--   member of some tenant.
--
-- WHAT THIS CHANGES
--   * public.storage_object_writable(bucket, name, owner_id): SECURITY DEFINER
--     boolean, TRUE when the caller is an active member (get_user_tenant_ids)
--     of the tenant that owns the product / QC item the path names, or the
--     temp-path owner rule above. Returns no tenant ids, so it leaks nothing.
--   * product-images: the three TO public write policies are replaced by
--     INSERT/UPDATE/DELETE TO authenticated using that helper. Public read is
--     unchanged (storefronts load these URLs).
--   * qc-evidence: upload/delete policies replaced the same way; the bucket
--     gets a 10 MB limit and an image-only MIME list (the uploader only sends
--     image/*). Public read stays because the app stores getPublicUrl() links;
--     making it private needs signed URLs in the code (left for the code side).
--   * The existing 122 product-images objects and the qc-evidence object are
--     not touched. Legacy objects whose product no longer exists can only be
--     removed by the service role.
--
-- ROLLBACK
--   DROP POLICY product_images_tenant_insert / _update / _delete, qc_evidence_tenant_insert / _delete
--   ON storage.objects; recreate the four original policies quoted above; reset
--   qc-evidence: UPDATE storage.buckets SET file_size_limit = NULL,
--   allowed_mime_types = NULL WHERE id = 'qc-evidence';
--   DROP FUNCTION public.storage_object_writable(text, text, text);

CREATE OR REPLACE FUNCTION public.storage_object_writable(p_bucket text, p_name text, p_owner_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_uuid_re constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
    v_parts   text[] := string_to_array(p_name, '/');
    v_depth   int    := coalesce(array_length(string_to_array(p_name, '/'), 1), 0);
    v_ref     text;
    v_tenant  uuid;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN false;
    END IF;

    IF p_bucket = 'product-images' THEN
        IF v_parts[1] IN ('gallery', 'digital', 'note-cards') AND v_depth >= 3 THEN
            v_ref := v_parts[2];
        ELSIF v_parts[1] = 'products' AND v_depth = 2 THEN
            -- products/<productId>-<ts>.<ext> or products/temp-<ts>.<ext>
            v_ref := CASE WHEN v_parts[2] LIKE 'temp-%' THEN 'temp' ELSE left(v_parts[2], 36) END;
        ELSE
            RETURN false;
        END IF;

        IF v_ref = 'temp' THEN
            RETURN p_owner_id IS NOT NULL
               AND p_owner_id = auth.uid()::text
               AND EXISTS (SELECT 1 FROM public.get_user_tenant_ids());
        END IF;
        IF v_ref !~ v_uuid_re THEN
            RETURN false;
        END IF;
        SELECT p.tenant_id INTO v_tenant FROM public.products p WHERE p.id = v_ref::uuid;

    ELSIF p_bucket = 'qc-evidence' THEN
        IF v_depth < 2 OR v_parts[1] !~ v_uuid_re THEN
            RETURN false;
        END IF;
        SELECT q.tenant_id INTO v_tenant FROM public.qc_quarantine q WHERE q.id = v_parts[1]::uuid;

    ELSE
        RETURN false;
    END IF;

    RETURN v_tenant IS NOT NULL
       AND v_tenant IN (SELECT public.get_user_tenant_ids());
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.storage_object_writable(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.storage_object_writable(text, text, text) TO authenticated, service_role;

-- product-images ---------------------------------------------------------------
DROP POLICY IF EXISTS "Allow Uploads to Product Images"    ON storage.objects;
DROP POLICY IF EXISTS "Allow Updates to Product Images"    ON storage.objects;
DROP POLICY IF EXISTS "Allow Deletions for Product Images" ON storage.objects;

DROP POLICY IF EXISTS product_images_tenant_insert ON storage.objects;
CREATE POLICY product_images_tenant_insert ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'product-images'
        AND public.storage_object_writable(bucket_id, name, owner_id)
    );

DROP POLICY IF EXISTS product_images_tenant_update ON storage.objects;
CREATE POLICY product_images_tenant_update ON storage.objects
    FOR UPDATE TO authenticated
    USING (
        bucket_id = 'product-images'
        AND public.storage_object_writable(bucket_id, name, owner_id)
    )
    WITH CHECK (
        bucket_id = 'product-images'
        AND public.storage_object_writable(bucket_id, name, owner_id)
    );

DROP POLICY IF EXISTS product_images_tenant_delete ON storage.objects;
CREATE POLICY product_images_tenant_delete ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'product-images'
        AND public.storage_object_writable(bucket_id, name, owner_id)
    );

-- qc-evidence ------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated upload to qc-evidence" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete qc-evidence"    ON storage.objects;

DROP POLICY IF EXISTS qc_evidence_tenant_insert ON storage.objects;
CREATE POLICY qc_evidence_tenant_insert ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'qc-evidence'
        AND public.storage_object_writable(bucket_id, name, owner_id)
    );

DROP POLICY IF EXISTS qc_evidence_tenant_delete ON storage.objects;
CREATE POLICY qc_evidence_tenant_delete ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'qc-evidence'
        AND public.storage_object_writable(bucket_id, name, owner_id)
    );

UPDATE storage.buckets
   SET file_size_limit    = 10485760,
       allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
 WHERE id = 'qc-evidence';
