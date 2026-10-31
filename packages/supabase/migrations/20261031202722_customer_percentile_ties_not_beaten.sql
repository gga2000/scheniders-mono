-- Customers F8: "Better than N%" counted ties (and the customer) as beaten, so
-- the many customers on the same score inflated it. Count strictly lower scores
-- out of the other customers in the pool.
DO $$
DECLARE
    v_def text;
BEGIN
    v_def := pg_get_functiondef('public.get_customer_percentile(text,text)'::regprocedure);
    IF (length(v_def) - length(replace(v_def, 'ct2.trust_score <= v_score', ''))) / length('ct2.trust_score <= v_score') <> 2 THEN
        RAISE EXCEPTION 'get_customer_percentile clause not found';
    END IF;
    -- "Better than N%" counts only customers with a strictly lower score, out of the others.
    v_def := replace(v_def, 'ct2.trust_score <= v_score', 'ct2.trust_score < v_score');
    v_def := replace(v_def, 'GREATEST(COUNT(*), 1)', 'GREATEST(COUNT(*) - 1, 1)');
    EXECUTE v_def;
END
$$;
