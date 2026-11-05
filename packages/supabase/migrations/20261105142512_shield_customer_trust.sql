-- Shield danger level for every order on the orders page (Ali, 2026-11-05):
-- the Trust score of each of this store's customers whose score is under 80
-- (and who is not new). Every other customer reads as low danger. Scoped to
-- the caller's current store; the score is the same one shield_lookup shows.
CREATE OR REPLACE FUNCTION public.shield_customer_trust()
RETURNS TABLE (phone text, trust integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_tenant uuid := public.require_current_tenant();
BEGIN
    RETURN QUERY
    WITH ph AS (
        SELECT array_agg(DISTINCT n) AS a
          FROM (
              SELECT public.normalize_phone_for_search(o.phone) AS n
                FROM public.orders o
               WHERE o.tenant_id = v_tenant
                 AND o.deleted_at IS NULL
                 AND NOT COALESCE(o.is_test, false)
          ) s
         WHERE length(n) = 10
    )
    SELECT t.phone, t.trust
      FROM shield.trust(v_tenant, (SELECT a FROM ph)) t
     WHERE NOT t.trust_new AND t.trust < 80;
END;
$$;

REVOKE ALL ON FUNCTION public.shield_customer_trust() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shield_customer_trust() TO authenticated;
