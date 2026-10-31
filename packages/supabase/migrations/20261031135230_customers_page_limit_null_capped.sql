-- Customers N13-02: LIMIT CASE WHEN page_limit > 100 ... ELSE page_limit is NULL
-- (no limit) when page_limit is NULL, so a caller without customers.export got
-- every row in one call. Treat NULL as the default page of 20.
DO $$
DECLARE
    v_def text;
BEGIN
    v_def := pg_get_functiondef('public.get_paginated_customers(text,text,text,text,boolean,integer,integer,bigint,bigint,integer,text,text,integer,integer,text,text,integer,integer,boolean)'::regprocedure);
    IF position('THEN 100 ELSE page_limit END' IN v_def) = 0 THEN
        RAISE EXCEPTION 'get_paginated_customers limit clause not found';
    END IF;
    v_def := replace(v_def, 'WHEN page_limit > 100 AND NOT', 'WHEN COALESCE(page_limit, 20) > 100 AND NOT');
    v_def := replace(v_def, 'THEN 100 ELSE page_limit END', 'THEN 100 ELSE COALESCE(page_limit, 20) END');
    EXECUTE v_def;
END
$$;
