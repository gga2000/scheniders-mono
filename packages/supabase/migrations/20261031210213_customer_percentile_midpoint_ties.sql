-- Peer percentile, round 18:
--  * ties rank at their midpoint (half of the other tied customers count as
--    beaten), so a store where most rated customers score 100 does not push
--    every 100 below the middle;
--  * blocked customers leave the pool along with unrated ('new') ones.
CREATE OR REPLACE FUNCTION public.get_customer_percentile(target_phone text, target_city text DEFAULT NULL::text)
 RETURNS TABLE(percentile numeric, city_name text, total_in_group bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    normalized TEXT;
    v_score INTEGER;
    v_tier TEXT;
    v_city TEXT;
    v_tenant UUID;
    v_city_pool BIGINT;
    v_api BOOLEAN := coalesce(auth.role(), '') IN ('authenticated', 'anon');
BEGIN
    IF v_api AND auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;

    normalized := public.normalize_phone(target_phone);

    IF v_api THEN
        v_tenant := public.get_current_tenant_id();
        IF v_tenant IS NULL OR v_tenant NOT IN (SELECT public.get_user_tenant_ids()) THEN
            RETURN QUERY SELECT 0::NUMERIC, ''::TEXT, 0::BIGINT; RETURN;
        END IF;
        SELECT LEAST(GREATEST(ct.trust_score, 0), 100), ct.trust_tier::TEXT, ct.preferred_city
          INTO v_score, v_tier, v_city
          FROM public.customer_trust ct
         WHERE ct.phone = normalized AND ct.tenant_id = v_tenant;
    ELSE
        SELECT ct.tenant_id, LEAST(GREATEST(ct.trust_score, 0), 100), ct.trust_tier::TEXT, ct.preferred_city
          INTO v_tenant, v_score, v_tier, v_city
          FROM public.customer_trust ct
         WHERE ct.phone = normalized
         ORDER BY ct.tenant_id
         LIMIT 1;
    END IF;

    IF v_score IS NULL OR v_tier IN ('new', 'blocked') THEN
        RETURN QUERY SELECT 0::NUMERIC, ''::TEXT, 0::BIGINT; RETURN;
    END IF;

    v_city := COALESCE(NULLIF(target_city, ''), v_city);
    IF v_city IS NOT NULL AND v_city <> '' THEN
        SELECT COUNT(*) INTO v_city_pool
          FROM public.customer_trust ct2
         WHERE ct2.tenant_id = v_tenant AND ct2.trust_tier::TEXT NOT IN ('new', 'blocked') AND ct2.preferred_city = v_city;
    END IF;

    IF COALESCE(v_city_pool, 0) >= 5 THEN
        RETURN QUERY SELECT ROUND(((COUNT(*) FILTER (WHERE LEAST(GREATEST(ct2.trust_score, 0), 100) < v_score)
                                    + (COUNT(*) FILTER (WHERE LEAST(GREATEST(ct2.trust_score, 0), 100) = v_score) - 1) / 2.0)::NUMERIC
                                   / GREATEST(COUNT(*) - 1, 1)) * 100, 1),
            v_city, COUNT(*)
          FROM public.customer_trust ct2
         WHERE ct2.tenant_id = v_tenant AND ct2.trust_tier::TEXT NOT IN ('new', 'blocked') AND ct2.preferred_city = v_city;
    ELSE
        RETURN QUERY SELECT ROUND(((COUNT(*) FILTER (WHERE LEAST(GREATEST(ct2.trust_score, 0), 100) < v_score)
                                    + (COUNT(*) FILTER (WHERE LEAST(GREATEST(ct2.trust_score, 0), 100) = v_score) - 1) / 2.0)::NUMERIC
                                   / GREATEST(COUNT(*) - 1, 1)) * 100, 1),
            'all'::TEXT, COUNT(*)
          FROM public.customer_trust ct2
         WHERE ct2.tenant_id = v_tenant AND ct2.trust_tier::TEXT NOT IN ('new', 'blocked');
    END IF;
END;
$function$;