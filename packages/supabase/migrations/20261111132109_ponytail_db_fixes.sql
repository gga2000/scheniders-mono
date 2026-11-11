-- Repo audit (ponytail) round A: database fixes F5, F16, F17, F18, F19, F22.

-- F16. A shortfall carried to the next payroll is a new pending advance. It was
-- tied to its origin by payroll_id, which the next run overwrites when it deducts
-- it, so voiding the origin afterwards un-deducted the origin's advances while the
-- carry stayed deducted: the same debt was taken twice. The origin now lives in its
-- own column, and payroll_id keeps meaning "deducted by".
ALTER TABLE public.salary_advances
    ADD COLUMN IF NOT EXISTS carried_from_payroll_id uuid
        REFERENCES public.payroll_records(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_salary_advances_carried_from
    ON public.salary_advances (carried_from_payroll_id)
    WHERE carried_from_payroll_id IS NOT NULL;

UPDATE public.salary_advances
   SET carried_from_payroll_id = payroll_id, payroll_id = NULL
 WHERE reason LIKE 'Carried over from payroll ending %'
   AND payroll_id IS NOT NULL AND NOT is_deducted AND carried_from_payroll_id IS NULL;

CREATE OR REPLACE FUNCTION public.run_payroll(p_employee_id uuid, p_period_start date, p_period_end date, p_base_salary numeric, p_completed_orders_count integer, p_order_bonus numeric, p_absence_days integer, p_absence_deduction numeric, p_notes text DEFAULT NULL::text, p_payment_method text DEFAULT 'cash'::text, p_amount_paid numeric DEFAULT NULL::numeric)
 RETURNS payroll_records
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_tenant uuid := public.require_current_tenant();
    v_adv numeric;
    v_pen numeric;
    v_bon numeric;
    v_carry numeric;
    v_gross numeric;
    v_raw_net numeric;
    v_net numeric;
    v_record public.payroll_records;
BEGIN
    IF NOT public.is_tenant_admin(v_tenant) THEN
        RAISE EXCEPTION 'admins only' USING ERRCODE = '42501';
    END IF;
    IF p_period_end < p_period_start THEN
        RAISE EXCEPTION 'invalid period' USING ERRCODE = '22023';
    END IF;
    IF least(p_base_salary, p_order_bonus, p_absence_deduction) < 0
       OR least(p_completed_orders_count, p_absence_days) < 0 THEN
        RAISE EXCEPTION 'negative payroll amounts' USING ERRCODE = '22023';
    END IF;
    IF p_amount_paid IS NOT NULL AND (p_amount_paid < 0 OR p_amount_paid <> round(p_amount_paid)) THEN
        RAISE EXCEPTION 'amount paid must be a whole, non-negative amount' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.tenant_members tm
         WHERE tm.tenant_id = v_tenant AND tm.user_id = p_employee_id
    ) THEN
        RAISE EXCEPTION 'employee is not a member of this store' USING ERRCODE = '42501';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(v_tenant::text || p_employee_id::text, 0));

    IF EXISTS (
        SELECT 1 FROM public.payroll_records r
         WHERE r.tenant_id = v_tenant AND r.employee_id = p_employee_id
           AND r.status = 'paid'
           AND r.period_start <= p_period_end AND r.period_end >= p_period_start
    ) THEN
        RAISE EXCEPTION 'overlaps an existing paid payroll' USING ERRCODE = '23P01';
    END IF;

    SELECT coalesce(sum(amount), 0) INTO v_adv FROM public.salary_advances
     WHERE tenant_id = v_tenant AND employee_id = p_employee_id AND NOT is_deducted;
    SELECT coalesce(sum(amount), 0) INTO v_pen FROM public.salary_penalties
     WHERE tenant_id = v_tenant AND employee_id = p_employee_id AND NOT is_applied;
    SELECT coalesce(sum(amount), 0) INTO v_bon FROM public.performance_bonuses
     WHERE tenant_id = v_tenant AND employee_id = p_employee_id AND NOT is_applied
       AND carried_from_payroll_id IS NULL;
    SELECT coalesce(sum(amount), 0) INTO v_carry FROM public.performance_bonuses
     WHERE tenant_id = v_tenant AND employee_id = p_employee_id AND NOT is_applied
       AND carried_from_payroll_id IS NOT NULL;

    v_gross := p_base_salary + p_order_bonus + v_bon;
    v_raw_net := v_gross + v_carry - p_absence_deduction - v_adv - v_pen;
    v_net := greatest(0, v_raw_net);

    IF p_amount_paid IS NOT NULL AND p_amount_paid > v_net THEN
        RAISE EXCEPTION 'amount paid is more than the net payable' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.payroll_records (
        tenant_id, employee_id, period_start, period_end, base_salary,
        completed_orders_count, order_bonus, performance_bonuses_total,
        advances_deducted, penalties_deducted, absence_days, absence_deduction,
        gross_salary, carried_in, net_salary, amount_paid, status, paid_at, paid_by, notes, payment_method
    ) VALUES (
        v_tenant, p_employee_id, p_period_start, p_period_end, p_base_salary,
        p_completed_orders_count, p_order_bonus, v_bon,
        v_adv, v_pen, p_absence_days, p_absence_deduction,
        v_gross, v_carry, v_net,
        CASE WHEN p_amount_paid IS NULL OR p_amount_paid = v_net THEN NULL ELSE p_amount_paid END,
        'paid', now(), auth.uid(), p_notes, p_payment_method
    ) RETURNING * INTO v_record;

    UPDATE public.salary_advances SET is_deducted = true, payroll_id = v_record.id
     WHERE tenant_id = v_tenant AND employee_id = p_employee_id AND NOT is_deducted;
    UPDATE public.salary_penalties SET is_applied = true, payroll_id = v_record.id
     WHERE tenant_id = v_tenant AND employee_id = p_employee_id AND NOT is_applied;
    UPDATE public.performance_bonuses SET is_applied = true, payroll_id = v_record.id
     WHERE tenant_id = v_tenant AND employee_id = p_employee_id AND NOT is_applied;

    -- Deductions that exceed what was earned are carried to the next payroll as a new
    -- pending advance instead of being forgiven. Voiding the record deletes it again.
    IF v_raw_net < 0 THEN
        INSERT INTO public.salary_advances (tenant_id, employee_id, amount, reason, created_by, is_deducted, carried_from_payroll_id)
        VALUES (v_tenant, p_employee_id, -v_raw_net,
                'Carried over from payroll ending ' || p_period_end, auth.uid(), false, v_record.id);
    END IF;

    -- Part-payment: what was not handed over is still owed and joins the next payroll.
    IF p_amount_paid IS NOT NULL AND p_amount_paid < v_net THEN
        INSERT INTO public.performance_bonuses (tenant_id, employee_id, amount, reason, created_by, is_applied, carried_from_payroll_id)
        VALUES (v_tenant, p_employee_id, v_net - p_amount_paid,
                'Still owed from payroll ending ' || p_period_end, auth.uid(), false, v_record.id);
    END IF;

    RETURN v_record;
END;
$function$;

CREATE OR REPLACE FUNCTION public.void_payroll(p_record_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_tenant uuid := public.require_current_tenant();
    v_status text;
    v_employee uuid;
BEGIN
    IF NOT public.is_tenant_admin(v_tenant) THEN
        RAISE EXCEPTION 'admins only' USING ERRCODE = '42501';
    END IF;

    -- Same per-employee lock run_payroll takes before it reads or writes anything, and
    -- taken BEFORE the row lock below so the two functions cannot deadlock.
    SELECT employee_id INTO v_employee FROM public.payroll_records
     WHERE id = p_record_id AND tenant_id = v_tenant;
    IF v_employee IS NULL THEN
        RAISE EXCEPTION 'payroll record not found' USING ERRCODE = 'P0002';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(v_tenant::text || v_employee::text, 0));

    SELECT status INTO v_status FROM public.payroll_records
     WHERE id = p_record_id AND tenant_id = v_tenant FOR UPDATE;
    IF v_status IS NULL THEN
        RAISE EXCEPTION 'payroll record not found' USING ERRCODE = 'P0002';
    END IF;
    IF v_status <> 'paid' THEN
        RAISE EXCEPTION 'only a paid payroll can be voided' USING ERRCODE = '22023';
    END IF;
    -- Its unpaid rest was already paid out by a later payroll: void that one first.
    IF EXISTS (
        SELECT 1 FROM public.performance_bonuses
         WHERE tenant_id = v_tenant AND carried_from_payroll_id = p_record_id AND is_applied
    ) THEN
        RAISE EXCEPTION 'its unpaid rest was paid in a later payroll; void that payroll first' USING ERRCODE = '22023';
    END IF;
    -- Its shortfall was already deducted by a later payroll: voiding this one alone would
    -- hand its advances back while the carry stays deducted, taking the debt twice.
    IF EXISTS (
        SELECT 1 FROM public.salary_advances
         WHERE tenant_id = v_tenant AND carried_from_payroll_id = p_record_id AND is_deducted
    ) THEN
        RAISE EXCEPTION 'its shortfall was deducted in a later payroll; void that payroll first' USING ERRCODE = '22023';
    END IF;

    -- Carry-overs created by run_payroll: still pending and tied to this record.
    DELETE FROM public.salary_advances
     WHERE tenant_id = v_tenant AND carried_from_payroll_id = p_record_id AND NOT is_deducted;
    DELETE FROM public.performance_bonuses
     WHERE tenant_id = v_tenant AND carried_from_payroll_id = p_record_id AND NOT is_applied;

    UPDATE public.salary_advances SET is_deducted = false, payroll_id = NULL
     WHERE tenant_id = v_tenant AND payroll_id = p_record_id;
    UPDATE public.salary_penalties SET is_applied = false, payroll_id = NULL
     WHERE tenant_id = v_tenant AND payroll_id = p_record_id;
    UPDATE public.performance_bonuses SET is_applied = false, payroll_id = NULL
     WHERE tenant_id = v_tenant AND payroll_id = p_record_id;

    UPDATE public.payroll_records SET status = 'voided'
     WHERE id = p_record_id AND tenant_id = v_tenant;
END;
$function$;

-- F17. Receiving a returned item moves stock, so it needs orders.edit like every other
-- order write; membership alone let a viewer restock.
CREATE OR REPLACE FUNCTION public.receive_after_sale_item(_tenant_id uuid, _item_id uuid, _condition text, _note text DEFAULT NULL::text, _received_by text DEFAULT NULL::text)
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
       AND (_tenant_id NOT IN (SELECT public.get_user_tenant_ids())
            OR NOT public.has_tenant_permission(_tenant_id, 'orders.edit')) THEN
        RAISE EXCEPTION 'Unauthorized: orders.edit permission required' USING ERRCODE = '42501';
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

-- F18. Two orders holding the same products in a different item order locked the
-- stock rows in opposite order and deadlocked (8 seen live). Every caller now moves
-- the rows in one fixed order.
CREATE OR REPLACE FUNCTION public.inv_apply(p_order_id uuid, p_items jsonb, p_status text, p_sign integer, p_tenant_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_phase text := public.inv_phase(p_status);
    v_item jsonb; v_pid uuid; v_vid uuid; v_qty integer; v_is_ob boolean;
BEGIN
    IF v_phase = 'CLOSED' THEN RETURN; END IF;
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN RETURN; END IF;
    IF p_tenant_id IS NULL THEN RETURN; END IF;

    FOR v_item IN
        SELECT value FROM jsonb_array_elements(p_items)
         ORDER BY coalesce(nullif(value->>'variant_id', ''), value->>'product_id')
    LOOP
        v_qty := COALESCE(round((v_item->>'quantity')::numeric)::integer, 0);
        -- F-001: a negative quantity used to invert the movement (FULFILLED
        -- with -n added n to stock). Orders reject it now; skip it here too.
        IF v_qty <= 0 THEN CONTINUE; END IF;
        v_is_ob := COALESCE((v_item->>'is_open_box')::boolean, false);
        v_vid := NULL; v_pid := NULL;
        IF nullif(v_item->>'variant_id','') IS NOT NULL
           AND (v_item->>'variant_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
            v_vid := (v_item->>'variant_id')::uuid;
        ELSIF nullif(v_item->>'product_id','') IS NOT NULL
              AND (v_item->>'product_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
            v_pid := (v_item->>'product_id')::uuid;
        ELSE CONTINUE; END IF;

        -- F-001: every UPDATE is scoped to the order's tenant, and the ledger
        -- row is written only when one of that tenant's rows moved.
        IF v_is_ob THEN
            IF v_vid IS NOT NULL THEN
                UPDATE public.product_variants SET open_box_quantity = COALESCE(open_box_quantity,0) - p_sign * v_qty
                 WHERE id = v_vid AND tenant_id = p_tenant_id;
            ELSE
                UPDATE public.products SET open_box_quantity = COALESCE(open_box_quantity,0) - p_sign * v_qty
                 WHERE id = v_pid AND tenant_id = p_tenant_id;
            END IF;
            IF NOT FOUND THEN CONTINUE; END IF;
            INSERT INTO public.inventory_ledger(tenant_id, product_id, variant_id, order_id, delta_reserved, delta_stock, delta_open_box, reason)
            VALUES (p_tenant_id, v_pid, v_vid, p_order_id, 0, 0, -(p_sign * v_qty),
                    'trigger:OPEN_BOX:' || (CASE WHEN p_sign > 0 THEN 'apply' ELSE 'reverse' END));
        ELSIF v_phase = 'RESERVED' THEN
            IF v_vid IS NOT NULL THEN
                UPDATE public.product_variants SET reserved_quantity = COALESCE(reserved_quantity,0) + p_sign * v_qty
                 WHERE id = v_vid AND tenant_id = p_tenant_id;
            ELSE
                UPDATE public.products SET reserved_quantity = COALESCE(reserved_quantity,0) + p_sign * v_qty
                 WHERE id = v_pid AND tenant_id = p_tenant_id;
            END IF;
            IF NOT FOUND THEN CONTINUE; END IF;
            INSERT INTO public.inventory_ledger(tenant_id, product_id, variant_id, order_id, delta_reserved, delta_stock, delta_open_box, reason)
            VALUES (p_tenant_id, v_pid, v_vid, p_order_id, p_sign * v_qty, 0, 0,
                    'trigger:RESERVED:' || (CASE WHEN p_sign > 0 THEN 'apply' ELSE 'reverse' END));
        ELSIF v_phase = 'FULFILLED' THEN
            IF v_vid IS NOT NULL THEN
                UPDATE public.product_variants SET stock_quantity = COALESCE(stock_quantity,0) - p_sign * v_qty
                 WHERE id = v_vid AND tenant_id = p_tenant_id;
            ELSE
                UPDATE public.products SET stock_quantity = COALESCE(stock_quantity,0) - p_sign * v_qty
                 WHERE id = v_pid AND tenant_id = p_tenant_id;
            END IF;
            IF NOT FOUND THEN CONTINUE; END IF;
            INSERT INTO public.inventory_ledger(tenant_id, product_id, variant_id, order_id, delta_reserved, delta_stock, delta_open_box, reason)
            VALUES (p_tenant_id, v_pid, v_vid, p_order_id, 0, -(p_sign * v_qty), 0,
                    'trigger:FULFILLED:' || (CASE WHEN p_sign > 0 THEN 'apply' ELSE 'reverse' END));
        END IF;
    END LOOP;
END;
$function$;

-- F19. Revenue now follows the client's one definition (lib/order-revenue.ts): test
-- orders never count, and today's revenue is bucketed on the Baghdad day the money
-- was earned (delivered_at, else completed_at), not the day the order was placed.
-- The date window is sargable on created_at, and the city/product option lists are
-- bounded by the same window instead of scanning the whole book on every call.
CREATE OR REPLACE FUNCTION public.get_orders_aggregates(_tenant_id uuid, _date_from date DEFAULT NULL::date, _date_to date DEFAULT NULL::date, _city text DEFAULT NULL::text, _product text DEFAULT NULL::text, _priority text DEFAULT NULL::text, _payment_status text DEFAULT NULL::text, _is_return boolean DEFAULT NULL::boolean, _order_type text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    _today date := (timezone('Asia/Baghdad', now()))::date;
    -- Baghdad midnights bounding the window: created_at >= _from_ts AND < _to_ts.
    _from_ts timestamptz := CASE WHEN _date_from IS NULL THEN NULL ELSE _date_from::timestamp AT TIME ZONE 'Asia/Baghdad' END;
    _to_ts timestamptz := CASE WHEN _date_to IS NULL THEN NULL ELSE (_date_to + 1)::timestamp AT TIME ZONE 'Asia/Baghdad' END;
    _result jsonb;
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        IF _tenant_id IS NULL OR _tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN
            RAISE EXCEPTION 'Unauthorized: tenant membership required' USING ERRCODE = '42501';
        END IF;
    END IF;

    WITH scope AS (
        SELECT o.status, o.price, o.created_at, o.is_return, o.priority, o.needs_attention,
               coalesce(o.is_test, false) AS is_test,
               coalesce(o.delivered_at, o.completed_at) AS realized_at
          FROM public.orders o
         WHERE o.tenant_id = _tenant_id
           AND o.is_archived = false
           AND o.deleted_at IS NULL
           AND (CASE WHEN _order_type = 'take' THEN o.take_kind IS NOT NULL ELSE o.take_kind IS NULL END)
           AND (_from_ts IS NULL OR o.created_at >= _from_ts)
           AND (_to_ts   IS NULL OR o.created_at <  _to_ts)
           AND (_city IS NULL OR o.city = _city)
           AND (_priority IS NULL OR o.priority = _priority)
           AND (_payment_status IS NULL OR o.payment_status::text = _payment_status)
           AND (_is_return IS NULL OR o.is_return = _is_return)
           AND (_order_type IS NULL
                OR (_order_type = 'take')
                OR (_order_type = 'refund' AND o.is_return = true)
                OR (_order_type = 'replacement' AND (o.is_replacement = true OR o.order_id LIKE 'RPL-%'))
                OR (_order_type = 'abandoned_cart' AND o.abandoned_cart_at IS NOT NULL
                    AND o.status <> 'pending_checkout'
                    AND o.abandoned_cart_outcome IN ('contacted', 'returned')))
           AND (_product IS NULL OR EXISTS (
                 SELECT 1 FROM jsonb_array_elements(
                            CASE WHEN jsonb_typeof(o.items)='array' THEN o.items ELSE '[]'::jsonb END) it
                  WHERE lower(it->>'name') LIKE '%' || lower(_product) || '%'))
    ), counts AS (
        SELECT jsonb_build_object(
            'all',              count(*),
            'new',              count(*) FILTER (WHERE status = 'new'),
            'contacted',        count(*) FILTER (WHERE status = 'contacted'),
            'confirmed',        count(*) FILTER (WHERE status IN ('confirmed','return_pending')),
            'cancelled',        count(*) FILTER (WHERE status = 'cancelled'),
            'in_transit',       count(*) FILTER (WHERE status = 'in_transit'),
            'delivered',        count(*) FILTER (WHERE status = 'delivered'),
            'completed',        count(*) FILTER (WHERE status = 'completed'),
            'rejected',         count(*) FILTER (WHERE status = 'rejected'),
            'no_response',      count(*) FILTER (WHERE status = 'no_response'),
            'return_pending',   count(*) FILTER (WHERE status = 'return_pending'),
            'refund_delivered', count(*) FILTER (WHERE status = 'refund_delivered'),
            'refund_failed',    count(*) FILTER (WHERE status = 'refund_failed'),
            'refunds',          count(*) FILTER (WHERE status IN ('return_pending','refund_delivered','refund_failed')),
            'pending_checkout', count(*) FILTER (WHERE status = 'pending_checkout'),
            'suspended',        count(*) FILTER (WHERE status = 'suspended')
        ) AS v,
        count(*) FILTER (WHERE needs_attention = true OR status = 'rejected') AS risk,
        jsonb_build_object(
            'totalOrders',   count(*),
            'todayOrders',   count(*) FILTER (WHERE (timezone('Asia/Baghdad', created_at))::date = _today),
            'totalRevenue',  coalesce(sum(price) FILTER (
                                 WHERE status IN ('delivered', 'completed')
                                   AND NOT coalesce(is_return, false) AND NOT is_test), 0),
            'todayRevenue',  coalesce(sum(price) FILTER (
                                 WHERE (timezone('Asia/Baghdad', realized_at))::date = _today
                                   AND status IN ('delivered', 'completed')
                                   AND NOT coalesce(is_return, false) AND NOT is_test), 0),
            'averageOrderValue', CASE WHEN count(*) > 0 THEN round(coalesce(sum(price),0) / count(*)) ELSE 0 END,
            'conversionRate', CASE WHEN count(*) > 0
                                   THEN round((count(*) FILTER (WHERE status IN ('confirmed','delivered','completed')))::numeric * 100 / count(*), 1)
                                   ELSE 0 END,
            'urgentOrders',        count(*) FILTER (WHERE priority = 'urgent'),
            'noResponseOrders',    count(*) FILTER (WHERE status = 'no_response'),
            'returnPendingOrders', count(*) FILTER (WHERE status = 'return_pending'),
            'pendingCount',        count(*) FILTER (WHERE status IN ('new','contacted')),
            'totalProcessed',      count(*) FILTER (WHERE status = 'delivered')
        ) AS st
        FROM scope
    ), city_opts AS (
        SELECT coalesce(jsonb_agg(DISTINCT o.city), '[]'::jsonb) AS v
          FROM public.orders o
         WHERE o.tenant_id = _tenant_id AND o.is_archived = false AND o.deleted_at IS NULL
           AND (_from_ts IS NULL OR o.created_at >= _from_ts)
           AND (_to_ts   IS NULL OR o.created_at <  _to_ts)
           AND o.city IS NOT NULL AND o.city <> ''
    ), product_opts AS (
        SELECT coalesce(jsonb_agg(DISTINCT it->>'name'), '[]'::jsonb) AS v
          FROM public.orders o,
               jsonb_array_elements(CASE WHEN jsonb_typeof(o.items)='array' THEN o.items ELSE '[]'::jsonb END) it
         WHERE o.tenant_id = _tenant_id AND o.is_archived = false AND o.deleted_at IS NULL
           AND (_from_ts IS NULL OR o.created_at >= _from_ts)
           AND (_to_ts   IS NULL OR o.created_at <  _to_ts)
           AND it->>'name' IS NOT NULL AND it->>'name' <> ''
    )
    SELECT jsonb_build_object(
        'status_counts', counts.v,
        'stats', counts.st,
        'cities', city_opts.v,
        'products', product_opts.v,
        'total_risk_count', counts.risk
    ) INTO _result
    FROM counts, city_opts, product_opts;

    RETURN _result;
END;
$function$;

-- F22. Store logos, banners and builder images: writing them needs one of the
-- permissions of the screens that upload them (store builder, shops, settings), not
-- bare membership. The folder name is compared as text so a non-uuid folder can
-- never raise a cast error.
ALTER POLICY "Tenant members can upload assets" ON storage.objects
    WITH CHECK (
        bucket_id = 'tenant-assets'
        AND EXISTS (
            SELECT 1 FROM public.get_user_tenant_ids() AS t(id)
             WHERE t.id::text = (storage.foldername(name))[1]
               AND (public.has_tenant_permission(t.id, 'products.edit')
                    OR public.has_tenant_permission(t.id, 'shops.manage')
                    OR public.has_tenant_permission(t.id, 'system.settings.access'))
        )
    );

ALTER POLICY "Tenant members can delete assets" ON storage.objects
    USING (
        bucket_id = 'tenant-assets'
        AND EXISTS (
            SELECT 1 FROM public.get_user_tenant_ids() AS t(id)
             WHERE t.id::text = (storage.foldername(name))[1]
               AND (public.has_tenant_permission(t.id, 'products.edit')
                    OR public.has_tenant_permission(t.id, 'shops.manage')
                    OR public.has_tenant_permission(t.id, 'system.settings.access'))
        )
    );

-- F5. Rate-limit buckets were never pruned (29k rows, 99.6% expired). The longest
-- window in use is one day, so anything older than two days is dead.
SELECT cron.schedule('prune-api-rate-limits', '25 3 * * *',
                     $$DELETE FROM public.api_rate_limits WHERE window_start < now() - interval '2 days';$$);
