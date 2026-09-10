-- WF-2 part 2: split_order_atomic records the pre-split values in the same
-- transaction and returns split_log_id; unsplit_order_atomic reverses it.
--
-- Verified end to end on a throwaway order before shipping:
--   before      confirmed / 15000 / [A,B]
--   after split delivered / 10000 / [A]   + return order created
--   after undo  confirmed / 15000 / [A,B] + return order soft-deleted
--   second undo refused: "This split has already been undone"
--
-- The full body of split_order_atomic is recorded in the applied migration
-- `wf2_split_records_snapshot_and_unsplit`; only unsplit is reproduced here to
-- avoid keeping a second, drift-prone copy of a 100-line function in the repo.
-- Read the live definition with:
--   SELECT pg_get_functiondef('public.split_order_atomic(uuid,jsonb,jsonb,uuid)'::regprocedure);

CREATE OR REPLACE FUNCTION public.unsplit_order_atomic(_split_log_id uuid, _tenant_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    _log record;
    _ret record;
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        IF _tenant_id IS NULL THEN
            RAISE EXCEPTION 'tenant_id required' USING ERRCODE = '22023';
        END IF;
        IF _tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN
            RAISE EXCEPTION 'Unauthorized: not a member of tenant %', _tenant_id USING ERRCODE = '42501';
        END IF;
    END IF;

    SELECT * INTO _log FROM public.order_split_log
     WHERE id = _split_log_id
       AND (_tenant_id IS NULL OR tenant_id = _tenant_id)
       FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Split record not found in this tenant' USING ERRCODE = '22023';
    END IF;

    IF _log.undone_at IS NOT NULL THEN
        RAISE EXCEPTION 'This split has already been undone' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO _ret FROM public.orders WHERE id = _log.return_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'The return order created by this split no longer exists' USING ERRCODE = '22023';
    END IF;

    IF _ret.deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'The return order has been deleted; undo would not restore it' USING ERRCODE = '22023';
    END IF;
    IF _ret.status <> 'rejected' THEN
        RAISE EXCEPTION 'The return order has moved on to %, so this split can no longer be undone', _ret.status
            USING ERRCODE = '22023';
    END IF;
    IF _ret.waseet_qr_id IS NOT NULL THEN
        RAISE EXCEPTION 'The return order has already been sent to the courier' USING ERRCODE = '22023';
    END IF;
    IF coalesce(_ret.refund_status, 'none') <> 'none' THEN
        RAISE EXCEPTION 'The return order has a refund recorded against it' USING ERRCODE = '22023';
    END IF;

    UPDATE public.orders
       SET items           = (_log.original_before->'items'),
           price           = NULLIF(_log.original_before->>'price','')::numeric,
           discount_amount = NULLIF(_log.original_before->>'discount_amount','')::numeric,
           status          = _log.original_before->>'status',
           delivered_at    = NULLIF(_log.original_before->>'delivered_at','')::timestamptz
     WHERE id = _log.original_order_id;

    -- Soft-delete, matching how the app deletes orders everywhere else.
    UPDATE public.orders SET deleted_at = now() WHERE id = _log.return_order_id;

    UPDATE public.order_split_log SET undone_at = now() WHERE id = _split_log_id;

    RETURN jsonb_build_object(
        'success', true,
        'original_order_id', _log.original_order_id,
        'return_order_id', _log.return_order_id
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.unsplit_order_atomic(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.unsplit_order_atomic(uuid, uuid) TO authenticated, service_role;
