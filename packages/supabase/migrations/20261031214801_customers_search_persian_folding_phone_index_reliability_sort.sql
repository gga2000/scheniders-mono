-- Customers search and sort, round 21:
--  1. Arabic folding also maps Persian/Kurdish keyboard letters (ی ک ە ۀ ٱ) and
--     drops tatweel, so "علی" finds "علي". The three trigram indexes built on
--     the function are rebuilt so they match the new folding.
--  2. A trigram index on customer_phone lets phone-shaped searches use an index.
--  3. The Reliability sort ranks a blocked customer as 0 and puts unrated
--     ("new") customers after the rated ones in both directions, on the 0-100
--     scale the page shows.
CREATE OR REPLACE FUNCTION public.normalize_arabic_text_for_search(_text text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE STRICT
 SET search_path TO 'public'
AS $function$
    SELECT lower(trim(
        translate(
            regexp_replace(
                regexp_replace(_text, '[' || chr(1611) || '-' || chr(1631) || chr(1600) || ']', '', 'g'),
                chr(1648), '', 'g'),
            'آأإٱةىیکەۀ',
            'ااااهييكهه'
        )
    ));
$function$;

REINDEX INDEX public.idx_orders_customer_name_norm_trgm;
REINDEX INDEX public.idx_mv_customer_metrics_name_folded_trgm;
REINDEX INDEX public.idx_mv_customer_metrics_city_folded_trgm;

CREATE INDEX IF NOT EXISTS idx_mv_customer_metrics_phone_trgm
    ON public.mv_customer_metrics
    USING gin (customer_phone gin_trgm_ops);

DO $$
DECLARE
    v_def text;
    v_old text := $o$        CASE WHEN sort_by = 'trust_score' AND sort_desc THEN q.ct_trust_score END DESC NULLS LAST,
        CASE WHEN sort_by = 'trust_score' AND NOT sort_desc THEN q.ct_trust_score END ASC NULLS LAST,$o$;
    v_new text := $n$        CASE WHEN sort_by = 'trust_score' THEN q.ct_trust_tier::text = 'new' END ASC NULLS LAST,
        CASE WHEN sort_by = 'trust_score' AND sort_desc THEN
            CASE WHEN q.ct_trust_tier::text = 'blocked' THEN 0 ELSE LEAST(GREATEST(q.ct_trust_score, 0), 100) END END DESC NULLS LAST,
        CASE WHEN sort_by = 'trust_score' AND NOT sort_desc THEN
            CASE WHEN q.ct_trust_tier::text = 'blocked' THEN 0 ELSE LEAST(GREATEST(q.ct_trust_score, 0), 100) END END ASC NULLS LAST,$n$;
BEGIN
    SELECT pg_get_functiondef('public.get_paginated_customers(text,text,text,text,boolean,integer,integer,bigint,bigint,integer,text,text,integer,integer,text,text,integer,integer,boolean)'::regprocedure)
      INTO v_def;
    IF position(v_old IN v_def) = 0 THEN
        RAISE EXCEPTION 'get_paginated_customers: trust_score ORDER BY not found';
    END IF;
    EXECUTE replace(v_def, v_old, v_new);
END $$;
