-- Till: scent helper. Each product carries a few scent notes from a fixed list
-- (the app names them in each language), so a cashier can find bottles by
-- note and offer ones similar to what the customer liked. Managers set them
-- at the Till.
ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS scent_notes text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_scent_notes_check;
ALTER TABLE public.products ADD CONSTRAINT products_scent_notes_check CHECK (
    cardinality(scent_notes) <= 6
    AND scent_notes <@ ARRAY['oud','woody','fresh','citrus','sweet','vanilla','floral','spicy','musky','amber','leather','aquatic','fruity','smoky']::text[]
);

-- Sets one product's notes. Returns the notes saved, sorted, without repeats.
CREATE OR REPLACE FUNCTION public.till_set_scent_notes(p_session_id uuid, p_product_id uuid, p_notes text[])
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    s public.till_sessions%ROWTYPE;
    v_notes text[];
BEGIN
    s := public.till_live_session(p_session_id);
    IF NOT public.till_member_can(s.tenant_id, s.cashier_id, 'shops.manage') THEN
        RAISE EXCEPTION 'only a manager can change scent notes' USING ERRCODE = '42501';
    END IF;
    SELECT COALESCE(array_agg(DISTINCT n ORDER BY n), '{}') INTO v_notes FROM unnest(COALESCE(p_notes, '{}')) AS n;
    UPDATE public.products SET scent_notes = v_notes
     WHERE id = p_product_id AND tenant_id = s.tenant_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'product not found' USING ERRCODE = 'P0002';
    END IF;
    UPDATE public.till_sessions SET last_seen_at = now() WHERE id = s.id;
    RETURN v_notes;
END;
$function$;

REVOKE ALL ON FUNCTION public.till_set_scent_notes(uuid, uuid, text[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.till_set_scent_notes(uuid, uuid, text[]) TO authenticated;
