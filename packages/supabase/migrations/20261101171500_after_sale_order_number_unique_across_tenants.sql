-- =====================================================================
-- create_after_sale_order: RTN-/RPL- numbers unique across tenants
-- =====================================================================
-- Code review r16 #4 (P1, latent while one tenant is live). The function
-- names a refund/replacement RTN-/RPL-<sequence_number>-<n> and picked the
-- first n free WITHIN the tenant. sequence_number is per tenant, while
-- orders_order_id_key is UNIQUE(order_id) across every tenant (the order
-- number generator, manual order-number edits and the LightFunnels dedupe
-- all rely on that). So store B refunding its order #5 after store A
-- refunded its #5 hit unique_violation and the refund failed.
--
-- Fix: look for the free n across all tenants, under a transaction lock on
-- the base so two stores cannot pick the same n at once. The visible format
-- is unchanged (RTN-4030-1 stays RTN-4030-1); a second store simply gets the
-- next free n. The global index is kept on purpose: switching it to
-- (tenant_id, order_id) would also need the app code above changed.
--
-- Everything else is the live body verbatim (prosrc md5
-- 837c63d99e505d254c4d45b7f177e173 = 20261030082454_after_sale_item_pictures).
-- Grants restated: service_role only. Safe to run any time; no data change.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.create_after_sale_order(
    _tenant_id uuid,
    _original_order_id uuid,
    _kind text,
    _lines jsonb,
    _out_lines jsonb DEFAULT '[]'::jsonb,
    _fee_kept integer DEFAULT NULL,
    _charge_fee boolean DEFAULT true,
    _reason text DEFAULT NULL,
    _notes text DEFAULT NULL,
    _changed_by_name text DEFAULT NULL,
    _reason_id uuid DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _orig        public.orders%ROWTYPE;
    _items       jsonb;
    _n           integer;
    _paid_total  integer;
    _value_total numeric := 0;
    _alloc       integer := 0;
    _paid        integer[] := '{}';
    _line_qty    integer[] := '{}';
    _done_qty    integer[];
    _done_amt    integer[];
    _seen        integer[] := '{}';
    _i           integer;
    _l           jsonb;
    _idx         integer;
    _qty         integer;
    _remaining   integer;
    _amount      integer;
    _item        jsonb;
    _back        jsonb := '[]'::jsonb;
    _out         jsonb := '[]'::jsonb;
    _credit      integer := 0;
    _out_total   integer := 0;
    _fee         integer;
    _settings    jsonb;
    _pid         uuid;
    _vid         uuid;
    _price       integer;
    _name        text;
    _image       text;
    _tag         text;
    _prefix      text;
    _base        text;
    _seq         integer;
    _order_no    text;
    _child       jsonb;
    _child_id    uuid;
BEGIN
    IF _tenant_id IS NULL THEN
        RAISE EXCEPTION 'create_after_sale_order: tenant_id is required' USING ERRCODE = '22023';
    END IF;
    IF coalesce(auth.role(), 'service_role') <> 'service_role'
       AND _tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN
        RAISE EXCEPTION 'Unauthorized: tenant membership required' USING ERRCODE = '42501';
    END IF;
    IF _kind NOT IN ('refund', 'replacement') THEN
        RAISE EXCEPTION 'kind must be refund or replacement' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(_lines) = 0 THEN
        RAISE EXCEPTION 'at least one original line is required' USING ERRCODE = '22023';
    END IF;
    _out_lines := coalesce(_out_lines, '[]'::jsonb);
    IF jsonb_typeof(_out_lines) <> 'array' THEN
        RAISE EXCEPTION 'out lines must be an array' USING ERRCODE = '22023';
    END IF;
    IF _kind = 'replacement' AND jsonb_array_length(_out_lines) = 0 THEN
        RAISE EXCEPTION 'a replacement needs at least one new item' USING ERRCODE = '22023';
    END IF;
    IF _kind = 'refund' AND jsonb_array_length(_out_lines) > 0 THEN
        RAISE EXCEPTION 'a refund has no new items' USING ERRCODE = '22023';
    END IF;
    IF _reason_id IS NOT NULL THEN
        PERFORM 1 FROM public.order_reasons
         WHERE id = _reason_id AND (tenant_id = _tenant_id OR tenant_id IS NULL) AND kind = _kind;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'reason % is not a % reason of this store', _reason_id, _kind USING ERRCODE = '22023';
        END IF;
    END IF;
    IF _fee_kept IS NOT NULL AND _fee_kept < 0 THEN
        RAISE EXCEPTION 'fee kept cannot be negative' USING ERRCODE = '22023';
    END IF;

    -- The row lock serialises concurrent refunds/replacements of one original,
    -- so two of them can never both take the last unit of a line.
    SELECT * INTO _orig FROM public.orders
     WHERE id = _original_order_id AND tenant_id = _tenant_id
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'original order % is not an order of this tenant', _original_order_id USING ERRCODE = '23503';
    END IF;
    IF _orig.status NOT IN ('delivered', 'completed') THEN
        RAISE EXCEPTION 'only a delivered order can be refunded or replaced (status %)', _orig.status USING ERRCODE = '22023';
    END IF;
    IF _orig.is_return OR _orig.is_replacement THEN
        RAISE EXCEPTION 'start from the original sale, not from a refund or replacement order' USING ERRCODE = '22023';
    END IF;

    _items := CASE WHEN jsonb_typeof(_orig.items) = 'array' THEN _orig.items ELSE '[]'::jsonb END;
    _n := jsonb_array_length(_items);
    IF _n = 0 THEN
        RAISE EXCEPTION 'the original order has no items' USING ERRCODE = '22023';
    END IF;

    -- What the customer paid per line (arrays are 1-based; line index i is i+1).
    _paid_total := greatest(0, round(coalesce(_orig.price, 0))::integer);
    FOR _i IN 0 .. _n - 1 LOOP
        _item := _items->_i;
        _line_qty := _line_qty || greatest(0, round(coalesce((_item->>'quantity')::numeric, 0))::integer);
        _value_total := _value_total
            + greatest(0, coalesce((_item->>'price')::numeric, 0)) * _line_qty[_i + 1];
    END LOOP;
    FOR _i IN 0 .. _n - 1 LOOP
        _item := _items->_i;
        IF _i = _n - 1 THEN
            _amount := _paid_total - _alloc;
        ELSIF _value_total = 0 THEN
            _amount := 0;
        ELSE
            _amount := round(_paid_total
                * greatest(0, coalesce((_item->>'price')::numeric, 0)) * _line_qty[_i + 1]
                / _value_total)::integer;
        END IF;
        _alloc := _alloc + _amount;
        _paid := _paid || _amount;
    END LOOP;

    -- Units and money already taken back per line, by live children. A child
    -- that was cancelled, failed or rejected moved no goods and no money.
    _done_qty := array_fill(0, ARRAY[_n]);
    _done_amt := array_fill(0, ARRAY[_n]);
    FOR _l IN
        SELECT jsonb_build_object('i', a.original_line_index, 'q', sum(a.qty), 'a', sum(a.amount))
          FROM public.after_sale_items a
          JOIN public.orders c ON c.id = a.order_id
         WHERE a.original_order_id = _orig.id AND a.direction = 'back'
           AND c.status NOT IN ('cancelled', 'refund_failed', 'rejected')
         GROUP BY a.original_line_index
    LOOP
        _idx := (_l->>'i')::integer;
        IF _idx < _n THEN
            _done_qty[_idx + 1] := (_l->>'q')::integer;
            _done_amt[_idx + 1] := (_l->>'a')::integer;
        END IF;
    END LOOP;
    -- Children created before these tables have only their items: count their
    -- units against the matching line, valued at that line's unit share.
    FOR _l IN
        SELECT e
          FROM public.orders c
          CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(c.items) = 'array' THEN c.items ELSE '[]'::jsonb END) e
         WHERE c.original_order_id = _orig.id AND c.tenant_id = _tenant_id
           AND c.status NOT IN ('cancelled', 'refund_failed', 'rejected')
           AND NOT EXISTS (SELECT 1 FROM public.after_sale_items a WHERE a.order_id = c.id)
           AND (c.is_return OR c.is_replacement)
    LOOP
        FOR _i IN 0 .. _n - 1 LOOP
            _item := _items->_i;
            IF coalesce(nullif(_l->>'variant_id', ''), nullif(_l->>'product_id', ''), _l->>'name')
               = coalesce(nullif(_item->>'variant_id', ''), nullif(_item->>'product_id', ''), _item->>'name') THEN
                _qty := least(greatest(0, round(coalesce((_l->>'quantity')::numeric, 0))::integer),
                              _line_qty[_i + 1] - _done_qty[_i + 1]);
                IF _qty > 0 THEN
                    _done_amt[_i + 1] := _done_amt[_i + 1]
                        + round(_paid[_i + 1]::numeric * _qty / _line_qty[_i + 1])::integer;
                    _done_qty[_i + 1] := _done_qty[_i + 1] + _qty;
                END IF;
                EXIT;
            END IF;
        END LOOP;
    END LOOP;

    -- Lines coming back.
    FOR _l IN SELECT value FROM jsonb_array_elements(_lines) LOOP
        _idx := (_l->>'original_line')::integer;
        _qty := (_l->>'qty')::integer;
        IF _idx IS NULL OR _idx < 0 OR _idx >= _n THEN
            RAISE EXCEPTION 'original line % does not exist', _l->>'original_line' USING ERRCODE = '22023';
        END IF;
        IF _idx = ANY(_seen) THEN
            RAISE EXCEPTION 'original line % is listed twice', _idx USING ERRCODE = '22023';
        END IF;
        _seen := _seen || _idx;
        _remaining := _line_qty[_idx + 1] - _done_qty[_idx + 1];
        IF _qty IS NULL OR _qty <= 0 OR _qty > _remaining THEN
            RAISE EXCEPTION 'line % : % unit(s) asked, % left to take back', _idx, coalesce(_qty, 0), _remaining
                USING ERRCODE = '22023';
        END IF;
        _amount := CASE WHEN _qty = _remaining
                        THEN _paid[_idx + 1] - _done_amt[_idx + 1]
                        ELSE round(_paid[_idx + 1]::numeric * _qty / _line_qty[_idx + 1])::integer END;
        _item := _items->_idx;
        _credit := _credit + _amount;
        _back := _back || jsonb_build_object(
            'idx', _idx, 'qty', _qty, 'amount', _amount,
            'expects_back', coalesce((_l->>'expects_back')::boolean, true),
            'product_id', nullif(_item->>'product_id', ''), 'variant_id', nullif(_item->>'variant_id', ''),
            'name', coalesce(nullif(_item->>'name', ''), 'Item'),
            'unit_price', greatest(0, round(coalesce((_item->>'price')::numeric, 0))::integer),
            'is_open_box', coalesce((_item->>'is_open_box')::boolean, false),
            'image_url', coalesce(_item->>'image_url', ''), 'tag_color', coalesce(_item->>'tag_color', '#22c55e'));
    END LOOP;

    -- New items going out: priced from this tenant's catalog, never the client.
    FOR _l IN SELECT value FROM jsonb_array_elements(_out_lines) LOOP
        _qty := (_l->>'qty')::integer;
        IF _qty IS NULL OR _qty <= 0 THEN
            RAISE EXCEPTION 'new item quantity must be at least 1' USING ERRCODE = '22023';
        END IF;
        _vid := nullif(_l->>'variant_id', '')::uuid;
        _pid := nullif(_l->>'product_id', '')::uuid;
        IF _vid IS NOT NULL THEN
            SELECT v.product_id, round(coalesce(v.price, p.price, 0))::integer,
                   coalesce(nullif(btrim(p.short_name), ''), p.name)
                       || CASE WHEN nullif(v.name, '') IS NULL THEN '' ELSE ' - ' || v.name END,
                   coalesce(nullif(v.image_url, ''), p.image_url, ''), coalesce(p.tag_color, '#22c55e')
              INTO _pid, _price, _name, _image, _tag
              FROM public.product_variants v JOIN public.products p ON p.id = v.product_id
             WHERE v.id = _vid AND v.tenant_id = _tenant_id AND p.tenant_id = _tenant_id;
        ELSIF _pid IS NOT NULL THEN
            SELECT round(coalesce(p.price, 0))::integer, coalesce(nullif(btrim(p.short_name), ''), p.name),
                   coalesce(p.image_url, ''), coalesce(p.tag_color, '#22c55e')
              INTO _price, _name, _image, _tag
              FROM public.products p WHERE p.id = _pid AND p.tenant_id = _tenant_id;
        END IF;
        IF _price IS NULL THEN
            RAISE EXCEPTION 'new item is not a product of this store' USING ERRCODE = '42501';
        END IF;
        _out_total := _out_total + _price * _qty;
        _out := _out || jsonb_build_object('product_id', _pid, 'variant_id', _vid, 'name', _name,
                                           'unit_price', _price, 'qty', _qty,
                                           'image_url', _image, 'tag_color', _tag);
        _price := NULL;
    END LOOP;

    -- Fee kept: the tenant's default unless the merchant set one. A refund never
    -- goes below zero; a replacement keeps it only when the customer pays it.
    SELECT coalesce(settings->'after_sale', '{}'::jsonb) INTO _settings FROM public.tenants WHERE id = _tenant_id;
    _fee := coalesce(_fee_kept, (_settings->>'default_fee_kept')::integer, 0);
    IF _kind = 'refund' THEN
        _fee := least(_fee, _credit);
    ELSIF NOT _charge_fee THEN
        _fee := 0;
    END IF;

    -- RTN-/RPL-<original number>-<n>. sequence_number is per tenant but
    -- orders_order_id_key is UNIQUE(order_id) across ALL tenants, so the free
    -- n is looked for across all tenants. The lock makes two stores building
    -- the same base at once take turns instead of both picking the same n;
    -- only the number is read from other tenants' rows, nothing is returned.
    _prefix := CASE _kind WHEN 'refund' THEN 'RTN' ELSE 'RPL' END;
    _base := _prefix || '-' || coalesce(_orig.sequence_number::text, _orig.order_id) || '-';
    PERFORM pg_advisory_xact_lock(hashtextextended('create_after_sale_order:' || _base, 0));
    _seq := 1;
    WHILE EXISTS (SELECT 1 FROM public.orders WHERE order_id = _base || _seq) LOOP
        _seq := _seq + 1;
    END LOOP;
    _order_no := _base || _seq;

    _child := public.create_order_atomic(jsonb_build_object(
        'order_id', _order_no,
        'customer_name', _orig.customer_name,
        'phone', _orig.phone,
        'secondary_phone', _orig.secondary_phone,
        'city', _orig.city,
        'address_details', _orig.address_details,
        'governorate_code', _orig.governorate_code,
        'validated_governorate_code', _orig.validated_governorate_code,
        'source', coalesce(_orig.source, 'manual'),
        'items', CASE _kind
            WHEN 'refund' THEN (SELECT coalesce(jsonb_agg(jsonb_build_object(
                    'product_id', b->'product_id', 'variant_id', b->'variant_id', 'name', b->'name',
                    'price', b->'unit_price', 'quantity', b->'qty', 'is_open_box', b->'is_open_box',
                    'image_url', b->'image_url', 'tag_color', b->'tag_color')), '[]'::jsonb)
                  FROM jsonb_array_elements(_back) b)
            ELSE (SELECT coalesce(jsonb_agg(jsonb_build_object(
                    'product_id', o->'product_id', 'variant_id', o->'variant_id', 'name', o->'name',
                    'price', o->'unit_price', 'quantity', o->'qty',
                    'image_url', o->'image_url', 'tag_color', o->'tag_color')), '[]'::jsonb)
                  FROM jsonb_array_elements(_out) o)
            END,
        'price', _out_total - _credit,
        'delivery_fee', _fee,
        'status', CASE _kind WHEN 'refund' THEN 'return_pending' ELSE 'confirmed' END,
        'priority', 'high',
        'payment_status', 'cod',
        'is_return', _kind = 'refund',
        'is_replacement', _kind = 'replacement',
        'original_order_id', _orig.id,
        'notes', _notes,
        'rejection_reason', _reason,
        'last_status_changed_by_name', _changed_by_name
    ), _tenant_id);
    _child_id := (_child->>'id')::uuid;
    IF _reason_id IS NOT NULL THEN
        -- create_order_atomic does not take reason_id; Settings counts reason usage from it.
        UPDATE public.orders SET reason_id = _reason_id WHERE id = _child_id;
        _child := _child || jsonb_build_object('reason_id', _reason_id);
    END IF;

    INSERT INTO public.after_sale_items
        (tenant_id, order_id, original_order_id, direction, original_line_index, product_id, variant_id,
         name, unit_price, qty, amount, expects_back)
    SELECT _tenant_id, _child_id, _orig.id, 'back', (b->>'idx')::integer,
           (b->>'product_id')::uuid, (b->>'variant_id')::uuid, b->>'name',
           (b->>'unit_price')::integer, (b->>'qty')::integer, (b->>'amount')::integer,
           (b->>'expects_back')::boolean
      FROM jsonb_array_elements(_back) b;

    INSERT INTO public.after_sale_items
        (tenant_id, order_id, original_order_id, direction, original_line_index, product_id, variant_id,
         name, unit_price, qty, amount, expects_back)
    SELECT _tenant_id, _child_id, _orig.id, 'out', NULL,
           (o->>'product_id')::uuid, (o->>'variant_id')::uuid, o->>'name',
           (o->>'unit_price')::integer, (o->>'qty')::integer,
           (o->>'unit_price')::integer * (o->>'qty')::integer, false
      FROM jsonb_array_elements(_out) o;

    IF _fee > 0 THEN
        INSERT INTO public.after_sale_adjustments (tenant_id, order_id, kind, amount)
        VALUES (_tenant_id, _child_id, 'delivery_fee_kept', _fee);
    END IF;

    RETURN _child || jsonb_build_object(
        'after_sale', jsonb_build_object(
            'kind', _kind, 'credit', _credit, 'out_total', _out_total, 'fee_kept', _fee,
            'courier_amount', _out_total - _credit + _fee));
END;
$function$;

REVOKE ALL ON FUNCTION public.create_after_sale_order(uuid, uuid, text, jsonb, jsonb, integer, boolean, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_after_sale_order(uuid, uuid, text, jsonb, jsonb, integer, boolean, text, text, text, uuid) TO service_role;
