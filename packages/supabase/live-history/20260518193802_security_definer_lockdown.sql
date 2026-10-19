-- Phase 2: Security Definer Lockdown. See packages/supabase/migrations/20260518000000_security_definer_lockdown.sql

CREATE OR REPLACE FUNCTION public.create_order_atomic(_order_data jsonb, _tenant_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    _source_code text;
    _date_str text;
    _prefix text;
    _count int4;
    _next_sequence_number int4;
    _generated_order_id text;
    _result jsonb;
    _advisory_lock_id bigint;
    _item record;
BEGIN
    IF current_user <> 'service_role' THEN
        IF _tenant_id IS NULL THEN
            RAISE EXCEPTION 'tenant_id required' USING ERRCODE = '22023';
        END IF;
        IF _tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN
            RAISE EXCEPTION 'Unauthorized: not a member of tenant %', _tenant_id USING ERRCODE = '42501';
        END IF;
    END IF;

    _source_code := CASE WHEN (_order_data->>'source') = 'whatsapp' THEN '1'
                         WHEN (_order_data->>'source') = 'meta' THEN '2'
                         WHEN (_order_data->>'source') = 'tiktok' THEN '3'
                         ELSE '4' END;
    _date_str := to_char(current_date, 'YYMMDD');
    _prefix := _source_code || _date_str;
    _advisory_lock_id := hashtext('create_order_lock')::bigint;
    PERFORM pg_advisory_xact_lock(_advisory_lock_id);

    _generated_order_id := _order_data->>'order_id';
    IF _generated_order_id IS NULL OR _generated_order_id = '' THEN
        SELECT COALESCE(
            MAX(NULLIF(regexp_replace(SUBSTRING(order_id FROM length(_prefix) + 1), '\D', '', 'g'), '')::int), 0
        ) INTO _count
        FROM public.orders
        WHERE order_id LIKE (_prefix || '%')
          AND created_at >= current_date
          AND (_tenant_id IS NULL OR tenant_id = _tenant_id);
        _generated_order_id := _prefix || lpad((_count + 1)::text, 3, '0');
        _order_data := jsonb_set(_order_data, '{order_id}', to_jsonb(_generated_order_id));
    END IF;

    SELECT COALESCE(MAX(sequence_number), 0) + 1 INTO _next_sequence_number
    FROM public.orders
    WHERE (_tenant_id IS NULL OR tenant_id = _tenant_id);
    _order_data := jsonb_set(_order_data, '{sequence_number}', to_jsonb(_next_sequence_number));

    _order_data := _order_data - 'id' - 'created_at' - 'updated_at';

    INSERT INTO public.orders (
        order_id, sequence_number, customer_name, phone, secondary_phone, city, address_details,
        items, price, delivery_fee, discount_amount, priority, status,
        payment_status, is_return, is_shop_order, source, governorate_code, validated_governorate_code,
        notes, risk_metadata, needs_attention, attention_reasons,
        last_status_changed_by_name, last_status_changed_by_avatar,
        tenant_id
    )
    SELECT
        _order_data->>'order_id',
        (_order_data->>'sequence_number')::int4,
        _order_data->>'customer_name',
        _order_data->>'phone',
        _order_data->>'secondary_phone',
        _order_data->>'city',
        _order_data->>'address_details',
        COALESCE(_order_data->'items', '[]'::jsonb),
        (_order_data->>'price')::numeric,
        COALESCE((_order_data->>'delivery_fee'), '0')::numeric,
        COALESCE(_order_data->>'discount_amount', '0')::numeric,
        COALESCE(_order_data->>'priority', 'normal'),
        COALESCE(_order_data->>'status', 'confirmed'),
        COALESCE(_order_data->>'payment_status', 'cod'),
        COALESCE((_order_data->>'is_return')::boolean, false),
        COALESCE((_order_data->>'is_shop_order')::boolean, false),
        COALESCE(_order_data->>'source', 'manual'),
        _order_data->>'governorate_code',
        _order_data->>'validated_governorate_code',
        _order_data->>'notes',
        _order_data->'risk_metadata',
        COALESCE((_order_data->>'needs_attention')::boolean, false),
        ARRAY(SELECT jsonb_array_elements_text(COALESCE(_order_data->'attention_reasons', '[]'::jsonb))),
        _order_data->>'last_status_changed_by_name',
        _order_data->>'last_status_changed_by_avatar',
        _tenant_id
    RETURNING to_jsonb(orders.*) INTO _result;

    FOR _item IN SELECT * FROM jsonb_array_elements(_order_data->'items')
    LOOP
        IF (_item.value->>'variant_id') IS NOT NULL AND (_item.value->>'variant_id') != '' THEN
            UPDATE public.product_variants
            SET stock_quantity = GREATEST(0, stock_quantity - COALESCE((_item.value->>'quantity')::int, 1))
            WHERE id = (_item.value->>'variant_id')::uuid;
        ELSE
            UPDATE public.products
            SET stock_quantity = GREATEST(0, stock_quantity - COALESCE((_item.value->>'quantity')::int, 1))
            WHERE id = (_item.value->>'product_id')::uuid;
        END IF;
    END LOOP;

    RETURN _result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_order_atomic(_order_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    IF current_user <> 'service_role' THEN
        RAISE EXCEPTION 'create_order_atomic(jsonb) is deprecated - call create_order_atomic(jsonb, uuid) with an explicit tenant_id' USING ERRCODE = '42501';
    END IF;
    RETURN public.create_order_atomic(_order_data, NULL::uuid);
END;
$function$;

CREATE OR REPLACE FUNCTION public.split_order_atomic(_original_order_id uuid, _kept_items jsonb, _returned_items jsonb, _tenant_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    _original_order record;
    _kept_total numeric := 0;
    _returned_total numeric := 0;
    _total_original numeric;
    _kept_ratio numeric;
    _new_discount numeric;
    _return_discount numeric;
    _new_price numeric;
    _return_price numeric;
    _return_order_data jsonb;
    _item jsonb;
    _created_return_order jsonb;
BEGIN
    IF current_user <> 'service_role' THEN
        IF _tenant_id IS NULL THEN
            RAISE EXCEPTION 'tenant_id required' USING ERRCODE = '22023';
        END IF;
        IF _tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN
            RAISE EXCEPTION 'Unauthorized: not a member of tenant %', _tenant_id USING ERRCODE = '42501';
        END IF;
    END IF;

    SELECT * INTO _original_order
    FROM public.orders
    WHERE id = _original_order_id
      AND (_tenant_id IS NULL OR tenant_id = _tenant_id)
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Original order not found';
    END IF;

    FOR _item IN SELECT * FROM jsonb_array_elements(_kept_items)
    LOOP
        _kept_total := _kept_total + ((_item->>'price')::numeric * (_item->>'quantity')::numeric);
    END LOOP;
    FOR _item IN SELECT * FROM jsonb_array_elements(_returned_items)
    LOOP
        _returned_total := _returned_total + ((_item->>'price')::numeric * (_item->>'quantity')::numeric);
    END LOOP;

    _total_original := _kept_total + _returned_total;
    IF _total_original > 0 THEN
        _kept_ratio := _kept_total / _total_original;
    ELSE
        _kept_ratio := 1;
    END IF;

    _new_discount := ROUND(COALESCE(_original_order.discount_amount, 0) * _kept_ratio);
    _return_discount := COALESCE(_original_order.discount_amount, 0) - _new_discount;
    _new_price := _kept_total + COALESCE(_original_order.delivery_fee, 0) - _new_discount;
    _return_price := _returned_total - _return_discount;

    UPDATE public.orders
    SET items = _kept_items,
        price = _new_price,
        discount_amount = _new_discount,
        status = 'delivered',
        delivered_at = NOW()
    WHERE id = _original_order_id;

    _return_order_data := (to_jsonb(_original_order)
        || jsonb_build_object(
            'items', _returned_items,
            'price', _return_price,
            'discount_amount', _return_discount,
            'status', 'rejected',
            'is_return', true,
            'original_order_id', _original_order.id,
            'rejection_reason', 'Partial Return'
        ))
        - 'id' - 'created_at' - 'updated_at' - 'order_id'
        - 'last_batch_id' - 'delivery_order_id' - 'sequence_number'
        - 'delivered_at' - 'cancelled_at' - 'printed_at' - 'print_count'
        - 'tenant_id';

    _created_return_order := create_order_atomic(_return_order_data, _tenant_id);

    RETURN _created_return_order;
END;
$function$;

CREATE OR REPLACE FUNCTION public.split_order_atomic(_original_order_id uuid, _kept_items jsonb, _returned_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    IF current_user <> 'service_role' THEN
        RAISE EXCEPTION 'split_order_atomic/3 is deprecated - call the 4-arg version with an explicit tenant_id' USING ERRCODE = '42501';
    END IF;
    RETURN public.split_order_atomic(_original_order_id, _kept_items, _returned_items, NULL::uuid);
END;
$function$;

CREATE OR REPLACE FUNCTION public.charge_wallet_atomic(_tenant_id uuid, _amount numeric, _description text DEFAULT 'Order charge'::text, _order_id text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    _current_balance numeric;
    _new_balance numeric;
    _total_charged numeric;
    _wallet_id uuid;
BEGIN
    IF current_user <> 'service_role' THEN
        IF _tenant_id IS NULL THEN
            RAISE EXCEPTION 'tenant_id required' USING ERRCODE = '22023';
        END IF;
        IF _tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN
            RAISE EXCEPTION 'Unauthorized: not a member of tenant %', _tenant_id USING ERRCODE = '42501';
        END IF;
    END IF;

    SELECT id, balance_iqd, total_charged_iqd
    INTO _wallet_id, _current_balance, _total_charged
    FROM wallet
    WHERE tenant_id = _tenant_id
    FOR UPDATE;
    IF _wallet_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No wallet found');
    END IF;

    _new_balance := _current_balance - _amount;
    IF _new_balance < -10000 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Insufficient balance',
            'balance', _current_balance
        );
    END IF;

    UPDATE wallet
    SET balance_iqd = _new_balance,
        total_charged_iqd = _total_charged + _amount,
        updated_at = now()
    WHERE id = _wallet_id;

    INSERT INTO wallet_transactions (tenant_id, type, amount_iqd, balance_after_iqd, description, reference_id)
    VALUES (_tenant_id, 'charge', -_amount, _new_balance, _description, _order_id);

    RETURN jsonb_build_object(
        'success', true,
        'previous_balance', _current_balance,
        'charged', _amount,
        'new_balance', _new_balance
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.calculate_lead_score(p_lead_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_score INTEGER := 0;
    v_lead RECORD;
    v_breakdown JSONB := '{}'::jsonb;
    v_engagement_rate NUMERIC;
    v_followers_score INTEGER := 0;
    v_engagement_score INTEGER := 0;
    v_orders_score INTEGER := 0;
    v_contact_score INTEGER := 0;
    v_platform_score INTEGER := 0;
    v_responsiveness_score INTEGER := 0;
    v_store_score INTEGER := 0;
BEGIN
    IF current_user <> 'service_role' THEN
        RAISE EXCEPTION 'calculate_lead_score is restricted to admin/system callers' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
    IF NOT FOUND THEN RETURN 0; END IF;

    IF v_lead.follower_count >= 100000 THEN v_followers_score := 20;
    ELSIF v_lead.follower_count >= 50000 THEN v_followers_score := 16;
    ELSIF v_lead.follower_count >= 10000 THEN v_followers_score := 12;
    ELSIF v_lead.follower_count >= 5000 THEN v_followers_score := 8;
    ELSIF v_lead.follower_count >= 1000 THEN v_followers_score := 4;
    ELSE v_followers_score := 1;
    END IF;

    IF v_lead.follower_count > 0 THEN
        v_engagement_rate := (COALESCE(v_lead.avg_like_count, 0) + COALESCE(v_lead.avg_comments_count, 0))::NUMERIC
                             / v_lead.follower_count * 100;
        IF v_engagement_rate >= 5 THEN v_engagement_score := 20;
        ELSIF v_engagement_rate >= 3 THEN v_engagement_score := 15;
        ELSIF v_engagement_rate >= 1 THEN v_engagement_score := 10;
        ELSE v_engagement_score := 5;
        END IF;
    END IF;

    IF v_lead.estimated_daily_orders >= 50 THEN v_orders_score := 15;
    ELSIF v_lead.estimated_daily_orders >= 20 THEN v_orders_score := 12;
    ELSIF v_lead.estimated_daily_orders >= 5 THEN v_orders_score := 8;
    ELSIF v_lead.estimated_daily_orders >= 1 THEN v_orders_score := 4;
    END IF;

    IF v_lead.management_name IS NOT NULL THEN v_contact_score := v_contact_score + 3; END IF;
    IF jsonb_array_length(v_lead.phone_numbers) > 0 THEN v_contact_score := v_contact_score + 4; END IF;
    IF v_lead.page_phone IS NOT NULL THEN v_contact_score := v_contact_score + 3; END IF;

    IF v_lead.platform IN ('instagram', 'tiktok') THEN v_platform_score := 10;
    ELSIF v_lead.platform IN ('facebook', 'snapchat') THEN v_platform_score := 7;
    ELSIF v_lead.platform IN ('youtube', 'website') THEN v_platform_score := 5;
    ELSE v_platform_score := 3;
    END IF;

    IF v_lead.last_contacted_at IS NOT NULL THEN
        IF v_lead.last_contacted_at > now() - interval '3 days' THEN v_responsiveness_score := 15;
        ELSIF v_lead.last_contacted_at > now() - interval '7 days' THEN v_responsiveness_score := 10;
        ELSIF v_lead.last_contacted_at > now() - interval '30 days' THEN v_responsiveness_score := 5;
        END IF;
    END IF;

    IF v_lead.prospect_tenant_id IS NOT NULL THEN v_store_score := 10; END IF;

    v_score := v_followers_score + v_engagement_score + v_orders_score +
               v_contact_score + v_platform_score + v_responsiveness_score + v_store_score;
    v_score := LEAST(v_score, 100);

    v_breakdown := jsonb_build_object(
        'followers', v_followers_score,
        'engagement', v_engagement_score,
        'orders', v_orders_score,
        'contact', v_contact_score,
        'platform', v_platform_score,
        'responsiveness', v_responsiveness_score,
        'store', v_store_score
    );

    UPDATE public.leads
    SET lead_score = v_score,
        score_breakdown = v_breakdown,
        updated_at = now()
    WHERE id = p_lead_id;

    RETURN v_score;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_order_atomic(jsonb)              FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_order_atomic(jsonb, uuid)        FROM anon;
REVOKE EXECUTE ON FUNCTION public.split_order_atomic(uuid, jsonb, jsonb)  FROM anon;
REVOKE EXECUTE ON FUNCTION public.split_order_atomic(uuid, jsonb, jsonb, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.charge_wallet_atomic(uuid, numeric, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.calculate_lead_score(uuid)              FROM anon;
REVOKE EXECUTE ON FUNCTION public.calculate_lead_score(uuid)              FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_order_usage(uuid)             FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_usage_tracking(uuid, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.refresh_customer_aggregates()           FROM anon;
REVOKE EXECUTE ON FUNCTION public.toggle_seed_automation(boolean)         FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.progress_seed_orders()                  FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_seed_orders()                  FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_seed_automation_status()            FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_tenant_admin(uuid)                   FROM anon;
REVOKE EXECUTE ON FUNCTION public.tenant_block_active(uuid, text)         FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_current_tenant_id()                 FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_tenant_ids()                   FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_paginated_customers(text, text, text, text, boolean, integer, integer, bigint, bigint, integer, text, text, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_customer_dashboard_stats()          FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_customer_percentile(text, text)     FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_customer_score_audit_log(text, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_customer_trust_history(text, integer) FROM anon;
;
