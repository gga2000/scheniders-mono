-- Customer trust, computed per store (C-04, C-10).
--
-- calculate_customer_trust(phone) picked the store from "any order with this
-- phone" (LIMIT 1), so a customer of two stores was scored in whichever store
-- the planner returned first. It also counted deleted, test, archived and
-- abandoned orders, summed every order's price as spend, and ran as the
-- calling user, so members could write their own trust rows.
--
-- Now:
--   * calculate_customer_trust(p_tenant_id, phone) scores one store, reading
--     the same rows as customer_order_facts (and so the list and the profile):
--     order count = distinct order_base_id, spend = delivered minus delivered
--     refunds. The phone key is normalize_phone_for_search, like blacklist,
--     customer_metadata and mv_customer_metrics.
--   * A store with no remaining orders for the phone loses its trust row.
--   * The order/blacklist triggers pass their row's tenant_id; the order
--     trigger skips updates that cannot change the score.
--   * calculate_customer_trust(phone) stays for the cross-store community
--     rating trigger and rescores every store that knows the phone.
--   * All of it runs as the owner; members keep read access only.

CREATE OR REPLACE FUNCTION public.calculate_customer_trust(p_tenant_id uuid, target_phone text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    norm text := public.normalize_phone_for_search(target_phone);
    v_total_orders integer := 0;
    v_delivered_count integer := 0;
    v_total_spent bigint := 0;
    v_last_order_date timestamptz;
    v_first_order_date timestamptz;
    v_preferred_city text;
    v_cancelled_customer integer := 0;
    v_cancelled_merchant integer := 0;
    v_rejected_customer_fault integer := 0;
    v_rejected_merchant_fault integer := 0;
    v_rejected_ambiguous integer := 0;
    v_no_response_count integer := 0;
    v_refund_count integer := 0;
    v_weighted_delivered numeric := 0;
    v_weighted_cancelled_customer numeric := 0;
    v_weighted_rejected_customer numeric := 0;
    v_weighted_rejected_ambiguous numeric := 0;
    v_weighted_no_response numeric := 0;
    v_weighted_refund numeric := 0;
    v_delivery_bonus numeric;
    v_cancel_penalty numeric;
    v_reject_penalty numeric;
    v_ambiguous_penalty numeric;
    v_no_response_penalty numeric;
    v_refund_penalty numeric;
    v_community_bonus numeric := 0;
    v_community_avg numeric(3,2) := 0;
    v_community_count integer := 0;
    v_is_blacklisted boolean;
    v_final_score integer;
    v_trust_tier text;
    v_delivery_success_rate numeric(5,2) := 0;
    v_avg_basket bigint := 0;
    v_recency_mult numeric;
    r record;
BEGIN
    IF p_tenant_id IS NULL OR norm IS NULL OR length(norm) < 5 THEN RETURN; END IF;

    SELECT count(DISTINCT f.base_id) FILTER (WHERE NOT f.is_return),
           count(*) FILTER (WHERE f.is_delivered),
           COALESCE(sum(f.spend_delta), 0)::bigint,
           max(f.created_at) FILTER (WHERE NOT f.is_return),
           min(f.created_at) FILTER (WHERE NOT f.is_return)
      INTO v_total_orders, v_delivered_count, v_total_spent, v_last_order_date, v_first_order_date
      FROM public.customer_order_facts f
     WHERE f.tenant_id = p_tenant_id
       AND f.norm_phone = norm;

    IF v_total_orders = 0 THEN
        DELETE FROM public.customer_trust WHERE tenant_id = p_tenant_id AND phone = norm;
        RETURN;
    END IF;

    SELECT f.city INTO v_preferred_city
      FROM public.customer_order_facts f
     WHERE f.tenant_id = p_tenant_id AND f.norm_phone = norm AND NOT f.is_return AND f.city IS NOT NULL
     GROUP BY f.city
     ORDER BY count(*) DESC, max(f.created_at) DESC
     LIMIT 1;

    FOR r IN
        SELECT o.status::text AS status,
               COALESCE(o.is_return, false) AS is_return,
               COALESCE(o.rejection_reason, '') AS reason,
               EXTRACT(DAY FROM (now() - o.created_at))::integer AS age_days
          FROM public.orders o
         WHERE o.tenant_id = p_tenant_id
           AND public.normalize_phone_for_search(o.phone) = norm
           AND o.deleted_at IS NULL
           AND NOT COALESCE(o.is_archived, false)
           AND NOT COALESCE(o.is_test, false)
           AND o.status::text IN ('cancelled', 'rejected', 'no_response', 'refund_delivered',
                                  'refund_failed', 'delivered', 'completed')
    LOOP
        IF r.age_days <= 14 THEN v_recency_mult := 2.0;
        ELSIF r.age_days <= 30 THEN v_recency_mult := 1.5;
        ELSIF r.age_days <= 60 THEN v_recency_mult := 1.0;
        ELSIF r.age_days > 365 THEN v_recency_mult := 0.5;
        ELSE v_recency_mult := 0.75; END IF;

        IF r.status IN ('refund_delivered', 'refund_failed') THEN
            v_refund_count := v_refund_count + 1;
            v_weighted_refund := v_weighted_refund + v_recency_mult;
        ELSIF r.is_return THEN
            CONTINUE;
        ELSIF r.status IN ('delivered', 'completed') THEN
            v_weighted_delivered := v_weighted_delivered + v_recency_mult;
        ELSIF r.status = 'cancelled' THEN
            IF r.reason IN ('customer_cancelled', 'no_reply', 'Customer cancelled')
               OR r.reason LIKE '%ألغى العميل%' OR r.reason LIKE '%لم يرد%' THEN
                v_cancelled_customer := v_cancelled_customer + 1;
                v_weighted_cancelled_customer := v_weighted_cancelled_customer + v_recency_mult;
            ELSE
                v_cancelled_merchant := v_cancelled_merchant + 1;
            END IF;
        ELSIF r.status = 'rejected' THEN
            IF r.reason IN ('customer_refused', 'no_answer', 'phone_off', 'wrong_address')
               OR r.reason LIKE '%رفض%' OR r.reason LIKE '%لم يرد%' OR r.reason LIKE '%هاتف مغلق%' THEN
                v_rejected_customer_fault := v_rejected_customer_fault + 1;
                v_weighted_rejected_customer := v_weighted_rejected_customer + v_recency_mult;
            ELSIF r.reason IN ('wrong_product', 'price_disagreement', 'not_available')
               OR r.reason LIKE '%غير متوفر%' OR r.reason LIKE '%خطأ%' THEN
                v_rejected_merchant_fault := v_rejected_merchant_fault + 1;
            ELSE
                v_rejected_ambiguous := v_rejected_ambiguous + 1;
                v_weighted_rejected_ambiguous := v_weighted_rejected_ambiguous + v_recency_mult;
            END IF;
        ELSIF r.status = 'no_response' THEN
            v_no_response_count := v_no_response_count + 1;
            v_weighted_no_response := v_weighted_no_response + v_recency_mult;
        END IF;
    END LOOP;

    v_delivery_bonus := v_weighted_delivered * 2;
    v_cancel_penalty := v_weighted_cancelled_customer * 15;
    v_reject_penalty := v_weighted_rejected_customer * 30;
    v_ambiguous_penalty := v_weighted_rejected_ambiguous * 10;
    v_no_response_penalty := v_weighted_no_response * 20;
    v_refund_penalty := v_weighted_refund * 15;

    -- community_ratings is cross-store by design.
    SELECT COALESCE(avg((cr.trust_stars + cr.communication_stars + cr.behavior_stars) / 3.0), 0), count(*)
      INTO v_community_avg, v_community_count
      FROM public.community_ratings cr
     WHERE public.normalize_phone_for_search(cr.customer_phone) = norm;

    IF v_community_avg > 4 THEN v_community_bonus := 10;
    ELSIF v_community_avg > 0 AND v_community_avg < 2 THEN v_community_bonus := -10;
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.blacklist b
         WHERE b.tenant_id = p_tenant_id
           AND public.normalize_phone_for_search(b.phone) = norm
    ) INTO v_is_blacklisted;

    v_final_score := round(100 + v_delivery_bonus - v_cancel_penalty - v_reject_penalty
        - v_ambiguous_penalty - v_no_response_penalty - v_refund_penalty + v_community_bonus)::integer;

    v_delivery_success_rate := round((v_delivered_count::numeric / v_total_orders) * 100, 2);
    IF v_delivered_count > 0 THEN
        v_avg_basket := v_total_spent / v_delivered_count;
    END IF;

    IF v_is_blacklisted THEN v_trust_tier := 'blocked';
    ELSIF v_total_orders < 3 THEN v_trust_tier := 'new';
    ELSIF v_final_score >= 120 AND v_total_orders >= 20 THEN v_trust_tier := 'platinum';
    ELSIF v_final_score >= 110 AND v_total_orders >= 10 THEN v_trust_tier := 'gold';
    ELSIF v_final_score >= 100 AND v_total_orders >= 5 THEN v_trust_tier := 'silver';
    ELSIF v_final_score >= 85 AND v_total_orders >= 3 THEN v_trust_tier := 'bronze';
    ELSIF v_final_score >= 50 THEN v_trust_tier := 'watch';
    ELSIF v_final_score >= 0 THEN v_trust_tier := 'risky';
    ELSE v_trust_tier := 'critical'; END IF;

    INSERT INTO public.customer_trust (
        tenant_id, phone, trust_score, trust_tier, delivery_success_rate,
        total_orders, delivered_count, cancelled_customer_count, cancelled_merchant_count,
        rejected_customer_fault_count, rejected_merchant_fault_count, rejected_ambiguous_count,
        no_response_count, refund_count, total_spent, avg_basket,
        community_avg_rating, community_rating_count, score_breakdown,
        last_order_date, first_order_date, preferred_city, last_updated
    ) VALUES (
        p_tenant_id, norm, v_final_score, v_trust_tier, v_delivery_success_rate,
        v_total_orders, v_delivered_count, v_cancelled_customer, v_cancelled_merchant,
        v_rejected_customer_fault, v_rejected_merchant_fault, v_rejected_ambiguous,
        v_no_response_count, v_refund_count, v_total_spent, v_avg_basket,
        v_community_avg, v_community_count,
        jsonb_build_array(
            jsonb_build_object('label', 'base', 'value', 100, 'type', 'neutral'),
            jsonb_build_object('label', 'delivery', 'value', round(v_delivery_bonus), 'type', 'positive'),
            jsonb_build_object('label', 'cancelled', 'value', -round(v_cancel_penalty), 'type', 'negative'),
            jsonb_build_object('label', 'rejected', 'value', -round(v_reject_penalty), 'type', 'negative'),
            jsonb_build_object('label', 'ambiguous', 'value', -round(v_ambiguous_penalty), 'type', 'negative'),
            jsonb_build_object('label', 'no_response', 'value', -round(v_no_response_penalty), 'type', 'negative'),
            jsonb_build_object('label', 'refund', 'value', -round(v_refund_penalty), 'type', 'negative'),
            jsonb_build_object('label', 'community', 'value', v_community_bonus, 'type',
                CASE WHEN v_community_bonus > 0 THEN 'positive'
                     WHEN v_community_bonus < 0 THEN 'negative' ELSE 'neutral' END)
        ),
        v_last_order_date, v_first_order_date, v_preferred_city, now()
    )
    ON CONFLICT (tenant_id, phone) DO UPDATE SET
        trust_score = EXCLUDED.trust_score, trust_tier = EXCLUDED.trust_tier,
        delivery_success_rate = EXCLUDED.delivery_success_rate,
        total_orders = EXCLUDED.total_orders, delivered_count = EXCLUDED.delivered_count,
        cancelled_customer_count = EXCLUDED.cancelled_customer_count,
        cancelled_merchant_count = EXCLUDED.cancelled_merchant_count,
        rejected_customer_fault_count = EXCLUDED.rejected_customer_fault_count,
        rejected_merchant_fault_count = EXCLUDED.rejected_merchant_fault_count,
        rejected_ambiguous_count = EXCLUDED.rejected_ambiguous_count,
        no_response_count = EXCLUDED.no_response_count, refund_count = EXCLUDED.refund_count,
        total_spent = EXCLUDED.total_spent, avg_basket = EXCLUDED.avg_basket,
        community_avg_rating = EXCLUDED.community_avg_rating,
        community_rating_count = EXCLUDED.community_rating_count,
        score_breakdown = EXCLUDED.score_breakdown,
        last_order_date = EXCLUDED.last_order_date, first_order_date = EXCLUDED.first_order_date,
        preferred_city = EXCLUDED.preferred_city, last_updated = now();
END;
$function$;

-- Cross-store entry point (community ratings carry no store): rescore every
-- store that has orders or a trust row for this phone.
CREATE OR REPLACE FUNCTION public.calculate_customer_trust(target_phone text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    norm text := public.normalize_phone_for_search(target_phone);
    t uuid;
BEGIN
    IF norm IS NULL OR length(norm) < 5 THEN RETURN; END IF;
    FOR t IN
        SELECT ct.tenant_id FROM public.customer_trust ct WHERE ct.phone = norm
        UNION
        SELECT DISTINCT o.tenant_id FROM public.orders o
         WHERE public.normalize_phone_for_search(o.phone) = norm AND o.deleted_at IS NULL
    LOOP
        PERFORM public.calculate_customer_trust(t, norm);
    END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trigger_update_trust_on_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.phone IS NOT NULL THEN PERFORM public.calculate_customer_trust(OLD.tenant_id, OLD.phone); END IF;
        RETURN OLD;
    END IF;
    IF NEW.phone IS NOT NULL THEN PERFORM public.calculate_customer_trust(NEW.tenant_id, NEW.phone); END IF;
    IF TG_OP = 'UPDATE' AND OLD.phone IS NOT NULL
       AND (OLD.phone IS DISTINCT FROM NEW.phone OR OLD.tenant_id IS DISTINCT FROM NEW.tenant_id) THEN
        PERFORM public.calculate_customer_trust(OLD.tenant_id, OLD.phone);
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trigger_update_trust_on_blacklist()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM public.calculate_customer_trust(OLD.tenant_id, OLD.phone);
        RETURN OLD;
    END IF;
    PERFORM public.calculate_customer_trust(NEW.tenant_id, NEW.phone);
    IF TG_OP = 'UPDATE' AND (OLD.phone IS DISTINCT FROM NEW.phone OR OLD.tenant_id IS DISTINCT FROM NEW.tenant_id) THEN
        PERFORM public.calculate_customer_trust(OLD.tenant_id, OLD.phone);
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trigger_update_trust_on_rating()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    PERFORM public.calculate_customer_trust(NEW.customer_phone);
    RETURN NEW;
END;
$function$;

-- Rescore only when a field the score reads changes (not on every edit).
CREATE OR REPLACE TRIGGER trg_update_trust_orders
    AFTER UPDATE OF phone, tenant_id, status, price, is_return, rejection_reason, deleted_at, is_archived, is_test
    OR INSERT OR DELETE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.trigger_update_trust_on_order();

REVOKE ALL ON FUNCTION public.calculate_customer_trust(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.calculate_customer_trust(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trigger_update_trust_on_order() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trigger_update_trust_on_blacklist() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trigger_update_trust_on_rating() FROM PUBLIC, anon, authenticated;

-- Trust rows are computed, never typed in: members read, only the functions write.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.customer_trust FROM anon, authenticated;

-- Rescore every customer once: fills the stores' missing rows and removes rows
-- whose orders are all gone.
DO $backfill$
DECLARE
    k record;
BEGIN
    FOR k IN
        SELECT m.tenant_id, m.customer_phone AS phone FROM public.mv_customer_metrics m
        UNION
        SELECT ct.tenant_id, ct.phone FROM public.customer_trust ct
    LOOP
        PERFORM public.calculate_customer_trust(k.tenant_id, k.phone);
    END LOOP;
END;
$backfill$;