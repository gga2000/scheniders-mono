-- =============================================================================
-- Customers: Ali's spend / risk / exchange rules, pinned in SQL
-- =============================================================================
--
-- WHAT THIS PROVES (after 20261030231031, 20261031003234 and 20261031003357)
--   Purchases (customer_order_facts)
--     * a plain rejected purchase is severe; its refund is not a minor refund;
--     * a delivered purchase that later has an exchange child and was marked
--       rejected by staff reads as delivered and not severe (the exchange
--       counts as the purchase);
--     * two refund orders on one delivered purchase are ONE minor refund
--       (distinct base_id);
--     * a refused return pickup (RTN, no_response) is never severe.
--   Guard (orders_guard_exchanged_original_status)
--     * a delivered original with an exchange cannot go to rejected, directly
--       or in two steps through return_pending, even with delivered_at null
--       (legacy order) once a history row shows it left delivered;
--     * the same move is allowed for a delivered original with no exchange.
--   Trust (calculate_customer_trust) agrees with the facts
--     * delivered_count, refund_count, rejected total and total_spent equal the
--       facts for the customer, and the matview-visible score never reads a
--       refund twice for one purchase.
--
-- HOW TO RUN
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f packages/supabase/tests/customer_rules.sql
--   Run as postgres on a local stack or branch. It seeds synthetic orders for
--   one throwaway phone inside a transaction and ROLLS BACK; it prints PASS
--   notices and raises on the first failure. It is also safe to paste into the
--   SQL editor of a live project for the same reason (nothing persists).
-- =============================================================================

BEGIN;

DO $test$
DECLARE
    t        uuid;
    ph       text := '07700099001';
    norm     text := '7700099001';
    o_rej    uuid;  o_ex uuid;  o_ref uuid;  o_plain uuid;  o_rtn uuid;
    got      record;
    ok       boolean;
BEGIN
    SELECT id INTO t FROM public.tenants ORDER BY created_at LIMIT 1;
    IF t IS NULL THEN RAISE EXCEPTION 'FAIL setup: no tenant'; END IF;

    -- 1. plain rejected purchase (severe), with a refund order on it
    INSERT INTO public.orders (order_id, customer_name, phone, price, tenant_id, status)
        VALUES ('ZT-9001', 'Rule Test', ph, 30000, t, 'rejected') RETURNING id INTO o_rej;
    -- 2. delivered purchase staff marked rejected after an exchange was delivered
    INSERT INTO public.orders (order_id, customer_name, phone, price, tenant_id, status, delivered_at)
        VALUES ('ZT-9002', 'Rule Test', ph, 40000, t, 'delivered', now()) RETURNING id INTO o_ex;
    INSERT INTO public.orders (order_id, customer_name, phone, price, tenant_id, status, is_replacement, original_order_id, delivered_at)
        VALUES ('RPL-9002-1', 'Rule Test', ph, 5000, t, 'delivered', true, o_ex, now());
    -- 3. delivered purchase with TWO refund orders
    INSERT INTO public.orders (order_id, customer_name, phone, price, tenant_id, status, delivered_at)
        VALUES ('ZT-9003', 'Rule Test', ph, 20000, t, 'delivered', now()) RETURNING id INTO o_ref;
    INSERT INTO public.orders (order_id, customer_name, phone, price, tenant_id, status, is_return, original_order_id)
        VALUES ('RTN-9003-1', 'Rule Test', ph, 10000, t, 'refund_delivered', true, o_ref),
               ('RTN-9003-2', 'Rule Test', ph, 10000, t, 'refund_delivered', true, o_ref);
    -- 4. refund on the rejected purchase (must not count)
    INSERT INTO public.orders (order_id, customer_name, phone, price, tenant_id, status, is_return, original_order_id)
        VALUES ('RTN-9001-1', 'Rule Test', ph, 30000, t, 'refund_delivered', true, o_rej);
    -- 5. delivered purchase with no exchange (guard must allow the move)
    INSERT INTO public.orders (order_id, customer_name, phone, price, tenant_id, status, delivered_at)
        VALUES ('ZT-9005', 'Rule Test', ph, 15000, t, 'delivered', now()) RETURNING id INTO o_plain;
    -- 6. a refused return pickup
    INSERT INTO public.orders (order_id, customer_name, phone, price, tenant_id, status, is_return, original_order_id)
        VALUES ('RTN-9003-3', 'Rule Test', ph, 10000, t, 'no_response', true, o_ref) RETURNING id INTO o_rtn;

    -- Guard: direct move refused
    BEGIN
        UPDATE public.orders SET status = 'rejected' WHERE id = o_ex;
        RAISE EXCEPTION 'FAIL guard: direct delivered->rejected with an exchange was allowed';
    EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS guard refuses a direct move'; END;

    -- Guard: two-step refused, also for a legacy order with no delivered_at
    UPDATE public.orders SET status = 'return_pending' WHERE id = o_ex;
    UPDATE public.orders SET delivered_at = NULL WHERE id = o_ex;
    INSERT INTO public.order_status_history (order_id, from_status, to_status, tenant_id)
        VALUES (o_ex, 'delivered', 'return_pending', t);
    BEGIN
        UPDATE public.orders SET status = 'rejected' WHERE id = o_ex;
        RAISE EXCEPTION 'FAIL guard: two-step move to rejected was allowed';
    EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS guard refuses the two-step move'; END;

    -- Guard: allowed where there is no exchange
    UPDATE public.orders SET status = 'rejected' WHERE id = o_plain;
    RAISE NOTICE 'PASS guard allows a delivered order without an exchange to be rejected';
    UPDATE public.orders SET status = 'delivered' WHERE id = o_plain;

    -- Put the exchanged original in the "staff marked it rejected" state the
    -- facts must still read as delivered (the guard prevents creating it now,
    -- but older rows exist).
    ALTER TABLE public.orders DISABLE TRIGGER USER;
    UPDATE public.orders SET status = 'rejected' WHERE id = o_ex;
    ALTER TABLE public.orders ENABLE TRIGGER USER;

    -- Facts
    SELECT status, is_severe INTO got FROM public.customer_order_facts WHERE id = o_rej;
    IF got.status <> 'rejected' OR got.is_severe IS NOT TRUE THEN RAISE EXCEPTION 'FAIL facts: plain rejected must be severe, got % %', got.status, got.is_severe; END IF;
    RAISE NOTICE 'PASS plain rejected purchase is severe';

    SELECT status, is_severe INTO got FROM public.customer_order_facts WHERE id = o_ex;
    IF got.status <> 'delivered' OR got.is_severe IS TRUE THEN RAISE EXCEPTION 'FAIL facts: exchanged original must read delivered and not severe, got % %', got.status, got.is_severe; END IF;
    RAISE NOTICE 'PASS exchanged original reads delivered, not severe';

    SELECT is_severe INTO ok FROM public.customer_order_facts WHERE id = o_rtn;
    IF ok IS TRUE THEN RAISE EXCEPTION 'FAIL facts: a refused return pickup must not be severe'; END IF;
    RAISE NOTICE 'PASS refused return pickup is not severe';

    IF (SELECT count(DISTINCT base_id) FROM public.customer_order_facts WHERE tenant_id = t AND norm_phone = norm AND is_minor_refund) <> 1 THEN
        RAISE EXCEPTION 'FAIL facts: two refunds on one purchase must be one minor refund, and none on the rejected purchase';
    END IF;
    RAISE NOTICE 'PASS refunds count once per purchase and never on a refused one';

    -- Trust agrees with the facts
    PERFORM public.calculate_customer_trust(t, norm);
    SELECT * INTO got FROM public.customer_trust WHERE tenant_id = t AND phone = norm;
    IF got.refund_count <> 1 THEN RAISE EXCEPTION 'FAIL trust: refund_count % (want 1)', got.refund_count; END IF;
    IF got.delivered_count <> (SELECT count(*) FROM public.customer_order_facts WHERE tenant_id = t AND norm_phone = norm AND is_delivered) THEN
        RAISE EXCEPTION 'FAIL trust: delivered_count differs from the facts';
    END IF;
    IF got.total_spent <> (SELECT COALESCE(sum(spend_delta), 0) FROM public.customer_order_facts WHERE tenant_id = t AND norm_phone = norm) THEN
        RAISE EXCEPTION 'FAIL trust: total_spent differs from the facts';
    END IF;
    IF got.rejected_customer_fault_count + got.rejected_merchant_fault_count + got.rejected_ambiguous_count <> 1 THEN
        RAISE EXCEPTION 'FAIL trust: only the plain rejected purchase may count as rejected';
    END IF;
    RAISE NOTICE 'PASS trust agrees with the facts';
END
$test$;

ROLLBACK;
