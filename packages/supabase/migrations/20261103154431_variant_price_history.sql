-- Products audit r34 #3: a variant's own price had no history. Changing it in
-- the editor or through Claude left no trace, unlike the product price.
-- product_price_history gets a variant_id (empty for the product's own price)
-- and the database writes a row whenever a variant's price changes, the same
-- way log_product_price_change does for products. The product chart keeps
-- showing only rows without a variant.
ALTER TABLE public.product_price_history
    ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES public.product_variants(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_product_price_history_variant
    ON public.product_price_history (variant_id, created_at DESC)
    WHERE variant_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.log_variant_price_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_by text;
BEGIN
    -- A variant without its own price follows the product; nothing to log.
    IF NEW.price IS NULL OR NEW.price <= 0 THEN
        RETURN NULL;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.price IS NOT DISTINCT FROM NEW.price THEN
        RETURN NULL;
    END IF;

    SELECT coalesce(nullif(btrim(up.display_name), ''), up.email)
      INTO v_by
      FROM public.user_profiles up
     WHERE up.id = auth.uid();

    INSERT INTO public.product_price_history (product_id, variant_id, tenant_id, old_price, new_price, changed_by, reason)
    VALUES (
        NEW.product_id,
        NEW.id,
        NEW.tenant_id,
        CASE WHEN TG_OP = 'UPDATE' THEN OLD.price END,
        NEW.price,
        v_by,
        CASE
            WHEN TG_OP = 'INSERT' THEN 'Initial price'
            ELSE coalesce(nullif(current_setting('app.price_change_reason', true), ''), 'Manual price update')
        END
    );
    RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.log_variant_price_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS log_variant_price_change ON public.product_variants;
CREATE TRIGGER log_variant_price_change
    AFTER INSERT OR UPDATE OF price ON public.product_variants
    FOR EACH ROW
    EXECUTE FUNCTION public.log_variant_price_change();
