-- Fermi B13: the demo store, part 1: the walls around it.
--
-- One tenant (tenants.is_demo) holds invented data that Ali screen-records
-- the app on, so no real customer's name or phone is ever on camera. Anything
-- done in that store must stay in it, so the walls are in the database, not in
-- a setting:
--   * only the service role (the staff console) marks or unmarks it;
--   * its wallet is never charged or refunded, and it takes no payment;
--   * it never sends WhatsApp (whatsapp_send_check answers 'demo') and keeps
--     no message log;
--   * it can never be linked to Prime, and its courier file exports are not
--     recorded;
--   * its Shield records never reach another store, and no other store's
--     record reaches it;
--   * it is left out of the staff console's platform numbers.

ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.tenants.is_demo IS
    'The one demo store (Fermi B13): invented data for screen recordings. Never charged, never messages anyone, never ships, left out of platform numbers. Set by the service role only.';

-- One demo store: the staff console resets "the" demo store.
CREATE UNIQUE INDEX IF NOT EXISTS tenants_one_demo_store ON public.tenants (is_demo) WHERE is_demo;

-- Only the platform marks a store as the demo store, or takes the mark off: a
-- merchant who could set it on their own store would stop paying.
CREATE OR REPLACE FUNCTION public.tenants_is_demo_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    IF ((TG_OP = 'INSERT' AND NEW.is_demo)
        OR (TG_OP = 'UPDATE' AND NEW.is_demo IS DISTINCT FROM OLD.is_demo))
       AND (coalesce(auth.role(), 'service_role') <> 'service_role'
            OR current_user IN ('anon', 'authenticated')) THEN
        RAISE EXCEPTION 'Only the platform marks the demo store' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenants_is_demo_guard ON public.tenants;
CREATE TRIGGER trg_tenants_is_demo_guard
    BEFORE INSERT OR UPDATE OF is_demo ON public.tenants
    FOR EACH ROW EXECUTE FUNCTION public.tenants_is_demo_guard();

CREATE OR REPLACE FUNCTION public.tenant_is_demo(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT coalesce((SELECT t.is_demo FROM public.tenants t WHERE t.id = _tenant_id), false);
$$;
REVOKE ALL ON FUNCTION public.tenant_is_demo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tenant_is_demo(uuid) TO authenticated, service_role;

-- ── Money ───────────────────────────────────────────────────────────────────
-- Every fee (plan, delivered order, WhatsApp, add-on) is taken here. The demo
-- store answers "charged nothing" and its wallet and ledger stay as seeded.
CREATE OR REPLACE FUNCTION public.charge_wallet_core(_tenant_id uuid, _amount numeric, _description text, _reference text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    _current_balance numeric;
    _new_balance numeric;
    _total_charged numeric;
    _wallet_id uuid;
BEGIN
    IF _amount IS NULL OR _amount <= 0 THEN
        RAISE EXCEPTION 'charge amount must be positive (got %)', _amount USING ERRCODE = '22023';
    END IF;

    IF public.tenant_is_demo(_tenant_id) THEN
        SELECT balance_iqd INTO _current_balance FROM public.wallet WHERE tenant_id = _tenant_id;
        RETURN jsonb_build_object('success', true, 'demo', true, 'previous_balance', _current_balance,
                                  'charged', 0, 'new_balance', _current_balance);
    END IF;

    SELECT id, balance_iqd, total_charged_iqd
      INTO _wallet_id, _current_balance, _total_charged
      FROM public.wallet
     WHERE tenant_id = _tenant_id
       FOR UPDATE;
    IF _wallet_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No wallet found');
    END IF;

    _new_balance := _current_balance - _amount;
    IF _new_balance < -10000 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance', 'balance', _current_balance);
    END IF;

    UPDATE public.wallet
       SET balance_iqd = _new_balance,
           total_charged_iqd = _total_charged + _amount,
           updated_at = now()
     WHERE id = _wallet_id;

    INSERT INTO public.wallet_transactions (tenant_id, type, amount_iqd, balance_after_iqd, description, reference_id)
    VALUES (_tenant_id, 'charge', -_amount, _new_balance, _description, _reference);

    RETURN jsonb_build_object('success', true, 'previous_balance', _current_balance,
                              'charged', _amount, 'new_balance', _new_balance);
END;
$$;

CREATE OR REPLACE FUNCTION public.refund_wallet_charge_core(_tenant_id uuid, _amount numeric, _description text, _reference text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    _wallet_id uuid;
    _new_balance numeric;
BEGIN
    IF _amount IS NULL OR _amount <= 0 THEN
        RAISE EXCEPTION 'refund amount must be positive (got %)', _amount USING ERRCODE = '22023';
    END IF;
    IF public.tenant_is_demo(_tenant_id) THEN
        SELECT balance_iqd INTO _new_balance FROM public.wallet WHERE tenant_id = _tenant_id;
        RETURN jsonb_build_object('success', true, 'demo', true, 'refunded', 0, 'new_balance', _new_balance);
    END IF;
    SELECT id INTO _wallet_id FROM public.wallet WHERE tenant_id = _tenant_id FOR UPDATE;
    IF _wallet_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No wallet found');
    END IF;
    UPDATE public.wallet
       SET balance_iqd = balance_iqd + _amount,
           total_charged_iqd = greatest(total_charged_iqd - _amount, 0),
           updated_at = now()
     WHERE id = _wallet_id
    RETURNING balance_iqd INTO _new_balance;
    INSERT INTO public.wallet_transactions (tenant_id, type, amount_iqd, balance_after_iqd, description, reference_id)
    VALUES (_tenant_id, 'refund', _amount, _new_balance, _description, _reference);
    RETURN jsonb_build_object('success', true, 'refunded', _amount, 'new_balance', _new_balance);
END;
$$;

-- The demo store takes no money: no transfer receipt for staff to approve, no
-- card payment.
CREATE OR REPLACE FUNCTION public.refuse_demo_store_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF public.tenant_is_demo(NEW.tenant_id) THEN
        RAISE EXCEPTION 'The demo store takes no payments' USING ERRCODE = 'P0001', HINT = 'DEMO_STORE';
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.refuse_demo_store_payment() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_wallet_topup_requests_not_demo ON public.wallet_topup_requests;
CREATE TRIGGER trg_wallet_topup_requests_not_demo
    BEFORE INSERT ON public.wallet_topup_requests
    FOR EACH ROW EXECUTE FUNCTION public.refuse_demo_store_payment();

DROP TRIGGER IF EXISTS trg_qi_payments_not_demo ON public.qi_payments;
CREATE TRIGGER trg_qi_payments_not_demo
    BEFORE INSERT ON public.qi_payments
    FOR EACH ROW EXECUTE FUNCTION public.refuse_demo_store_payment();

-- ── WhatsApp ────────────────────────────────────────────────────────────────
-- Every send asks this first (lib/whatsapp-wallet.ts). The demo store's
-- customers are invented; nothing is ever sent to their numbers.
CREATE OR REPLACE FUNCTION public.whatsapp_send_check(_tenant_id uuid, _marketing boolean)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    _plan text;
    _status text;
    _cap integer;
    _sent integer;
    _price integer;
    _balance numeric;
    _demo boolean;
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'whatsapp_send_check is service-role only' USING ERRCODE = '42501';
    END IF;

    SELECT t.plan::text, t.status::text, pl.trial_whatsapp_cap, t.is_demo
      INTO _plan, _status, _cap, _demo
      FROM public.tenants t
      LEFT JOIN public.plan_limits pl ON pl.plan = t.plan
     WHERE t.id = _tenant_id;
    IF NOT FOUND THEN
        RETURN 'unknown_shop';
    END IF;
    IF _demo THEN
        RETURN 'demo';
    END IF;
    -- Staff can pause any shop, Ali's own included.
    IF EXISTS (SELECT 1 FROM public.whatsapp_sender_pauses p
                WHERE p.tenant_id = _tenant_id AND p.resumed_at IS NULL) THEN
        RETURN 'paused';
    END IF;
    IF _plan = 'internal' THEN
        RETURN 'ok';
    END IF;

    IF _status = 'trial' THEN
        SELECT count(*) INTO _sent
          FROM public.whatsapp_logs l
         WHERE l.tenant_id = _tenant_id
           AND l.direction = 'outbound'
           AND l.status = 'sent';
        RETURN CASE WHEN _sent < coalesce(_cap, 0) THEN 'ok' ELSE 'trial_cap' END;
    END IF;

    _price := coalesce(public.whatsapp_message_price(_tenant_id, _marketing), 0);
    IF _price = 0 THEN
        RETURN 'ok';
    END IF;
    SELECT w.balance_iqd INTO _balance FROM public.wallet w WHERE w.tenant_id = _tenant_id;
    RETURN CASE WHEN coalesce(_balance, 0) >= _price THEN 'ok' ELSE 'wallet_empty' END;
END;
$$;

-- Every path that sends also writes whatsapp_logs (the dispatcher, the
-- follow-up and abandoned-cart crons, staff alerts, the Prime notice). The demo
-- store sends nothing, so it keeps no message log: a row for it is not written.
CREATE OR REPLACE FUNCTION public.whatsapp_logs_skip_demo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.tenant_id IS NOT NULL AND public.tenant_is_demo(NEW.tenant_id) THEN
        RETURN NULL;
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.whatsapp_logs_skip_demo() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_whatsapp_logs_skip_demo ON public.whatsapp_logs;
CREATE TRIGGER trg_whatsapp_logs_skip_demo
    BEFORE INSERT ON public.whatsapp_logs
    FOR EACH ROW EXECUTE FUNCTION public.whatsapp_logs_skip_demo();

-- ── Couriers ────────────────────────────────────────────────────────────────
-- The courier file export (Prime CSV, Al-Waseet sheet) is our record of how
-- shops ship; a demo export is a rehearsal and is not recorded.
CREATE OR REPLACE FUNCTION public.log_shipping_export(
  p_tenant_id uuid,
  p_company text,
  p_order_count integer,
  p_succeeded boolean,
  p_failure_stage text DEFAULT NULL,
  p_error_message text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.role() = 'service_role' THEN
    RAISE EXCEPTION 'log_shipping_export records what a signed-in operator did; call it as that operator';
  END IF;

  IF p_tenant_id IS NULL OR p_tenant_id NOT IN (SELECT get_user_tenant_ids()) THEN
    RAISE EXCEPTION 'not a member of tenant %', p_tenant_id;
  END IF;

  IF public.tenant_is_demo(p_tenant_id) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.shipping_export_log (
    tenant_id, exported_by, company, order_count, succeeded, failure_stage, error_message
  ) VALUES (
    p_tenant_id, auth.uid(), p_company, p_order_count, p_succeeded, p_failure_stage,
    -- A provider message can be long and is not worth storing in full.
    left(p_error_message, 500)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Every Prime call goes through the store's switched-on prime_connections row
-- (lib/prime/connection.ts). The demo store can never have one.
CREATE OR REPLACE FUNCTION public.prime_connections_not_demo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.is_active AND public.tenant_is_demo(NEW.tenant_id) THEN
        RAISE EXCEPTION 'The demo store is never linked to Prime' USING ERRCODE = 'P0001', HINT = 'DEMO_STORE';
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.prime_connections_not_demo() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_prime_connections_not_demo ON public.prime_connections;
CREATE TRIGGER trg_prime_connections_not_demo
    BEFORE INSERT OR UPDATE OF is_active, tenant_id ON public.prime_connections
    FOR EACH ROW EXECUTE FUNCTION public.prime_connections_not_demo();

-- ── Shield ──────────────────────────────────────────────────────────────────
-- The demo store keeps its own Shield records (its order cards show its own
-- flags), but its invented phones never count for another store, and the
-- network never shows inside it: a demo phone that happened to match a real
-- customer would otherwise put that customer's record on camera.
CREATE OR REPLACE FUNCTION shield.compute(p_tenant_id uuid, p_norms text[])
RETURNS TABLE(phone text, band text, score integer, confidence text, stores integer, outcomes integer, delivered integer, delivered_stores integer, bad jsonb, sequence text[], last_bad_orders_ago integer, trend text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
    WITH ph AS (
        SELECT n AS phone, shield.phone_key(n) AS k
          FROM (SELECT DISTINCT unnest(p_norms) AS n) x
         WHERE length(n) = 10
    ), ev AS (
        SELECT ph.phone, e.tenant_id, e.outcome, e.category, e.occurred_at,
               row_number() OVER (PARTITION BY ph.phone ORDER BY e.occurred_at DESC, e.base_id) - 1 AS newer
          FROM ph
          JOIN shield.events e ON e.phone_key = ph.k AND e.tenant_id <> p_tenant_id
         WHERE NOT EXISTS (SELECT 1 FROM shield.holds h
                            WHERE h.tenant_id = e.tenant_id
                              AND h.day = (e.updated_at AT TIME ZONE 'Asia/Baghdad')::date
                              AND h.status <> 'released')
           AND NOT EXISTS (SELECT 1 FROM public.tenants dt WHERE dt.id = e.tenant_id AND dt.is_demo)
           AND NOT public.tenant_is_demo(p_tenant_id)
    ), tw AS (
        -- Store weight: grows with the store's own delivered volume (0.25 → 1).
        SELECT t.tenant_id,
               LEAST(1.0, 0.25 + (SELECT count(*) FROM shield.events d
                                   WHERE d.tenant_id = t.tenant_id AND d.outcome = 'delivered') / 400.0) AS w
          FROM (SELECT DISTINCT tenant_id FROM ev) t
    ), wev AS (
        SELECT ev.*, power(0.75, ev.newer) * tw.w *
               CASE ev.category
                   WHEN 'refused' THEN 1.0 WHEN 'no_answer' THEN 0.8 WHEN 'phone_off' THEN 0.8
                   WHEN 'wrong_info' THEN 0.7 WHEN 'refused_unspecified' THEN 0.6
                   WHEN 'changed_mind' THEN 0.5 WHEN 'not_available' THEN 0.4
                   ELSE 1.0 END AS wt
          FROM ev JOIN tw USING (tenant_id)
    ), per_store AS (
        -- One store's bad weight on one phone is capped.
        SELECT phone, tenant_id,
               LEAST(1.5, COALESCE(sum(wt) FILTER (WHERE outcome = 'bad'), 0)) AS bad_w,
               COALESCE(sum(wt) FILTER (WHERE outcome = 'delivered'), 0) AS good_w
          FROM wev GROUP BY phone, tenant_id
    ), agg AS (
        SELECT phone,
               count(*)::int AS stores,
               COALESCE(sum(bad_w), 0) AS bad_w,
               sum(good_w) AS good_w
          FROM per_store GROUP BY phone
    ), cats AS (
        SELECT phone, jsonb_object_agg(category, jsonb_build_object('count', n, 'stores', s)) AS bad
          FROM (SELECT phone, category, count(*)::int AS n, count(DISTINCT tenant_id)::int AS s
                  FROM ev WHERE outcome = 'bad' GROUP BY phone, category) c
         GROUP BY phone
    ), seq AS (
        SELECT phone,
               array_agg(CASE WHEN outcome = 'delivered' THEN 'D'
                              WHEN category IN ('refused', 'refused_unspecified') THEN 'R'
                              WHEN category IN ('no_answer', 'phone_off') THEN 'N'
                              WHEN category = 'changed_mind' THEN 'C'
                              ELSE 'O' END ORDER BY newer DESC) FILTER (WHERE newer < 10) AS sequence,
               min(newer) FILTER (WHERE outcome = 'bad')::int AS last_bad,
               count(*)::int AS outcomes,
               count(*) FILTER (WHERE outcome = 'delivered')::int AS delivered,
               count(DISTINCT tenant_id) FILTER (WHERE outcome = 'delivered')::int AS delivered_stores,
               bool_or(outcome = 'bad') AS any_bad,
               bool_and(outcome = 'delivered') FILTER (WHERE newer < 2) AS last_two_good,
               bool_or(outcome = 'bad') FILTER (WHERE newer = 0) AS newest_bad,
               count(*) FILTER (WHERE outcome = 'bad' AND newer < 3) AS recent_bad
          FROM ev GROUP BY phone
    )
    SELECT ph.phone,
           CASE WHEN COALESCE(a.stores, 0) < 2 THEN 'none'
                WHEN r.risk >= 60 THEN 'red'
                WHEN r.risk >= 30 THEN 'yellow'
                ELSE 'green' END,
           CASE WHEN COALESCE(a.stores, 0) < 2 THEN NULL ELSE r.risk END,
           CASE WHEN COALESCE(a.stores, 0) < 2 THEN NULL
                WHEN s.outcomes >= 6 AND a.stores >= 3 THEN 'high'
                WHEN s.outcomes >= 3 THEN 'medium' ELSE 'low' END,
           CASE WHEN COALESCE(a.stores, 0) < 2 THEN NULL ELSE a.stores END,
           CASE WHEN COALESCE(a.stores, 0) < 2 THEN NULL ELSE s.outcomes END,
           CASE WHEN COALESCE(a.stores, 0) < 2 THEN NULL ELSE s.delivered END,
           CASE WHEN COALESCE(a.stores, 0) < 2 THEN NULL ELSE s.delivered_stores END,
           CASE WHEN COALESCE(a.stores, 0) < 2 THEN NULL ELSE COALESCE(c.bad, '{}'::jsonb) END,
           CASE WHEN COALESCE(a.stores, 0) < 2 THEN NULL ELSE s.sequence END,
           CASE WHEN COALESCE(a.stores, 0) < 2 THEN NULL ELSE s.last_bad END,
           CASE WHEN COALESCE(a.stores, 0) < 2 THEN NULL
                WHEN NOT s.any_bad THEN 'steady'
                WHEN s.last_two_good THEN 'improving'
                WHEN s.newest_bad AND s.recent_bad >= 2 THEN 'worsening'
                ELSE 'steady' END
      FROM ph
      LEFT JOIN agg a ON a.phone = ph.phone
      LEFT JOIN cats c ON c.phone = ph.phone
      LEFT JOIN seq s ON s.phone = ph.phone
      LEFT JOIN LATERAL (
          SELECT round(100 * a.bad_w / NULLIF(a.bad_w + a.good_w + 1.5, 0))::int AS risk
      ) r ON true;
$function$;

CREATE OR REPLACE FUNCTION shield.trust(p_tenant_id uuid, p_norms text[])
RETURNS TABLE(phone text, trust integer, trust_new boolean, trust_steps jsonb)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_norm text;
    v_key bytea;
    v_others integer;
    r record;
    v_pts integer;
    v_d integer;
    v_cap integer;
    v_delivered jsonb;
    v_w numeric;
    v_used jsonb;
    v_bad_tenants uuid[];
    v_pattern boolean;
    v_steps jsonb;
    -- The demo store reads only its own records (B13).
    v_demo boolean := public.tenant_is_demo(p_tenant_id);
BEGIN
    FOR v_norm IN SELECT DISTINCT n FROM unnest(p_norms) n WHERE length(n) = 10 LOOP
        v_key := shield.phone_key(v_norm);

        -- Each other store's own delivered volume, read once per phone. Only
        -- stores with a real delivery record (40+) corroborate a phone. The
        -- demo store is never one of them.
        SELECT COALESCE(jsonb_object_agg(t.tenant_id::text, t.delivered), '{}'::jsonb),
               count(*) FILTER (WHERE t.delivered >= 40)
          INTO v_delivered, v_others
          FROM (SELECT o.tenant_id,
                       (SELECT count(*) FROM shield.events d
                         WHERE d.tenant_id = o.tenant_id AND d.outcome = 'delivered') AS delivered
                  FROM (SELECT DISTINCT e.tenant_id FROM shield.events e
                         WHERE e.phone_key = v_key AND e.tenant_id <> p_tenant_id
                           AND NOT v_demo
                           AND NOT EXISTS (SELECT 1 FROM public.tenants dt
                                            WHERE dt.id = e.tenant_id AND dt.is_demo)) o) t;

        v_pts := 100;
        v_used := '{}'::jsonb;
        v_bad_tenants := '{}'::uuid[];
        v_pattern := false;
        v_steps := '[]'::jsonb;

        FOR r IN
            SELECT e.tenant_id, e.outcome, e.category, e.tenant_id = p_tenant_id AS own,
                   COALESCE((v_delivered ->> e.tenant_id::text)::int, 0) AS delivered
              FROM shield.events e
             WHERE e.phone_key = v_key
               AND (e.tenant_id = p_tenant_id
                    OR (v_others >= 2
                        AND NOT EXISTS (SELECT 1 FROM shield.holds h
                                         WHERE h.tenant_id = e.tenant_id
                                           AND h.day = (e.updated_at AT TIME ZONE 'Asia/Baghdad')::date
                                           AND h.status <> 'released')
                        AND NOT EXISTS (SELECT 1 FROM public.tenants dt
                                         WHERE dt.id = e.tenant_id AND dt.is_demo)))
             ORDER BY e.occurred_at, e.base_id
        LOOP
            v_w := CASE WHEN r.own THEN 1.0 ELSE LEAST(1.0, 0.25 + r.delivered / 400.0) END;
            IF r.outcome = 'delivered' THEN
                v_d := LEAST(round(15 * v_w)::int, 100 - v_pts);
            ELSE
                v_d := -round(shield.trust_penalty(r.category) * v_w)::int;
                IF NOT r.own THEN
                    v_cap := round(50 * v_w)::int;
                    v_d := GREATEST(v_d, -(v_cap - COALESCE((v_used ->> r.tenant_id::text)::int, 0)));
                END IF;
                v_d := GREATEST(v_d, -v_pts);
                IF NOT r.own THEN
                    v_used := v_used || jsonb_build_object(r.tenant_id::text,
                              COALESCE((v_used ->> r.tenant_id::text)::int, 0) - v_d);
                END IF;
                IF (r.own OR r.delivered >= 40) AND NOT (r.tenant_id = ANY (v_bad_tenants)) THEN
                    v_bad_tenants := v_bad_tenants || r.tenant_id;
                END IF;
            END IF;
            v_pts := v_pts + v_d;
            v_steps := v_steps || jsonb_build_array(jsonb_build_object(
                'src', CASE WHEN r.own THEN 'own' ELSE 'net' END,
                'kind', COALESCE(r.category, 'delivered'),
                'pts', v_d));

            IF NOT v_pattern AND cardinality(v_bad_tenants) >= 2 THEN
                v_pattern := true;
                v_d := -LEAST(10, v_pts);
                v_pts := v_pts + v_d;
                v_steps := v_steps || jsonb_build_array(jsonb_build_object('src', 'net', 'kind', 'pattern', 'pts', v_d));
            END IF;
        END LOOP;

        phone := v_norm;
        trust := v_pts;
        trust_new := jsonb_array_length(v_steps) = 0;
        trust_steps := v_steps;
        RETURN NEXT;
    END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.shield_store_score(p_days integer DEFAULT 30)
RETURNS TABLE(own_finished integer, own_delivered integer, network_rate integer, network_stores integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_tenant uuid := public.require_current_tenant();
    v_from timestamptz := now() - make_interval(days => LEAST(GREATEST(COALESCE(p_days, 30), 7), 365));
    v_demo boolean := public.tenant_is_demo(v_tenant);
BEGIN
    RETURN QUERY
    WITH per AS (
        SELECT e.tenant_id, count(*)::int AS n, count(*) FILTER (WHERE e.outcome = 'delivered')::int AS d
          FROM shield.events e
         WHERE e.occurred_at >= v_from
           AND (e.tenant_id = v_tenant
                OR NOT EXISTS (SELECT 1 FROM public.tenants dt WHERE dt.id = e.tenant_id AND dt.is_demo))
         GROUP BY e.tenant_id
    ), net AS (
        SELECT count(*)::int AS stores, avg(d::numeric / n) AS rate
          FROM per WHERE tenant_id <> v_tenant AND n >= 30 AND NOT v_demo
    )
    SELECT COALESCE((SELECT n FROM per WHERE tenant_id = v_tenant), 0),
           COALESCE((SELECT d FROM per WHERE tenant_id = v_tenant), 0),
           CASE WHEN net.stores >= 3 THEN round(100 * net.rate)::int END,
           CASE WHEN net.stores >= 3 THEN net.stores END
      FROM net;
END;
$function$;

-- ── Staff console numbers ───────────────────────────────────────────────────
-- Orders across shops (dashboard, shop list, usage): without the demo store.
CREATE OR REPLACE VIEW public.admin_order_facts WITH (security_invoker = true) AS
 SELECT id,
    tenant_id,
    status,
    price,
    city,
    governorate_code,
    source,
    COALESCE(is_return, false) AS is_return,
    created_at,
    (created_at AT TIME ZONE 'Asia/Baghdad'::text) AS created_local,
    (status = ANY (ARRAY['delivered'::text, 'completed'::text])) AND NOT COALESCE(is_return, false) AS is_earned,
    (COALESCE(delivered_at, completed_at) AT TIME ZONE 'Asia/Baghdad'::text) AS earned_local
   FROM orders o
  WHERE deleted_at IS NULL AND status <> 'pending_checkout'::text AND NOT COALESCE(is_test, false)
    AND NOT COALESCE(guide_practice, false) AND take_kind IS NULL
    AND NOT EXISTS (SELECT 1 FROM tenants dt WHERE dt.id = o.tenant_id AND dt.is_demo);

-- Our income: fees are never taken from the demo store (charge_wallet_core);
-- its top-ups and its signup month are left out here.
CREATE OR REPLACE FUNCTION public.admin_income_stats(_now timestamp with time zone DEFAULT now())
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
WITH clock AS (
    SELECT date_trunc('day', _now AT TIME ZONE 'Asia/Baghdad') AS today,
           date_trunc('month', _now AT TIME ZONE 'Asia/Baghdad') AS month_start
),
i AS (
    SELECT v.tenant_id, v.kind, v.amount_iqd, v.created_local, v.kind <> 'other' AS is_fee
    FROM public.admin_income_facts v
),
months AS (
    SELECT g.i, c.month_start - make_interval(months => 11 - g.i) AS m
    FROM clock c
    CROSS JOIN generate_series(0, 11) AS g(i)
),
days7 AS (
    SELECT g.i, (c.today - make_interval(days => 6 - g.i))::date AS d
    FROM clock c
    CROSS JOIN generate_series(0, 6) AS g(i)
),
monthly AS (
    SELECT jsonb_agg(jsonb_build_object(
               'month', to_char(m.m, 'YYYY-MM'),
               'subscription', coalesce(x.subscription, 0),
               'orders', coalesce(x.orders, 0),
               'whatsapp', coalesce(x.whatsapp, 0),
               'other', coalesce(x.other, 0)
           ) ORDER BY m.i) AS arr
    FROM months m
    LEFT JOIN (
        SELECT date_trunc('month', i.created_local) AS m,
               sum(i.amount_iqd) FILTER (WHERE i.kind = 'subscription') AS subscription,
               sum(i.amount_iqd) FILTER (WHERE i.kind = 'orders') AS orders,
               sum(i.amount_iqd) FILTER (WHERE i.kind = 'whatsapp') AS whatsapp,
               sum(i.amount_iqd) FILTER (WHERE i.kind = 'other') AS other
        FROM i
        GROUP BY 1
    ) x ON x.m = m.m
),
by_plan AS (
    SELECT coalesce(jsonb_agg(jsonb_build_object('month', to_char(x.m, 'YYYY-MM'), 'plan', x.plan, 'amount', x.amount)
                              ORDER BY x.m, x.plan), '[]'::jsonb) AS arr
    FROM (
        SELECT date_trunc('month', i.created_local) AS m,
               coalesce(t.plan::text, 'unknown') AS plan,
               sum(i.amount_iqd) AS amount
        FROM i
        LEFT JOIN public.tenants t ON t.id = i.tenant_id
        CROSS JOIN clock c
        WHERE i.is_fee AND i.created_local >= c.month_start - interval '11 months'
        GROUP BY 1, 2
    ) x
),
by_plan90 AS (
    SELECT coalesce(jsonb_agg(jsonb_build_object('plan', x.plan, 'amount', x.amount)
                              ORDER BY x.amount DESC, x.plan), '[]'::jsonb) AS arr
    FROM (
        SELECT coalesce(t.plan::text, 'unknown') AS plan, sum(i.amount_iqd) AS amount
        FROM i
        LEFT JOIN public.tenants t ON t.id = i.tenant_id
        CROSS JOIN clock c
        WHERE i.is_fee AND i.created_local >= c.today - interval '89 days'
        GROUP BY 1
    ) x
),
-- Shops grouped by the Baghdad month they signed up; fees in month 0 to 5 of
-- their life. The six newest cohorts.
cohort_sizes AS (
    SELECT date_trunc('month', t.created_at AT TIME ZONE 'Asia/Baghdad') AS cohort, count(*) AS tenants
    FROM public.tenants t
    WHERE NOT t.is_demo
    GROUP BY 1
    ORDER BY 1 DESC
    LIMIT 6
),
cohort_income AS (
    SELECT s.cohort,
           ((extract(year FROM date_trunc('month', i.created_local)) - extract(year FROM s.cohort)) * 12
            + extract(month FROM date_trunc('month', i.created_local)) - extract(month FROM s.cohort))::int AS age_months,
           sum(i.amount_iqd) AS amount
    FROM i
    JOIN public.tenants t ON t.id = i.tenant_id
    JOIN cohort_sizes s ON s.cohort = date_trunc('month', t.created_at AT TIME ZONE 'Asia/Baghdad')
    WHERE i.is_fee
    GROUP BY 1, 2
),
cohorts AS (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'cohort', to_char(s.cohort, 'YYYY-MM'),
               'tenants', s.tenants,
               'months', (SELECT jsonb_agg(coalesce(ci.amount, 0) ORDER BY g.o)
                          FROM generate_series(0, 5) AS g(o)
                          LEFT JOIN cohort_income ci ON ci.cohort = s.cohort AND ci.age_months = g.o)
           ) ORDER BY s.cohort), '[]'::jsonb) AS arr
    FROM cohort_sizes s
),
by_tenant AS (
    SELECT coalesce(jsonb_agg(jsonb_build_object('tenantId', x.tenant_id, 'amount', x.amount)
                              ORDER BY x.amount DESC, x.tenant_id), '[]'::jsonb) AS arr
    FROM (SELECT i.tenant_id, sum(i.amount_iqd) AS amount FROM i WHERE i.is_fee GROUP BY 1) x
),
fees_daily AS (
    SELECT jsonb_agg(coalesce(x.iqd, 0) ORDER BY d.i) AS arr
    FROM days7 d
    LEFT JOIN (
        SELECT i.created_local::date AS d, sum(i.amount_iqd) AS iqd
        FROM i
        CROSS JOIN clock c
        WHERE i.is_fee AND i.created_local >= c.today - interval '6 days'
        GROUP BY 1
    ) x ON x.d = d.d
),
topups AS (
    SELECT (wt.created_at AT TIME ZONE 'Asia/Baghdad') AS created_local, wt.amount_iqd
    FROM public.wallet_transactions wt
    CROSS JOIN clock c
    WHERE wt.type = 'topup'
      AND wt.created_at >= ((c.today - interval '89 days') AT TIME ZONE 'Asia/Baghdad')
      AND NOT EXISTS (SELECT 1 FROM public.tenants dt WHERE dt.id = wt.tenant_id AND dt.is_demo)
),
topups_daily AS (
    SELECT jsonb_agg(coalesce(x.n, 0) ORDER BY d.i) AS arr
    FROM days7 d
    LEFT JOIN (SELECT tu.created_local::date AS d, count(*) AS n FROM topups tu GROUP BY 1) x ON x.d = d.d
),
topups_dow AS (
    SELECT jsonb_agg(jsonb_build_object('dow', g.dow, 'count', coalesce(x.n, 0), 'total', coalesce(x.total, 0))
                     ORDER BY g.dow) AS arr
    FROM generate_series(0, 6) AS g(dow)
    LEFT JOIN (
        SELECT extract(dow FROM tu.created_local)::int AS dow, count(*) AS n, sum(tu.amount_iqd) AS total
        FROM topups tu
        GROUP BY 1
    ) x ON x.dow = g.dow
)
SELECT jsonb_build_object(
    'today', (SELECT to_char(c.today, 'YYYY-MM-DD') FROM clock c),
    'monthly', (SELECT arr FROM monthly),
    'byPlan', (SELECT arr FROM by_plan),
    'byPlan90', (SELECT arr FROM by_plan90),
    'cohorts', (SELECT arr FROM cohorts),
    'byTenant', (SELECT arr FROM by_tenant),
    'feesDaily7', (SELECT arr FROM fees_daily),
    'topups', jsonb_build_object('daily7', (SELECT arr FROM topups_daily), 'byDow', (SELECT arr FROM topups_dow))
);
$function$;
