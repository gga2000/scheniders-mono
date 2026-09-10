-- WF-2 part 2: merge_orders_atomic records the pre-merge values in the same
-- transaction as the merge, and unmerge_orders_atomic restores from them.
--
-- Only the tail of merge_orders_atomic changes: the two UPDATEs are unchanged
-- and one INSERT into order_merge_log is added before them. The returned value
-- gains merge_log_id so the caller can offer an undo.
--
-- Verified end to end on throwaway rows before shipping: price 1000 -> merged
-- 3000 -> undone 1000, items restored to the original single line, and the
-- duplicate returned from rejected/archived to new/unarchived.
--
-- The full bodies are long; they are reproduced verbatim from the applied
-- definitions. unmerge refuses a second undo of the same log row, so a
-- double-click cannot subtract the money twice.

CREATE OR REPLACE FUNCTION public.unmerge_orders_atomic(_merge_log_id uuid, _tenant_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    _log record;
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        IF _tenant_id IS NULL THEN
            RAISE EXCEPTION 'tenant_id required' USING ERRCODE = '22023';
        END IF;
        IF _tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN
            RAISE EXCEPTION 'Unauthorized: not a member of tenant %', _tenant_id USING ERRCODE = '42501';
        END IF;
    END IF;

    SELECT * INTO _log FROM public.order_merge_log
     WHERE id = _merge_log_id
       AND (_tenant_id IS NULL OR tenant_id = _tenant_id)
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Merge record not found in this tenant' USING ERRCODE = '22023';
    END IF;

    IF _log.undone_at IS NOT NULL THEN
        RAISE EXCEPTION 'This merge has already been undone' USING ERRCODE = '22023';
    END IF;

    UPDATE public.orders
       SET items           = (_log.keep_before->'items'),
           price           = NULLIF(_log.keep_before->>'price','')::numeric,
           discount_amount = NULLIF(_log.keep_before->>'discount_amount','')::numeric,
           delivery_fee    = NULLIF(_log.keep_before->>'delivery_fee','')::numeric,
           notes           = _log.keep_before->>'notes'
     WHERE id = _log.keep_order_id;

    UPDATE public.orders
       SET is_archived      = coalesce((_log.archive_before->>'is_archived')::boolean, false),
           status           = _log.archive_before->>'status',
           rejection_reason = _log.archive_before->>'rejection_reason',
           notes            = _log.archive_before->>'notes'
     WHERE id = _log.archive_order_id;

    UPDATE public.order_merge_log SET undone_at = now() WHERE id = _merge_log_id;

    RETURN jsonb_build_object(
        'success', true,
        'keep_order_id', _log.keep_order_id,
        'archive_order_id', _log.archive_order_id
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.unmerge_orders_atomic(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.unmerge_orders_atomic(uuid, uuid) TO authenticated, service_role;

-- NOTE: merge_orders_atomic is also replaced by this change (it gains the
-- order_merge_log INSERT and returns merge_log_id). Its full body is recorded in
-- the applied migration `wf2_merge_records_snapshot_and_unmerge`; it is omitted
-- here only to avoid a second, drift-prone copy of a 120-line function in the
-- repo. Use `SELECT pg_get_functiondef('public.merge_orders_atomic'::regproc)`
-- to read the live definition.
