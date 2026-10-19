-- PERF-1 Stage 2 / Prerequisite B3 — duplicate flag + previous order, per card.
--
-- WHY
-- Each order card derives two things by scanning the whole in-memory array:
--   * `hasDuplicates(order.id)` -> the duplicate warning ring on the card
--   * `previousOrder`           -> the "merge with previous" affordance
-- Both silently degrade once the list fetch is windowed: a duplicate sitting
-- outside the loaded window stops being flagged, on the screen whose job is
-- catching duplicates.
--
-- FAITHFUL PORT of getDuplicatesForOrder (hooks/use-order-auxiliary.ts):
--   a candidate counts as a duplicate of the target when it is a DIFFERENT
--   order, not a return, shares the normalized phone, and either
--     * falls within +/- 72 HOURS of the target's created_at, or
--     * falls within +/- 7 DAYS and shares an item name, where "shares" means
--       either name contains the other (case-insensitive, bidirectional).
-- `previous_order` mirrors the client: the most recent OTHER non-return order
-- for the same phone (which may be newer than the target — the client sorts
-- desc and takes the first that is not itself), and is null for return orders.
--
-- Per-target lookup rides idx_orders_tenant_normphone (0.160 ms per phone), so a
-- 50-card page costs roughly the same as the duplicate-count RPC.
--
-- DOWN MIGRATION:
--   DROP FUNCTION IF EXISTS public.get_order_duplicate_flags(uuid, uuid[]);

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
$function$;

REVOKE EXECUTE ON FUNCTION public.get_order_duplicate_flags(uuid, uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_order_duplicate_flags(uuid, uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_order_duplicate_flags(uuid, uuid[]) TO authenticated, service_role;;
