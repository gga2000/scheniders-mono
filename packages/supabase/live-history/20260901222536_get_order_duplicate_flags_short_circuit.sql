-- Follow-up to get_order_duplicate_flags: split the duplicate test into two
-- EXISTS clauses so the cheap one short-circuits.
--
-- The single combined EXISTS forced the planner to evaluate the expensive
-- product rule (+/- 7 days, unnest + bidirectional LIKE over item names) for
-- every candidate row, even when the +/- 72 hour phone rule already settled it.
-- On a 50-card page that measured 51.98 ms / 2,824 buffers. Measured on real
-- data, 46 of 50 targets are decided by the phone rule alone, so `OR`-ing two
-- separate EXISTS lets Postgres skip the expensive half in the common case.
--
-- Semantics are unchanged: same two rules, same windows, same overlap test.
--
-- DOWN MIGRATION: re-apply 20260901221806's combined-EXISTS body.

CREATE OR REPLACE FUNCTION public.get_order_duplicate_flags(
    _tenant_id uuid,
    _order_ids uuid[]
)
RETURNS TABLE (order_id uuid, has_duplicates boolean, previous_order jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        IF _tenant_id IS NULL OR _tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN
            RAISE EXCEPTION 'Unauthorized: tenant membership required' USING ERRCODE = '42501';
        END IF;
    END IF;

    RETURN QUERY
    WITH targets AS (
        SELECT o.id, o.created_at, o.is_return,
               public.normalize_phone_for_search(o.phone) AS np,
               ARRAY(
                   SELECT lower(it->>'name')
                     FROM jsonb_array_elements(
                            CASE WHEN jsonb_typeof(o.items)='array' THEN o.items ELSE '[]'::jsonb END) it
                    WHERE it->>'name' IS NOT NULL AND it->>'name' <> ''
               ) AS item_names
          FROM public.orders o
         WHERE o.tenant_id = _tenant_id
           AND o.id = ANY(_order_ids)
    )
    SELECT t.id,
           (
               -- cheap, fully indexed: same phone within +/- 72 hours
               EXISTS (
                   SELECT 1 FROM public.orders c
                    WHERE c.tenant_id = _tenant_id
                      AND public.normalize_phone_for_search(c.phone) = t.np
                      AND c.id <> t.id
                      AND c.is_return = false
                      AND c.deleted_at IS NULL
                      AND c.created_at BETWEEN t.created_at - interval '72 hours'
                                           AND t.created_at + interval '72 hours'
               )
               OR (
                   cardinality(t.item_names) > 0
                   AND EXISTS (
                       SELECT 1 FROM public.orders c
                        WHERE c.tenant_id = _tenant_id
                          AND public.normalize_phone_for_search(c.phone) = t.np
                          AND c.id <> t.id
                          AND c.is_return = false
                          AND c.deleted_at IS NULL
                          AND c.created_at BETWEEN t.created_at - interval '7 days'
                                               AND t.created_at + interval '7 days'
                          AND EXISTS (
                              SELECT 1
                                FROM jsonb_array_elements(
                                       CASE WHEN jsonb_typeof(c.items)='array' THEN c.items ELSE '[]'::jsonb END) cit,
                                     unnest(t.item_names) tname
                               WHERE lower(cit->>'name') LIKE '%' || tname || '%'
                                  OR tname LIKE '%' || lower(cit->>'name') || '%'
                          )
                   )
               )
           ) AS has_duplicates,
           CASE WHEN t.is_return THEN NULL ELSE (
               SELECT to_jsonb(p.*)
                 FROM public.orders p
                WHERE p.tenant_id = _tenant_id
                  AND public.normalize_phone_for_search(p.phone) = t.np
                  AND p.id <> t.id
                  AND p.is_return = false
                  AND p.deleted_at IS NULL
                ORDER BY p.created_at DESC
                LIMIT 1
           ) END AS previous_order
      FROM targets t;
END;
$function$;;
