-- Products page, round 3 critic after #246.
--
-- 1. The tables that hang off a product (price tiers, order bumps, related
--    products, bundle items, suppliers, options, gallery images, tags) still
--    let any member of the store write them: their policy only checked
--    membership. A viewer could set a price tier to 1 IQD or an order bump to
--    100% off with one REST call, and checkout charges those. Writes now need
--    products.edit, the same as the product row itself; members keep reading.
-- 2. Archiving overwrote status with 'archived' and restoring always set
--    'active', so archiving a draft and pressing Undo published it. The status
--    before archiving is kept and restored (rows archived before this keep the
--    old behaviour and come back active).
-- 3. gallery_urls is changed by the photo gallery on its own, never by the
--    editor's save, so it no longer moves updated_at: removing a photo no
--    longer makes the open editor refuse its own save.

-- 1. Child-table writes need products.edit ---------------------------------
DO $$
DECLARE
    t text;
    p record;
BEGIN
    FOREACH t IN ARRAY ARRAY['product_tiered_pricing', 'product_order_bumps', 'product_related',
                             'product_bundle_items', 'product_suppliers', 'product_options',
                             'product_images', 'product_tags'] LOOP
        FOR p IN
            SELECT policyname FROM pg_policies
             WHERE schemaname = 'public' AND tablename = t
               AND policyname IN ('tenant_isolation_all', 'tenant_isolation_select', 'tenant_isolation_insert',
                                  'tenant_isolation_update', 'tenant_isolation_delete')
        LOOP
            EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
        END LOOP;

        EXECUTE format(
            'CREATE POLICY tenant_isolation_select ON public.%I FOR SELECT TO authenticated
                 USING (tenant_id IN (SELECT public.get_user_tenant_ids()))', t);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
                 WITH CHECK (public.has_tenant_permission(tenant_id, ''products.edit''))', t || '_insert', t);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
                 USING (public.has_tenant_permission(tenant_id, ''products.edit''))
                 WITH CHECK (public.has_tenant_permission(tenant_id, ''products.edit''))', t || '_update', t);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
                 USING (public.has_tenant_permission(tenant_id, ''products.edit''))', t || '_delete', t);
    END LOOP;
END $$;

-- 2. Restore returns the status from before archiving ----------------------
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS status_before_archive text;

CREATE OR REPLACE FUNCTION public.products_sync_archive_state()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.is_archived THEN
            NEW.status := 'archived';
        ELSE
            NEW.is_archived := (NEW.status = 'archived');
        END IF;
        NEW.status_before_archive := NULL;
    ELSIF NEW.is_archived IS DISTINCT FROM OLD.is_archived THEN
        -- Archive / restore from the list.
        IF NEW.is_archived THEN
            NEW.status_before_archive := CASE WHEN OLD.status <> 'archived' THEN OLD.status END;
            NEW.status := 'archived';
        ELSE
            IF OLD.status = 'archived' THEN
                NEW.status := COALESCE(OLD.status_before_archive, 'active');
            END IF;
            NEW.status_before_archive := NULL;
        END IF;
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
        -- Status picked in the editor.
        NEW.is_archived := (NEW.status = 'archived');
        NEW.status_before_archive := CASE WHEN NEW.status = 'archived' THEN OLD.status END;
    END IF;
    RETURN NEW;
END;
$function$;

-- 3. gallery_urls does not move updated_at ---------------------------------
CREATE OR REPLACE FUNCTION public.products_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
    ignored text[] := ARRAY['updated_at', 'stock_quantity', 'reserved_quantity', 'open_box_quantity',
                            'bestseller_rank', 'gallery_urls'];
BEGIN
    IF (to_jsonb(NEW) - ignored) IS DISTINCT FROM (to_jsonb(OLD) - ignored) THEN
        NEW.updated_at := now();
    ELSE
        NEW.updated_at := OLD.updated_at;
    END IF;
    RETURN NEW;
END;
$function$;
