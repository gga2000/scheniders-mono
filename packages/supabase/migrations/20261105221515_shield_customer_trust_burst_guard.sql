-- Shield: same anti-mapping guard as shield_lookup for the orders-page danger
-- levels. A store that adds many new numbers at once (e.g. fake orders typed
-- in bulk to probe the network) gets no network answer for numbers first seen
-- in the last hour while more than 500 such numbers exist. Real stores peak at
-- about 70 new numbers an hour, so normal use is unchanged.
CREATE OR REPLACE FUNCTION public.shield_customer_trust()
 RETURNS TABLE(phone text, trust integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_tenant uuid := public.require_current_tenant();
BEGIN
    RETURN QUERY
    WITH pep AS (
        SELECT s.decrypted_secret AS s FROM vault.decrypted_secrets s WHERE s.name = 'shield_phone_pepper'
    ), ph AS (
        SELECT public.normalize_phone_for_search(o.phone) AS n, min(o.created_at) AS first_at
          FROM public.orders o
         WHERE o.tenant_id = v_tenant AND o.deleted_at IS NULL AND NOT COALESCE(o.is_test, false)
         GROUP BY 1
    ), burst AS (
        SELECT count(*) > 500 AS on FROM ph WHERE ph.first_at > now() - interval '1 hour'
    ), risky AS (
        SELECT array_agg(ph.n) AS a
          FROM ph, pep, burst
         WHERE length(ph.n) = 10
           AND NOT (burst.on AND ph.first_at > now() - interval '1 hour')
           AND EXISTS (SELECT 1 FROM shield.events e
                        WHERE e.phone_key = extensions.hmac(ph.n, pep.s, 'sha256')
                          AND e.outcome <> 'delivered')
    )
    SELECT t.phone, t.trust
      FROM shield.trust(v_tenant, (SELECT a FROM risky)) t
     WHERE NOT t.trust_new AND t.trust < 80;
END;
$function$;
