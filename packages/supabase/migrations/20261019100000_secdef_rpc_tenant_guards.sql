-- SECURITY DEFINER RPC tenant guards (tenancy/secdef hardening, 2026-10-19).
--
-- Follows 20261011090000_stage0_security_lockdown.sql, which revoked the
-- trigger/service-only write helpers and guarded zero_oversold and
-- recompute_inventory. This closes what stage 0 left open.
--
-- Every function below is owned by postgres (rolbypassrls), so a definer body
-- skips RLS entirely: a tenant filter has to be written into the body.
-- current_user inside a definer body is the owner, so the guards read the
-- caller from the JWT instead: auth.role() / auth.uid(), with membership from
-- public.get_user_tenant_ids(). A NULL auth.role() is a direct SQL session
-- (cron, migrations, a definer trigger fired outside PostgREST) and is trusted,
-- the same rule stage 0 uses.
--
-- Signatures and return shapes are unchanged, so deployed callers keep working.
-- Bodies start from the live pg_get_functiondef on sduvpgqwhxragxtxztur
-- (read 2026-10-19), not from apps/platform/scripts/sql.
--
-- CREATE OR REPLACE keeps an existing ACL, so each function's grants are
-- restated explicitly. A grant via PUBLIC survives REVOKE ... FROM anon, so
-- PUBLIC is always revoked as well.

-- ---------------------------------------------------------------------------
-- 1. Customer-trust read RPCs (browser callers: apps/platform/hooks/
--    use-customer-trust.ts). They matched on phone alone, across every
--    tenant's customer_trust / customer_trust_audit_log. An employee of one
--    tenant could confirm another tenant's customer and read their preferred
--    city and trust percentile, ranked against a pool spanning all tenants.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_customer_percentile(target_phone text, target_city text DEFAULT NULL::text)
 RETURNS TABLE(percentile numeric, city_name text, total_in_group bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    normalized TEXT;
    v_score INTEGER;
    v_city TEXT;
    v_tenant UUID;
    v_api BOOLEAN := coalesce(auth.role(), '') IN ('authenticated', 'anon');
BEGIN
    IF v_api AND auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;

    normalized := public.normalize_phone(target_phone);

    -- One row per (tenant_id, phone). Only the caller's own tenants count, and
    -- the active tenant wins when the phone is a customer of several of them,
    -- so the result no longer depends on heap order.
    SELECT ct.tenant_id, ct.trust_score, ct.preferred_city
      INTO v_tenant, v_score, v_city
      FROM public.customer_trust ct
     WHERE ct.phone = normalized
       AND (NOT v_api OR ct.tenant_id IN (SELECT public.get_user_tenant_ids()))
     ORDER BY (ct.tenant_id = public.get_current_tenant_id()) DESC NULLS LAST, ct.tenant_id
     LIMIT 1;

    IF v_score IS NULL THEN
        RETURN QUERY SELECT 50::NUMERIC, ''::TEXT, 0::BIGINT; RETURN;
    END IF;

    -- The percentile pool is that customer's own tenant, never every tenant.
    v_city := COALESCE(target_city, v_city);
    IF v_city IS NOT NULL AND v_city != '' THEN
        RETURN QUERY SELECT ROUND((COUNT(*) FILTER (WHERE ct2.trust_score <= v_score)::NUMERIC / GREATEST(COUNT(*), 1)) * 100, 1),
            v_city, COUNT(*)
          FROM public.customer_trust ct2
         WHERE ct2.tenant_id = v_tenant AND ct2.preferred_city = v_city;
    ELSE
        RETURN QUERY SELECT ROUND((COUNT(*) FILTER (WHERE ct2.trust_score <= v_score)::NUMERIC / GREATEST(COUNT(*), 1)) * 100, 1),
            'all'::TEXT, COUNT(*)
          FROM public.customer_trust ct2
         WHERE ct2.tenant_id = v_tenant;
    END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_customer_score_audit_log(target_phone text, log_limit integer DEFAULT 20, log_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, event_date timestamp with time zone, event_type text, reason text, score_change integer, score_before integer, score_after integer, source text, order_id text, edited_at timestamp with time zone, edited_by uuid, edited_reason text, original_reason text, total_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    normalized TEXT;
    v_api BOOLEAN := coalesce(auth.role(), '') IN ('authenticated', 'anon');
BEGIN
    IF v_api AND auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;

    normalized := public.normalize_phone(target_phone);
    RETURN QUERY
    WITH scoped AS (
        SELECT a.*
          FROM public.customer_trust_audit_log a
         WHERE a.phone = normalized
           AND (NOT v_api OR a.tenant_id IN (SELECT public.get_user_tenant_ids()))
    ),
    counted AS (SELECT COUNT(*) AS cnt FROM scoped)
    SELECT s.id, s.event_date, s.event_type, s.reason, s.score_change, s.score_before, s.score_after,
        s.source, s.order_id, s.edited_at, s.edited_by, s.edited_reason, s.original_reason, c.cnt
      FROM scoped s CROSS JOIN counted c
     ORDER BY s.event_date DESC
     LIMIT log_limit OFFSET log_offset;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_customer_trust_history(target_phone text, months integer DEFAULT 12)
 RETURNS TABLE(month text, avg_score numeric, event_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    normalized TEXT;
    v_api BOOLEAN := coalesce(auth.role(), '') IN ('authenticated', 'anon');
BEGIN
    IF v_api AND auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;

    normalized := public.normalize_phone(target_phone);
    RETURN QUERY
    SELECT TO_CHAR(DATE_TRUNC('month', l.event_date), 'YYYY-MM'),
        ROUND(AVG(l.score_after), 0), COUNT(*)
      FROM public.customer_trust_audit_log l
     WHERE l.phone = normalized
       AND l.event_date >= NOW() - (months || ' months')::interval
       AND (NOT v_api OR l.tenant_id IN (SELECT public.get_user_tenant_ids()))
     GROUP BY DATE_TRUNC('month', l.event_date)
     ORDER BY DATE_TRUNC('month', l.event_date) ASC;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_customer_percentile(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_customer_score_audit_log(text, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_customer_trust_history(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_customer_percentile(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_customer_score_audit_log(text, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_customer_trust_history(text, integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Billing and loyalty writers that take a tenant id from the caller.
--    Stage 0 revoked EXECUTE from the API roles; their only callers are the
--    service role (lib/order-service.ts, storefront checkout) and definer
--    triggers (loyalty_order_changed, referral_order_changed). The guard is
--    defence in depth for the day someone re-grants them, and
--    increment_order_usage gets the search_path it never had.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.increment_order_usage(p_tenant_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF coalesce(auth.role(), '') IN ('authenticated', 'anon')
       AND (p_tenant_id IS NULL OR p_tenant_id NOT IN (SELECT public.get_user_tenant_ids())) THEN
        RAISE EXCEPTION 'not a member of this tenant' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.usage_tracking (tenant_id, year, month, orders_count, orders_charged)
    VALUES (
        p_tenant_id,
        EXTRACT(YEAR FROM now())::int,
        EXTRACT(MONTH FROM now())::int,
        1, 1
    )
    ON CONFLICT (tenant_id, year, month)
    DO UPDATE SET
        orders_count = usage_tracking.orders_count + 1,
        orders_charged = usage_tracking.orders_charged + 1,
        last_updated_at = now();
END;
$function$;

CREATE OR REPLACE FUNCTION public.increment_usage_tracking(_tenant_id uuid, _year integer, _month integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF coalesce(auth.role(), '') IN ('authenticated', 'anon')
       AND (_tenant_id IS NULL OR _tenant_id NOT IN (SELECT public.get_user_tenant_ids())) THEN
        RAISE EXCEPTION 'not a member of this tenant' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.usage_tracking (tenant_id, year, month, orders_count, orders_charged, last_updated_at)
    VALUES (_tenant_id, _year, _month, 1, 1, now())
    ON CONFLICT (tenant_id, year, month)
    DO UPDATE SET
        orders_count = usage_tracking.orders_count + 1,
        orders_charged = usage_tracking.orders_charged + 1,
        last_updated_at = now();
END;
$function$;

-- Fired from definer triggers on orders. A status change made in the platform
-- carries the editor's JWT, and the order's tenant is one they belong to (RLS
-- on orders already required it), so the guard passes there.
CREATE OR REPLACE FUNCTION public.adjust_customer_points(_tenant_id uuid, _phone text, _delta integer, _reason text, _order_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _new integer;
BEGIN
    IF coalesce(auth.role(), '') IN ('authenticated', 'anon')
       AND (_tenant_id IS NULL OR _tenant_id NOT IN (SELECT public.get_user_tenant_ids())) THEN
        RAISE EXCEPTION 'not a member of this tenant' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.customer_points (tenant_id, phone, balance, updated_at)
        VALUES (_tenant_id, _phone, _delta, now())
    ON CONFLICT (tenant_id, phone) DO UPDATE
        SET balance = public.customer_points.balance + _delta,
            updated_at = now()
    RETURNING balance INTO _new;

    IF _new < 0 THEN
        RAISE EXCEPTION 'insufficient_points';
    END IF;

    INSERT INTO public.customer_points_ledger (tenant_id, phone, delta, reason, order_id)
        VALUES (_tenant_id, _phone, _delta, _reason, _order_id);

    RETURN _new;
END;
$function$;

REVOKE ALL ON FUNCTION public.increment_order_usage(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.increment_usage_tracking(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.adjust_customer_points(uuid, text, integer, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_order_usage(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_usage_tracking(uuid, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.adjust_customer_points(uuid, text, integer, text, uuid) TO service_role;

-- Stage 0 already revoked these; restated so this file alone leaves them
-- closed even if stage 0 is ever re-run out of order.
REVOKE ALL ON FUNCTION public.inv_apply(uuid, jsonb, text, integer, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_customer_aggregates() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.iraq_flag_ambiguous_placements() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.inv_apply(uuid, jsonb, text, integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_customer_aggregates() TO service_role;
GRANT EXECUTE ON FUNCTION public.iraq_flag_ambiguous_placements() TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Internal lookups that read another user's or tenant's settings with no
--    caller check. Their only callers are SECURITY DEFINER functions owned by
--    postgres (dispatch_notification, send_notification_digests,
--    notification_channel_enabled, enforce_product_block,
--    enforce_storefront_writes_block) and the admin app's service-role client
--    (get_seed_automation_status). A definer body checks EXECUTE against its
--    owner, so revoking the API roles breaks none of them.
--
--    A p_user_id = auth.uid() guard is deliberately NOT added: those triggers
--    fire inside a user's request (auth.role() = 'authenticated') and ask
--    about OTHER members, so such a guard would silence every notification.
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.in_quiet_hours(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notification_channel_enabled(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tenant_block_active(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_seed_automation_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.in_quiet_hours(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.notification_channel_enabled(uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.tenant_block_active(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_seed_automation_status() TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Definer helpers that already key on auth.uid() but run with the caller's
--    search_path. Both stay executable by authenticated: RLS policies, the
--    security_invoker view v_orders_with_risk, the invoker trigger
--    chat_conversations_guard_update and the chat RPCs call them.
-- ---------------------------------------------------------------------------

ALTER FUNCTION public.get_current_tenant_id() SET search_path = public, pg_temp;
ALTER FUNCTION public.is_tenant_admin(uuid) SET search_path = public, pg_temp;
