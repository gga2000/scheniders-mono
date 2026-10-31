-- Customers N15-01: name and city search used plain ILIKE, so "احمد" found 275
-- customers and "أحمد" only 14. Fold both sides with the same normaliser order
-- search already uses.
DO $$
DECLARE
    v_def text;
BEGIN
    v_def := pg_get_functiondef('public.get_paginated_customers(text,text,text,text,boolean,integer,integer,bigint,bigint,integer,text,text,integer,integer,text,text,integer,integer,boolean)'::regprocedure);
    IF position('c.latest_name ILIKE like_search' IN v_def) = 0 OR position('c.latest_city ILIKE like_search' IN v_def) = 0 THEN
        RAISE EXCEPTION 'get_paginated_customers search clause not found';
    END IF;
    v_def := replace(v_def, 'c.latest_name ILIKE like_search', 'public.normalize_arabic_text_for_search(c.latest_name) ILIKE public.normalize_arabic_text_for_search(like_search)');
    v_def := replace(v_def, 'c.latest_city ILIKE like_search', 'public.normalize_arabic_text_for_search(c.latest_city) ILIKE public.normalize_arabic_text_for_search(like_search)');
    EXECUTE v_def;
END
$$;
