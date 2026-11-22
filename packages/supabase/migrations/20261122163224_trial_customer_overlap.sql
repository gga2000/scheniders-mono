-- Fermi B5, the last signal (due 13 Dec): customer-phone overlap.
--
-- A merchant who restarts the free week can change the owner phone, the
-- mailbox and the courier account, but not the customers. Once a store on
-- trial has 30 orders, the customer phones of its first 30 orders are compared
-- with the customers of every earlier store. When at least 30% of those phones,
-- and at least 5, also ordered from one earlier store, that is a strong signal:
-- no second trial (handoff B5 signal 2). "Earlier store" is the rule the other
-- signals use (20261116103536): created before this one, not paying now, and
-- not the house, demo, prospect or an exempt test shop.
--
-- Which orders count, on both sides: real orders. A test order, a guide
-- practice order, a return, a replacement and an abandoned cart nobody
-- confirmed (pending_checkout) do not. A deleted order still counts, so
-- deleting orders cannot hide a store's customers.
--
-- Hashes only. Every checked store's customer phones are kept as HMAC digests
-- with the one-trial Vault pepper under the family 'customer', so a customer
-- digest never matches an owner phone. An hourly sweep writes them, never the
-- order path, then re-runs the check for trial stores that have 30 orders.
-- The tables have RLS on, no policy and no grants: only the database and the
-- staff console's service role read them. Nothing reaches a merchant; the lock
-- screen still only says "we found an earlier store of yours"
-- (billing_lock_status.previous_store).
--
-- Rollback:
--   SELECT cron.unschedule('trial-customer-overlap');
--   DROP FUNCTION public.trial_customer_sweep(), public.trial_customer_overlap(uuid),
--     public.trial_counts_order(public.orders);
--   DROP TABLE public.trial_customer_sweep_state, public.trial_customer_digests;
--   and trial_check_run from 20261116103536_trial_one_per_merchant.sql

-- 1. Which orders count --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trial_counts_order(_o public.orders)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT NOT coalesce(_o.is_test, false)
       AND NOT _o.guide_practice
       AND NOT coalesce(_o.is_return, false)
       AND NOT coalesce(_o.is_replacement, false)
       AND _o.status <> 'pending_checkout';
$function$;
REVOKE ALL ON FUNCTION public.trial_counts_order(public.orders) FROM PUBLIC, anon, authenticated;

-- 2. Tables -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trial_customer_digests (
    digest         text        NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
    tenant_id      uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    -- The store's first counted order from this customer.
    first_order_at timestamptz NOT NULL,
    PRIMARY KEY (digest, tenant_id)
);
CREATE INDEX IF NOT EXISTS trial_customer_digests_tenant_id_fk ON public.trial_customer_digests (tenant_id);
ALTER TABLE public.trial_customer_digests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trial_customer_digests FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.trial_customer_digests IS
    'Fermi B5: keyed hashes of the customer phones each store has had orders from, for the one-trial customer-overlap signal. Never shown to merchants.';

CREATE TABLE IF NOT EXISTS public.trial_customer_sweep_state (
    id            boolean     PRIMARY KEY DEFAULT true CHECK (id),
    -- Orders created before this (less an hour for late commits) are recorded.
    swept_through timestamptz NOT NULL
);
ALTER TABLE public.trial_customer_sweep_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trial_customer_sweep_state FROM PUBLIC, anon, authenticated;
INSERT INTO public.trial_customer_sweep_state (id, swept_through) VALUES (true, '-infinity')
ON CONFLICT (id) DO NOTHING;

-- 3. The overlap for one store: per other store, how many of the customers of
--    its first 30 orders also ordered there. Nothing until it has 30 orders.
CREATE OR REPLACE FUNCTION public.trial_customer_overlap(_tenant_id uuid)
RETURNS TABLE (tenant_id uuid, matched integer, customers integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _phones text[];
BEGIN
    SELECT array_agg(f.p)
      INTO _phones
      FROM (
            SELECT public.normalize_phone(o.phone) AS p
              FROM public.orders o
             WHERE o.tenant_id = _tenant_id
               AND public.trial_counts_order(o)
             ORDER BY o.created_at, o.id
             LIMIT 30
           ) f;
    IF coalesce(array_length(_phones, 1), 0) < 30 THEN
        RETURN;
    END IF;

    RETURN QUERY
    WITH mine AS (
        SELECT DISTINCT public.trial_fingerprint_digest('customer', p) AS digest
          FROM unnest(_phones) AS p
         -- An Iraqi mobile, as for the owner phone: a short typo matches strangers.
         WHERE length(p) BETWEEN 10 AND 12
    ), total AS (
        SELECT count(*)::integer AS n FROM mine
    )
    SELECT c.tenant_id, count(*)::integer, t.n
      FROM mine m
      JOIN public.trial_customer_digests c ON c.digest = m.digest AND c.tenant_id <> _tenant_id
     CROSS JOIN total t
     GROUP BY c.tenant_id, t.n
    HAVING count(*) >= 5 AND count(*) * 10 >= t.n * 3;
END;
$function$;
REVOKE ALL ON FUNCTION public.trial_customer_overlap(uuid) FROM PUBLIC, anon, authenticated;

-- 4. The check, with the overlap as a strong signal ---------------------------
CREATE OR REPLACE FUNCTION public.trial_check_run(_tenant_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _status text;
    _created timestamptz;
    _signals jsonb;
    _strong integer;
    _medium integer;
    _overlap jsonb;
    _overlap_stores integer;
    _verdict text;
    _decision text;
BEGIN
    SELECT t.status::text, t.created_at INTO _status, _created
      FROM public.tenants t WHERE t.id = _tenant_id;
    IF NOT FOUND OR public.trial_check_skipped(_tenant_id) THEN
        RETURN NULL;
    END IF;

    -- Every store's identifiers are kept, paying or not: a paying store that
    -- stops paying counts as an earlier store from then on.
    PERFORM public.trial_fingerprints_refresh(_tenant_id);

    IF _status <> 'trial' THEN
        RETURN NULL;
    END IF;

    SELECT coalesce(jsonb_agg(jsonb_build_object('family', h.family, 'source', h.source, 'tenant_id', h.matched)
                              ORDER BY h.family, h.source, h.matched), '[]'::jsonb),
           count(DISTINCT h.digest) FILTER (WHERE h.family = 'prime'),
           count(DISTINCT h.family || ':' || h.digest) FILTER (WHERE h.family IN ('phone', 'email'))
      INTO _signals, _strong, _medium
      FROM (
            SELECT DISTINCT m.family, m.digest, m.source, f.tenant_id AS matched
              FROM public.trial_fingerprints m
              JOIN public.trial_fingerprints f
                ON f.family = m.family AND f.digest = m.digest AND f.tenant_id <> m.tenant_id
              JOIN public.tenants o ON o.id = f.tenant_id
             WHERE m.tenant_id = _tenant_id
               AND o.created_at < _created
               AND NOT public.trial_check_skipped(o.id)
               AND NOT public.tenant_is_paying(o.id)
           ) h;

    -- Customers shared with an earlier store (from 30 orders on): strong.
    -- Staff see how many of how many; never which customers.
    SELECT coalesce(jsonb_agg(jsonb_build_object('family', 'customers', 'source', 'customer_overlap',
                                                 'tenant_id', x.tenant_id, 'matched', x.matched,
                                                 'customers', x.customers)
                              ORDER BY x.tenant_id), '[]'::jsonb),
           count(*)
      INTO _overlap, _overlap_stores
      FROM public.trial_customer_overlap(_tenant_id) x
      JOIN public.tenants o ON o.id = x.tenant_id
     WHERE o.created_at < _created
       AND NOT public.trial_check_skipped(o.id)
       AND NOT public.tenant_is_paying(o.id);
    _signals := _signals || _overlap;
    _strong := _strong + _overlap_stores;

    _verdict := CASE
        WHEN _strong > 0 OR _medium >= 2 THEN 'no_trial'
        WHEN _medium = 1 THEN 'review'
    END;
    IF _verdict IS NULL THEN
        RETURN NULL;
    END IF;

    -- A verdict never goes back down (an earlier store that starts paying
    -- leaves the list of signals, not the decision already taken).
    INSERT INTO public.trial_checks AS c (tenant_id, verdict, signals)
    VALUES (_tenant_id, _verdict, _signals)
    ON CONFLICT (tenant_id) DO UPDATE
       SET verdict = CASE WHEN c.verdict = 'no_trial' THEN 'no_trial' ELSE EXCLUDED.verdict END,
           signals = EXCLUDED.signals,
           updated_at = now()
     WHERE c.signals IS DISTINCT FROM EXCLUDED.signals
        OR (c.verdict = 'review' AND EXCLUDED.verdict = 'no_trial');

    SELECT c.verdict, c.staff_decision INTO _verdict, _decision
      FROM public.trial_checks c WHERE c.tenant_id = _tenant_id;

    IF _verdict = 'no_trial'
       AND _decision IS DISTINCT FROM 'allow_trial'
       AND public.trial_check_end_trial(_tenant_id) THEN
        UPDATE public.trial_checks SET trial_withheld_at = now() WHERE tenant_id = _tenant_id;
        INSERT INTO public.admin_activity_logs (admin_label, tenant_id, action, details)
        VALUES ('system', _tenant_id, 'trial_withheld',
                jsonb_build_object('signals', (SELECT jsonb_agg(DISTINCT s->>'family') FROM jsonb_array_elements(_signals) s)));
    END IF;

    RETURN _verdict;
END;
$function$;
REVOKE ALL ON FUNCTION public.trial_check_run(uuid) FROM PUBLIC, anon, authenticated;

COMMENT ON COLUMN public.trial_checks.signals IS
    'Fermi B5: [{family, source, tenant_id}] per identifier that matched an earlier store; a customers/customer_overlap entry adds matched and customers (how many of the first 30 orders'' customers also ordered there).';

-- 5. The hourly sweep: record new customers, then re-check trial stores that
--    have 30 orders. The pepper is read once; the digest is the one
--    trial_fingerprint_digest('customer', phone) gives.
CREATE OR REPLACE FUNCTION public.trial_customer_sweep()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _pepper text;
    _from timestamptz;
    _to timestamptz := now();
    _recorded integer;
    _checked integer := 0;
    _tenant uuid;
BEGIN
    SELECT s.decrypted_secret INTO _pepper
      FROM vault.decrypted_secrets s
     WHERE s.name = 'trial_fingerprint_pepper';
    IF _pepper IS NULL THEN
        RAISE EXCEPTION 'trial_fingerprint_pepper is missing from the vault';
    END IF;

    -- One sweep at a time. An order committed late can carry a created_at
    -- before the last sweep, so each sweep looks an hour further back.
    SELECT swept_through - interval '1 hour' INTO _from
      FROM public.trial_customer_sweep_state
     WHERE id
       FOR UPDATE;

    -- Store by store, so each read stays on that store's (tenant_id, …,
    -- created_at) index instead of reading every order.
    INSERT INTO public.trial_customer_digests (digest, tenant_id, first_order_at)
    SELECT encode(extensions.hmac('customer:' || o.p, _pepper, 'sha256'), 'hex'), t.id, min(o.created_at)
      FROM public.tenants t
     CROSS JOIN LATERAL (
            SELECT x.created_at, public.normalize_phone(x.phone) AS p
              FROM public.orders x
             WHERE x.tenant_id = t.id
               AND x.created_at >= _from
               AND public.trial_counts_order(x)
           ) o
     WHERE NOT public.trial_check_skipped(t.id)
       AND length(o.p) BETWEEN 10 AND 12
     GROUP BY 1, 2
    ON CONFLICT (digest, tenant_id) DO NOTHING;
    GET DIAGNOSTICS _recorded = ROW_COUNT;

    UPDATE public.trial_customer_sweep_state SET swept_through = _to WHERE id;

    FOR _tenant IN
        SELECT t.id
          FROM public.tenants t
         WHERE t.status = 'trial'
           AND NOT public.trial_check_skipped(t.id)
           AND (SELECT count(*) FROM (SELECT 1 FROM public.orders o
                                       WHERE o.tenant_id = t.id AND public.trial_counts_order(o)
                                       LIMIT 30) n) = 30
         ORDER BY t.created_at
    LOOP
        PERFORM public.trial_check_run(_tenant);
        _checked := _checked + 1;
    END LOOP;

    RETURN jsonb_build_object('recorded', _recorded, 'checked', _checked);
END;
$function$;
REVOKE ALL ON FUNCTION public.trial_customer_sweep() FROM PUBLIC, anon, authenticated;

-- 6. Record the customers of today's stores (the house, demo and test shop are
--    skipped, so this records nothing today), then every hour.
SELECT public.trial_customer_sweep();
SELECT cron.schedule('trial-customer-overlap', '39 * * * *', 'SELECT public.trial_customer_sweep()');