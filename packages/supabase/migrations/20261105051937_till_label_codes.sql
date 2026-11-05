-- Till: barcode stickers. Before printing, a manager at the Till gets each
-- item's barcode; an item with none is given a new 12-digit in-store code
-- (starting with 2, the range shops use for their own codes), unique across
-- the store's products and sizes, and saved so a scanner finds it.
-- Returns [{product_id, variant_id, barcode, created}].
CREATE OR REPLACE FUNCTION public.till_label_codes(p_session_id uuid, p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    s public.till_sessions%ROWTYPE;
    it jsonb;
    v_product uuid;
    v_variant uuid;
    v_code text;
    v_created boolean;
    v_out jsonb := '[]'::jsonb;
BEGIN
    s := public.till_live_session(p_session_id);
    IF NOT public.till_member_can(s.tenant_id, s.cashier_id, 'shops.manage') THEN
        RAISE EXCEPTION 'only a manager can print stickers' USING ERRCODE = '42501';
    END IF;
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 OR jsonb_array_length(p_items) > 500 THEN
        RAISE EXCEPTION 'give 1 to 500 items' USING ERRCODE = '22023';
    END IF;

    FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_product := (it->>'product_id')::uuid;
        v_variant := NULLIF(it->>'variant_id', '')::uuid;
        IF v_variant IS NULL THEN
            SELECT NULLIF(btrim(barcode), '') INTO v_code FROM public.products
             WHERE id = v_product AND tenant_id = s.tenant_id FOR UPDATE;
        ELSE
            SELECT NULLIF(btrim(barcode), '') INTO v_code FROM public.product_variants
             WHERE id = v_variant AND product_id = v_product AND tenant_id = s.tenant_id FOR UPDATE;
        END IF;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'product not found' USING ERRCODE = 'P0002';
        END IF;

        v_created := v_code IS NULL;
        IF v_created THEN
            LOOP
                v_code := '2' || lpad((floor(random() * 1e11))::bigint::text, 11, '0');
                EXIT WHEN NOT EXISTS (SELECT 1 FROM public.products WHERE tenant_id = s.tenant_id AND barcode = v_code)
                      AND NOT EXISTS (SELECT 1 FROM public.product_variants WHERE tenant_id = s.tenant_id AND barcode = v_code);
            END LOOP;
            IF v_variant IS NULL THEN
                UPDATE public.products SET barcode = v_code WHERE id = v_product;
            ELSE
                UPDATE public.product_variants SET barcode = v_code WHERE id = v_variant;
            END IF;
        END IF;
        v_out := v_out || jsonb_build_array(jsonb_build_object('product_id', v_product, 'variant_id', v_variant, 'barcode', v_code, 'created', v_created));
    END LOOP;

    UPDATE public.till_sessions SET last_seen_at = now() WHERE id = s.id;
    RETURN v_out;
END;
$function$;

REVOKE ALL ON FUNCTION public.till_label_codes(uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.till_label_codes(uuid, jsonb) TO authenticated;
