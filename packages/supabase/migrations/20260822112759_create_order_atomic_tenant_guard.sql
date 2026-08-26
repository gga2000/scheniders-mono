-- SEC-1 — create_order_atomic: restore the tenant-membership guard.
--
-- WHY
-- `public.create_order_atomic(jsonb, uuid)` is SECURITY DEFINER (it must be, to
-- take the advisory lock and assign sequence numbers) and EXECUTE is granted to
-- `authenticated`. The membership guard added by 20260518000000 was dropped when
-- 20260602120000 / 20260613130000 recreated the function for other reasons, so
-- the live function inserts into whatever `_tenant_id` the caller passes. Any
-- signed-in user could therefore create orders inside another merchant's store
-- (and trigger that store's wallet charge).
--
-- WHAT
-- Re-adds the guard at the top of the body. Trusted server-side callers use the
-- service-role key and are exempt — they derive the tenant from a verified
-- session (createOrderAction) or a verified account link (Telegram webhook)
-- before calling. The rest of the body is byte-for-byte the current live
-- definition; only the guard block is new.
--
-- DOWN MIGRATION
-- To revert, re-run this same CREATE OR REPLACE with the block between
-- `-- >>> SEC-1 GUARD` and `-- <<< SEC-1 GUARD` deleted. That restores the
-- pre-guard behaviour exactly (verified against the live definition captured
-- 2026-08-20). Reverting re-opens the cross-tenant insert — do not revert
-- without replacing the control elsewhere.

CREATE OR REPLACE FUNCTION public.create_order_atomic(_order_data jsonb, _tenant_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    _source_code text; _date_str text; _prefix text; _count int4;
    _next_sequence_number int4; _generated_order_id text; _result jsonb; _advisory_lock_id bigint;
    _items_safe jsonb;
    _attention_safe jsonb;
    _idem text;
BEGIN
    -- >>> SEC-1 GUARD
    -- A SECURITY DEFINER function bypasses RLS, so the caller's tenant
    -- membership must be checked explicitly. service_role callers are trusted
    -- (server-only key); everyone else may only write into a tenant they belong to.
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        IF _tenant_id IS NULL OR _tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN
            RAISE EXCEPTION 'Unauthorized: tenant membership required'
                USING ERRCODE = '42501';
        END IF;
    END IF;
    -- <<< SEC-1 GUARD

    _source_code := CASE WHEN (_order_data->>'source') = 'whatsapp' THEN '1'
                         WHEN (_order_data->>'source') = 'meta' THEN '2'
                         WHEN (_order_data->>'source') = 'tiktok' THEN '3'
                         ELSE '4' END;
    _date_str := to_char(current_date, 'YYMMDD');
    _prefix := _source_code || _date_str;
    _advisory_lock_id := hashtext('create_order_lock')::bigint;
    PERFORM pg_advisory_xact_lock(_advisory_lock_id);

    -- EC17: idempotent replay. Under the advisory lock (so this check + the
    -- INSERT below are atomic vs. concurrent order creation), a repeated key
    -- returns the already-created order rather than inserting a duplicate.
    _idem := NULLIF(_order_data->>'idempotency_key', '');
    IF _idem IS NOT NULL THEN
        SELECT to_jsonb(orders.*) INTO _result
        FROM public.orders
        WHERE idempotency_key = _idem
          AND (_tenant_id IS NULL OR tenant_id = _tenant_id)
        LIMIT 1;
        IF _result IS NOT NULL THEN
            RETURN _result;
        END IF;
    END IF;

    _generated_order_id := _order_data->>'order_id';
    IF _generated_order_id IS NULL OR _generated_order_id = '' THEN
        SELECT COALESCE(MAX(NULLIF(regexp_replace(SUBSTRING(order_id FROM length(_prefix) + 1), '\D', '', 'g'), '')::int), 0) INTO _count
        FROM public.orders WHERE order_id LIKE (_prefix || '%') AND created_at >= current_date
          AND (_tenant_id IS NULL OR tenant_id = _tenant_id);
        _generated_order_id := _prefix || lpad((_count + 1)::text, 3, '0');
        _order_data := jsonb_set(_order_data, '{order_id}', to_jsonb(_generated_order_id));
    END IF;

    SELECT COALESCE(MAX(sequence_number), 0) + 1 INTO _next_sequence_number FROM public.orders
    WHERE (_tenant_id IS NULL OR tenant_id = _tenant_id);
    _order_data := jsonb_set(_order_data, '{sequence_number}', to_jsonb(_next_sequence_number));
    _order_data := _order_data - 'id' - 'created_at' - 'updated_at';

    _items_safe := CASE WHEN jsonb_typeof(_order_data->'items') = 'array'
                        THEN _order_data->'items' ELSE '[]'::jsonb END;
    _attention_safe := CASE WHEN jsonb_typeof(_order_data->'attention_reasons') = 'array'
                            THEN _order_data->'attention_reasons' ELSE '[]'::jsonb END;

    INSERT INTO public.orders (
        order_id, sequence_number, customer_name, phone, secondary_phone, city, address_details,
        items, price, delivery_fee, discount_amount, priority, status, payment_status, is_return,
        is_shop_order, source, governorate_code, validated_governorate_code, notes, risk_metadata,
        needs_attention, attention_reasons, last_status_changed_by_name, last_status_changed_by_avatar,
        idempotency_key, tenant_id
    ) SELECT
        _order_data->>'order_id', (_order_data->>'sequence_number')::int4,
        _order_data->>'customer_name', _order_data->>'phone', _order_data->>'secondary_phone',
        _order_data->>'city', _order_data->>'address_details',
        _items_safe,
        (_order_data->>'price')::numeric,
        COALESCE((_order_data->>'delivery_fee'), '0')::numeric,
        COALESCE(_order_data->>'discount_amount', '0')::numeric,
        COALESCE(_order_data->>'priority', 'normal'),
        COALESCE(_order_data->>'status', 'confirmed'),
        COALESCE(_order_data->>'payment_status', 'cod'),
        COALESCE((_order_data->>'is_return')::boolean, false),
        COALESCE((_order_data->>'is_shop_order')::boolean, false),
        COALESCE(_order_data->>'source', 'manual'),
        _order_data->>'governorate_code', _order_data->>'validated_governorate_code',
        _order_data->>'notes', _order_data->'risk_metadata',
        COALESCE((_order_data->>'needs_attention')::boolean, false),
        ARRAY(SELECT jsonb_array_elements_text(_attention_safe)),
        _order_data->>'last_status_changed_by_name', _order_data->>'last_status_changed_by_avatar',
        _idem, _tenant_id
    RETURNING to_jsonb(orders.*) INTO _result;

    RETURN _result;
END;
$function$;
