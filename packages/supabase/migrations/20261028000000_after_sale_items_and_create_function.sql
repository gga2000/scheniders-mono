-- After-sale foundation, phase 2 (replacements/returns + refunds, 2026-10-28).
-- Design: claude.ai/artifact/HVvH7nixTEeD1zDhFUH8Af (replacements),
--         claude.ai/artifact/W3E295rmJsomFYyW25uRdT (refunds).
--
-- A replacement (RPL-) or refund (RTN-) stays an ordinary child order so the
-- courier, labels, Waseet and payroll keep working. What it adds:
--   after_sale_items        per child order: the original lines coming back
--                           ('back', with the money they are worth) and the
--                           new items going out ('out', replacements only),
--                           plus the receive-back intake of each back line.
--   after_sale_adjustments  money that is not an item: the delivery fee kept.
--   create_after_sale_order the only way to create one. It computes every
--                           amount itself; the app never sends a price.
--   receive_after_sale_item records the condition of an item that came back
--                           and moves stock accordingly.
--
-- Money convention on the child order (whole IQD):
--   price        = sum(out line amounts) - sum(back line amounts)
--   delivery_fee = the fee kept from the customer, 0 when the store absorbs it
--   courier amount = price + delivery_fee (computeCodAmount); negative means
--   the courier hands that much cash to the customer.
-- What a back line is worth: the original's price is spread across its lines
-- by line value with the last line taking the rounding; a partial quantity is
-- round(line_paid * qty / line_qty) and the last units of a line take what is
-- left, so repeated partials sum exactly (apps/platform/lib/refunds/refund-math.ts).
--
-- Tenant settings (tenants.settings->'after_sale'): default_fee_kept (IQD),
-- overdue_days. Read with defaults 0 and 10.
SET LOCAL lock_timeout = '3s';

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
CREATE TABLE public.after_sale_items (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    order_id            uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    original_order_id   uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    direction           text NOT NULL CHECK (direction IN ('back', 'out')),
    original_line_index integer CHECK (original_line_index >= 0),
    product_id          uuid,
    variant_id          uuid,
    name                text NOT NULL,
    unit_price          integer NOT NULL CHECK (unit_price >= 0),
    qty                 integer NOT NULL CHECK (qty > 0),
    amount              integer NOT NULL CHECK (amount >= 0),
    expects_back        boolean NOT NULL DEFAULT true,
    received_at         timestamptz,
    received_by         text,
    condition           text CHECK (condition IN ('sealed', 'opened_usable', 'damaged', 'missing')),
    disposition         text CHECK (disposition IN ('restock', 'open_box', 'write_off', 'not_returned')),
    inspected_note      text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT after_sale_items_line_shape CHECK (
        (direction = 'back' AND original_line_index IS NOT NULL)
        OR (direction = 'out' AND original_line_index IS NULL AND NOT expects_back)
    ),
    CONSTRAINT after_sale_items_intake_shape CHECK (
        (disposition IS NULL AND received_at IS NULL AND condition IS NULL)
        OR (direction = 'back' AND expects_back AND disposition IS NOT NULL
            AND (disposition = 'not_returned') = (received_at IS NULL))
    )
);

COMMENT ON TABLE public.after_sale_items IS
    'Lines of a replacement (RPL-) or refund (RTN-) child order: back = original line coming back, out = new item sent. Written only by create_after_sale_order / receive_after_sale_item.';

CREATE INDEX idx_after_sale_items_order ON public.after_sale_items(order_id);
CREATE INDEX idx_after_sale_items_original ON public.after_sale_items(original_order_id, original_line_index);
CREATE INDEX idx_after_sale_items_pending ON public.after_sale_items(tenant_id, created_at)
    WHERE direction = 'back' AND expects_back AND disposition IS NULL;

CREATE TABLE public.after_sale_adjustments (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    order_id    uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    kind        text NOT NULL CHECK (kind IN ('delivery_fee_kept')),
    -- Signed whole IQD: positive = the customer pays the store.
    amount      integer NOT NULL,
    note        text,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_after_sale_adjustments_order ON public.after_sale_adjustments(order_id);

-- Same-tenant integrity for both tables (order, original and catalog refs).
CREATE OR REPLACE FUNCTION public.after_sale_rows_same_tenant()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    PERFORM 1 FROM public.orders WHERE id = new.order_id AND tenant_id = new.tenant_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'after-sale row: order % is not an order of tenant %', new.order_id, new.tenant_id
            USING ERRCODE = '42501';
    END IF;
    IF tg_table_name = 'after_sale_items' THEN
        PERFORM 1 FROM public.orders WHERE id = new.original_order_id AND tenant_id = new.tenant_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'after-sale row: original % is not an order of tenant %', new.original_order_id, new.tenant_id
                USING ERRCODE = '42501';
        END IF;
    END IF;
    RETURN new;
END;
$function$;

REVOKE ALL ON FUNCTION public.after_sale_rows_same_tenant() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_after_sale_items_same_tenant
    BEFORE INSERT OR UPDATE OF tenant_id, order_id, original_order_id ON public.after_sale_items
    FOR EACH ROW EXECUTE FUNCTION public.after_sale_rows_same_tenant();
CREATE TRIGGER trg_after_sale_adjustments_same_tenant
    BEFORE INSERT OR UPDATE OF tenant_id, order_id ON public.after_sale_adjustments
    FOR EACH ROW EXECUTE FUNCTION public.after_sale_rows_same_tenant();

-- RLS: members read their tenant's rows; every write goes through the
-- SECURITY DEFINER functions below.
ALTER TABLE public.after_sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.after_sale_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY after_sale_items_select ON public.after_sale_items
    FOR SELECT TO authenticated
    USING (tenant_id IN (SELECT public.get_user_tenant_ids()));
CREATE POLICY after_sale_adjustments_select ON public.after_sale_adjustments
    FOR SELECT TO authenticated
    USING (tenant_id IN (SELECT public.get_user_tenant_ids()));

REVOKE ALL ON public.after_sale_items, public.after_sale_adjustments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.after_sale_items, public.after_sale_adjustments TO authenticated;
GRANT ALL ON public.after_sale_items, public.after_sale_adjustments TO service_role;

-- ---------------------------------------------------------------------------
-- 2. create_after_sale_order
-- ---------------------------------------------------------------------------
-- _lines     [{original_line int, qty int, expects_back bool?}]  lines coming back
-- _out_lines [{product_id uuid?, variant_id uuid?, qty int}]      replacement only
-- _fee_kept  IQD kept from the customer; NULL = the tenant's default
-- _charge_fee false = the store absorbs the fee (replacement only)
-- _reason_id  order_reasons row of this kind; _reason stays the label / note
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
            'is_open_box', coalesce((_item->>'is_open_box')::boolean, false));
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
                   p.name || CASE WHEN nullif(v.name, '') IS NULL THEN '' ELSE ' - ' || v.name END
              INTO _pid, _price, _name
              FROM public.product_variants v JOIN public.products p ON p.id = v.product_id
             WHERE v.id = _vid AND v.tenant_id = _tenant_id AND p.tenant_id = _tenant_id;
        ELSIF _pid IS NOT NULL THEN
            SELECT round(coalesce(p.price, 0))::integer, p.name INTO _price, _name
              FROM public.products p WHERE p.id = _pid AND p.tenant_id = _tenant_id;
        END IF;
        IF _price IS NULL THEN
            RAISE EXCEPTION 'new item is not a product of this store' USING ERRCODE = '42501';
        END IF;
        _out_total := _out_total + _price * _qty;
        _out := _out || jsonb_build_object('product_id', _pid, 'variant_id', _vid, 'name', _name,
                                           'unit_price', _price, 'qty', _qty);
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

    -- RTN-/RPL-<original number>-<n>
    _prefix := CASE _kind WHEN 'refund' THEN 'RTN' ELSE 'RPL' END;
    _base := _prefix || '-' || coalesce(_orig.sequence_number::text, _orig.order_id) || '-';
    _seq := 1;
    WHILE EXISTS (SELECT 1 FROM public.orders WHERE tenant_id = _tenant_id AND order_id = _base || _seq) LOOP
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
                    'price', b->'unit_price', 'quantity', b->'qty', 'is_open_box', b->'is_open_box')), '[]'::jsonb)
                  FROM jsonb_array_elements(_back) b)
            ELSE (SELECT coalesce(jsonb_agg(jsonb_build_object(
                    'product_id', o->'product_id', 'variant_id', o->'variant_id', 'name', o->'name',
                    'price', o->'unit_price', 'quantity', o->'qty')), '[]'::jsonb)
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

-- ---------------------------------------------------------------------------
-- 3. receive_after_sale_item: intake of a line that came back (or never did)
-- ---------------------------------------------------------------------------
-- _condition: sealed -> restock (+stock), opened_usable -> open_box (+open box),
--             damaged -> write_off, missing -> not_returned. The goods were
-- never in stock while travelling, so only restock and open_box move a pile.
CREATE OR REPLACE FUNCTION public.receive_after_sale_item(
    _tenant_id uuid,
    _item_id uuid,
    _condition text,
    _note text DEFAULT NULL,
    _received_by text DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _row  public.after_sale_items%ROWTYPE;
    _disp text;
BEGIN
    IF _tenant_id IS NULL THEN
        RAISE EXCEPTION 'receive_after_sale_item: tenant_id is required' USING ERRCODE = '22023';
    END IF;
    IF coalesce(auth.role(), 'service_role') <> 'service_role'
       AND _tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN
        RAISE EXCEPTION 'Unauthorized: tenant membership required' USING ERRCODE = '42501';
    END IF;
    _disp := CASE _condition
        WHEN 'sealed' THEN 'restock'
        WHEN 'opened_usable' THEN 'open_box'
        WHEN 'damaged' THEN 'write_off'
        WHEN 'missing' THEN 'not_returned'
    END;
    IF _disp IS NULL THEN
        RAISE EXCEPTION 'condition must be sealed, opened_usable, damaged or missing' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO _row FROM public.after_sale_items
     WHERE id = _item_id AND tenant_id = _tenant_id
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'after-sale line % not found', _item_id USING ERRCODE = '23503';
    END IF;
    IF _row.direction <> 'back' OR NOT _row.expects_back THEN
        RAISE EXCEPTION 'this line is not expected back' USING ERRCODE = '22023';
    END IF;
    IF _row.disposition IS NOT NULL THEN
        RAISE EXCEPTION 'this line was already received' USING ERRCODE = '22023';
    END IF;

    IF _disp IN ('restock', 'open_box') AND coalesce(_row.variant_id, _row.product_id) IS NOT NULL THEN
        IF _row.variant_id IS NOT NULL THEN
            UPDATE public.product_variants
               SET stock_quantity    = stock_quantity + CASE WHEN _disp = 'restock' THEN _row.qty ELSE 0 END,
                   open_box_quantity = coalesce(open_box_quantity, 0) + CASE WHEN _disp = 'open_box' THEN _row.qty ELSE 0 END
             WHERE id = _row.variant_id AND tenant_id = _tenant_id;
        ELSE
            UPDATE public.products
               SET stock_quantity    = stock_quantity + CASE WHEN _disp = 'restock' THEN _row.qty ELSE 0 END,
                   open_box_quantity = coalesce(open_box_quantity, 0) + CASE WHEN _disp = 'open_box' THEN _row.qty ELSE 0 END
             WHERE id = _row.product_id AND tenant_id = _tenant_id;
        END IF;
        IF FOUND THEN
            INSERT INTO public.inventory_ledger(tenant_id, product_id, variant_id, order_id, delta_reserved, delta_stock, delta_open_box, reason)
            VALUES (_tenant_id, CASE WHEN _row.variant_id IS NULL THEN _row.product_id END, _row.variant_id, _row.order_id, 0,
                    CASE WHEN _disp = 'restock' THEN _row.qty ELSE 0 END,
                    CASE WHEN _disp = 'open_box' THEN _row.qty ELSE 0 END,
                    'after_sale:' || _disp);
        END IF;
    END IF;

    UPDATE public.after_sale_items
       SET condition = CASE WHEN _disp = 'not_returned' THEN NULL ELSE _condition END,
           disposition = _disp,
           received_at = CASE WHEN _disp = 'not_returned' THEN NULL ELSE now() END,
           received_by = _received_by,
           inspected_note = _note
     WHERE id = _item_id
    RETURNING * INTO _row;

    RETURN to_jsonb(_row);
END;
$function$;

REVOKE ALL ON FUNCTION public.receive_after_sale_item(uuid, uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receive_after_sale_item(uuid, uuid, text, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. scheniders-iraq keeps its existing 5,000 IQD fee as the default
-- ---------------------------------------------------------------------------
UPDATE public.tenants
   SET settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{after_sale}',
                            jsonb_build_object('default_fee_kept', 5000, 'overdue_days', 10))
 WHERE slug = 'scheniders-iraq'
   AND NOT (coalesce(settings, '{}'::jsonb) ? 'after_sale');
