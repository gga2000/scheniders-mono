-- WF-2 part 2: merge_orders_atomic now records the pre-merge values in the same
-- transaction as the merge, and unmerge_orders_atomic restores from them.
--
-- Only the tail of merge_orders_atomic changes: the two UPDATEs are unchanged,
-- and one INSERT into order_merge_log is added before them. The returned value
-- gains merge_log_id so the caller can offer an undo.

CREATE OR REPLACE FUNCTION public.merge_orders_atomic(_keep_order_id uuid, _archive_order_id uuid, _tenant_id uuid DEFAULT NULL::uuid, _changed_by text DEFAULT 'System'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    _keep record;
    _archive record;
    _combined_items jsonb;
    _combined_price numeric;
    _combined_discount numeric;
    _combined_delivery numeric;
    _combined_notes text;
    _result jsonb;
    _merge_log_id uuid;
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        IF _tenant_id IS NULL THEN
            RAISE EXCEPTION 'tenant_id required' USING ERRCODE = '22023';
        END IF;
        IF _tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN
            RAISE EXCEPTION 'Unauthorized: not a member of tenant %', _tenant_id USING ERRCODE = '42501';
        END IF;
    END IF;

    IF _keep_order_id = _archive_order_id THEN
        RAISE EXCEPTION 'Cannot merge an order into itself' USING ERRCODE = '22023';
    END IF;

    PERFORM 1 FROM public.orders
     WHERE id IN (_keep_order_id, _archive_order_id)
       AND (_tenant_id IS NULL OR tenant_id = _tenant_id)
     ORDER BY id
       FOR UPDATE;

    SELECT * INTO _keep FROM public.orders
     WHERE id = _keep_order_id AND (_tenant_id IS NULL OR tenant_id = _tenant_id);
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Kept order not found in this tenant';
    END IF;

    SELECT * INTO _archive FROM public.orders
     WHERE id = _archive_order_id AND (_tenant_id IS NULL OR tenant_id = _tenant_id);
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Duplicate order not found in this tenant';
    END IF;

    IF _archive.is_archived THEN
        RAISE EXCEPTION 'Duplicate order is already archived' USING ERRCODE = '22023';
    END IF;

    IF _keep.is_archived THEN
        RAISE EXCEPTION 'Kept order is archived - cannot merge into it' USING ERRCODE = '22023';
    END IF;

    WITH src AS (
        SELECT i.value AS item, 0 AS side, i.ordinality AS pos
          FROM jsonb_array_elements(
                 CASE WHEN jsonb_typeof(_keep.items) = 'array' THEN _keep.items ELSE '[]'::jsonb END
               ) WITH ORDINALITY AS i(value, ordinality)
        UNION ALL
        SELECT i.value, 1, i.ordinality
          FROM jsonb_array_elements(
                 CASE WHEN jsonb_typeof(_archive.items) = 'array' THEN _archive.items ELSE '[]'::jsonb END
               ) WITH ORDINALITY AS i(value, ordinality)
    ), keyed AS (
        SELECT coalesce(item->>'product_id', item->>'sku', item->>'name') AS merge_key,
               item, side, pos,
               coalesce(NULLIF(item->>'quantity','')::numeric, 1) AS qty
          FROM src
    ), agg AS (
        SELECT merge_key,
               min(side * 100000 + pos) AS sort_key,
               sum(qty) AS total_qty,
               (array_agg(item ORDER BY side, pos))[1] AS base_item
          FROM keyed
         GROUP BY merge_key
    )
    SELECT coalesce(
             jsonb_agg(jsonb_set(base_item, '{quantity}', to_jsonb(total_qty)) ORDER BY sort_key),
             '[]'::jsonb)
      INTO _combined_items
      FROM agg;

    _combined_price    := coalesce(_keep.price, 0) + coalesce(_archive.price, 0);
    _combined_discount := coalesce(_keep.discount_amount, 0) + coalesce(_archive.discount_amount, 0);
    _combined_delivery := greatest(coalesce(_keep.delivery_fee, 0), coalesce(_archive.delivery_fee, 0));

    _combined_notes := NULLIF(
        concat_ws(' | ', NULLIF(_keep.notes, ''), NULLIF(_archive.notes, '')), '');

    -- WF-2: capture exactly what the two UPDATEs below are about to overwrite,
    -- in the same transaction, so the merge can be reversed.
    INSERT INTO public.order_merge_log
        (tenant_id, keep_order_id, archive_order_id, keep_before, archive_before, merged_by)
    VALUES (
        coalesce(_tenant_id, _keep.tenant_id),
        _keep_order_id,
        _archive_order_id,
        jsonb_build_object(
            'items', _keep.items,
            'price', _keep.price,
            'discount_amount', _keep.discount_amount,
            'delivery_fee', _keep.delivery_fee,
            'notes', _keep.notes
        ),
        jsonb_build_object(
            'is_archived', _archive.is_archived,
            'status', _archive.status,
            'rejection_reason', _archive.rejection_reason,
            'notes', _archive.notes
        ),
        _changed_by
    )
    RETURNING id INTO _merge_log_id;

    UPDATE public.orders
       SET items           = _combined_items,
           price           = _combined_price,
           discount_amount = _combined_discount,
           delivery_fee    = _combined_delivery,
           notes           = coalesce(_combined_notes, _keep.notes)
     WHERE id = _keep_order_id;

    UPDATE public.orders
       SET is_archived      = true,
           status           = 'rejected',
           rejection_reason = 'duplicate_merged',
           notes            = trim(concat('[مدمج مع #', _keep.order_id, '] ', coalesce(_archive.notes, '')))
     WHERE id = _archive_order_id;

    INSERT INTO public.order_status_history
        (order_id, changed_by, from_status, to_status, notes, tenant_id)
    VALUES
        (_keep_order_id, _changed_by, _keep.status, _keep.status,
         concat('Merged with #', _archive.order_id), _keep.tenant_id),
        (_archive_order_id, _changed_by, _archive.status, 'rejected',
         concat('Merged into #', _keep.order_id), _archive.tenant_id);

    SELECT to_jsonb(o.*) || jsonb_build_object('merge_log_id', _merge_log_id)
      INTO _result FROM public.orders o WHERE o.id = _keep_order_id;
    RETURN _result;
END;
$function$;

/**
 * Reverse a merge, restoring both orders to their pre-merge values.
 *
 * Refuses if the log entry has already been undone, so a double-click cannot
 * subtract the money twice.
 */
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
GRANT EXECUTE ON FUNCTION public.unmerge_orders_atomic(uuid, uuid) TO authenticated, service_role;;
