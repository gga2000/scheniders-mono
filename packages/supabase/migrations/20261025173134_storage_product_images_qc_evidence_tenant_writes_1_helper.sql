-- storage_product_images_qc_evidence_tenant_writes part 1 of 2 (header and rollback notes:
-- packages/supabase/tests/p1_db_security_holes.sql): the write-check helper and the
-- qc-evidence bucket limits. Part 2 (the storage.objects policies) needs the
-- storage.objects owner, see that file.
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

UPDATE storage.buckets
   SET file_size_limit    = 10485760,
       allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
 WHERE id = 'qc-evidence';
