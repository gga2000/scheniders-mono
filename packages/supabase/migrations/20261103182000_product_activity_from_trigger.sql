-- Products audit r34 #9: product_activity_log ("Activity log" on the product
-- page) was written by the browser. Any member with products.edit could insert
-- rows with any action, any changes and any user_id, so the log could say
-- someone did something they never did. The editor also left user_id empty,
-- and edits made anywhere but the editor (bulk actions, quick price edit,
-- Claude) were never logged.
--
-- The database now writes the log itself, from the change that actually
-- happened, with the signed-in user from the request. Clients can only read it.
-- Stock moves are not logged here (inventory_history has them, and sales would
-- flood this list); cost is never logged (members without products.manage can
-- read this table but not cost).
CREATE OR REPLACE FUNCTION public.log_product_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_changes jsonb := '{}'::jsonb;
    v_action  text;
    v_field   text;
    v_old     jsonb;
    v_new     jsonb;
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.product_activity_log (product_id, tenant_id, action, changes_json, user_id)
        VALUES (NEW.id, NEW.tenant_id, 'created', NULL, auth.uid());
        RETURN NULL;
    END IF;

    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    FOREACH v_field IN ARRAY ARRAY['name', 'sku', 'price', 'compare_at_price', 'status',
                                   'is_visible', 'is_archived', 'image_url', 'category_id'] LOOP
        IF v_old -> v_field IS DISTINCT FROM v_new -> v_field THEN
            v_changes := v_changes || jsonb_build_object(
                v_field, jsonb_build_object('before', v_old -> v_field, 'after', v_new -> v_field));
        END IF;
    END LOOP;

    IF v_changes = '{}'::jsonb THEN
        RETURN NULL;
    END IF;

    v_action := CASE
        WHEN v_changes ? 'is_archived' AND NEW.is_archived THEN 'archived'
        WHEN v_changes ? 'status' THEN 'status_changed'
        WHEN v_changes ? 'price' THEN 'price_changed'
        WHEN v_changes ? 'image_url' AND NEW.image_url IS NOT NULL AND (SELECT count(*) FROM jsonb_object_keys(v_changes)) = 1 THEN 'image_added'
        ELSE 'updated'
    END;

    INSERT INTO public.product_activity_log (product_id, tenant_id, action, changes_json, user_id)
    VALUES (NEW.id, NEW.tenant_id, v_action, v_changes, auth.uid());
    RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.log_product_activity() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_log_product_activity ON public.products;
CREATE TRIGGER trg_log_product_activity
    AFTER INSERT OR UPDATE ON public.products
    FOR EACH ROW
    EXECUTE FUNCTION public.log_product_activity();

DROP POLICY IF EXISTS product_activity_log_insert ON public.product_activity_log;
REVOKE INSERT, UPDATE, DELETE ON public.product_activity_log FROM authenticated, anon;
