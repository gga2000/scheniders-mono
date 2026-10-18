-- Reverts the short-circuit attempt: splitting the duplicate test into two
-- EXISTS clauses was SLOWER, not faster.
--
-- Hypothesis was that the cheap +/- 72 hour phone rule would short-circuit the
-- expensive +/- 7 day product rule. Measured on a 50-card page:
--   combined single EXISTS : 51.98 ms / 2,824 buffers
--   split into two EXISTS  : 59.97 ms / 3,517 buffers
-- Splitting made Postgres walk the phone index twice instead of once, which
-- costs more than the product rule saves. Restoring the combined form.
--
-- 52 ms for a batched once-per-page query that replaces a ~4 MB whole-book
-- download is a good trade; the 20 ms budget in the plan was written for the
-- much simpler count RPC (which lands at ~8 ms).

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
           EXISTS (
               SELECT 1
                 FROM public.orders c
                WHERE c.tenant_id = _tenant_id
                  AND public.normalize_phone_for_search(c.phone) = t.np
                  AND c.id <> t.id
                  AND c.is_return = false
                  AND c.deleted_at IS NULL
                  AND (
                        c.created_at BETWEEN t.created_at - interval '72 hours'
                                         AND t.created_at + interval '72 hours'
                     OR (
                        c.created_at BETWEEN t.created_at - interval '7 days'
                                         AND t.created_at + interval '7 days'
                        AND cardinality(t.item_names) > 0
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
