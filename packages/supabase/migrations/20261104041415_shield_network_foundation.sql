-- Shield: the cross-store customer risk network (Ali, 2026-11-04).
--
-- Every store's finished purchases feed one shared ledger keyed by a secret
-- keyed hash of the customer's phone. A store reads back only buckets of
-- outcomes from OTHER stores: never a store id, name, order, product, amount
-- or address, and never a reason label (labels are free text a store types).
--
-- Isolation:
-- * The ledger lives in schema `shield`, which PostgREST does not expose, with
--   RLS on and no policy, and no grants to anon/authenticated.
-- * The phone key is HMAC-SHA256(normalized phone, pepper). The pepper is a
--   random Vault secret created here inside the database; it never appears in
--   this file, in the app, or in the browser.
-- * public.shield_lookup() takes the tenant from the session
--   (require_current_tenant), answers only for phones that already ordered from
--   that store, excludes that store's own events, shows nothing until 2+ other
--   stores saw the number, and is rate limited per store.
--
-- Scoring (explainable): healing is by orders, not calendar (Ali): each newer
-- outcome shrinks older ones (x0.75 per newer order). A store's bad reports are
-- capped per phone and weighted by the store's own delivered volume, so one
-- store (or a brand-new one) cannot poison a customer.

CREATE SCHEMA IF NOT EXISTS shield;
REVOKE ALL ON SCHEMA shield FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------- pepper
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'shield_phone_pepper') THEN
        PERFORM vault.create_secret(
            encode(extensions.gen_random_bytes(32), 'hex'),
            'shield_phone_pepper',
            'Shield: HMAC key for customer phone hashing. Rotating it requires a full ledger rebuild.');
    END IF;
END $$;

CREATE OR REPLACE FUNCTION shield.phone_key(p_norm text)
RETURNS bytea
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
    SELECT extensions.hmac(p_norm, s.decrypted_secret, 'sha256')
      FROM vault.decrypted_secrets s
     WHERE s.name = 'shield_phone_pepper';
$$;
REVOKE ALL ON FUNCTION shield.phone_key(text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------- ledger
-- One row per finished purchase (order base id) per store.
CREATE TABLE IF NOT EXISTS shield.events (
    tenant_id   uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    base_id     text        NOT NULL,
    phone_key   bytea       NOT NULL,
    outcome     text        NOT NULL CHECK (outcome IN ('delivered', 'bad')),
    category    text        CHECK (category IN ('refused', 'refused_unspecified', 'no_answer', 'phone_off',
                                                'changed_mind', 'wrong_info', 'not_available')),
    occurred_at timestamptz NOT NULL,
    updated_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, base_id, phone_key),
    CHECK ((outcome = 'bad') = (category IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS shield_events_phone_idx ON shield.events (phone_key, occurred_at DESC);
ALTER TABLE shield.events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON shield.events FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS shield.lookup_log (
    tenant_id uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    phones    integer     NOT NULL,
    at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shield_lookup_log_idx ON shield.lookup_log (tenant_id, at DESC);
ALTER TABLE shield.lookup_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON shield.lookup_log FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------- reasons
-- Maps a store's own reason wording to one fixed category. Store wording is
-- never shared. Not-the-customer's-fault reasons (duplicate, out of stock,
-- wrong product, price, outside area, courier did not deliver) return NULL and
-- are not counted at all.
CREATE OR REPLACE FUNCTION shield.reason_category(p_status text, p_reason text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
    SELECT CASE
        WHEN p_status = 'no_response' THEN 'no_answer'
        WHEN r ~ '(مكرر|duplicate|غير متوفر|unavailable|منتج خاطئ|wrong product|سعر|price|خارج منطقة|outside|لم يتم توصيله|عطل)' THEN NULL
        WHEN r ~ '(رفض|refus)' THEN 'refused'
        WHEN r ~ '(مغلق|phone off|switched off)' THEN 'phone_off'
        WHEN r ~ '(لا يجاوب|لم يرد|لا يرد|يجاوب|no answer|no reply|didn.t reply|did not reply)' THEN 'no_answer'
        WHEN r ~ '(الغى العميل|ألغى العميل|إلغاء العميل|customer cancel|changed mind|ملغي)' THEN 'changed_mind'
        WHEN r ~ '(معلومات خاطئة|عنوان خاطئ|رقم خاطئ|wrong address|wrong info|wrong number)' THEN 'wrong_info'
        WHEN r ~ '(غير متواجد|مسافر|تأجيل|لاحقا|postpon|not available)' THEN 'not_available'
        WHEN p_status = 'rejected' THEN 'refused_unspecified'
        ELSE NULL
    END
    FROM (SELECT lower(COALESCE(p_reason, '')) AS r) x;
$$;
REVOKE ALL ON FUNCTION shield.reason_category(text, text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------- sync
-- Rebuilds one store's events for one phone from customer_order_facts (the
-- same facts the customer pages read: exchanged purchases count as delivered,
-- tests/archived/deleted/pending checkout excluded, returns ignored).
CREATE OR REPLACE FUNCTION shield.sync_phone(p_tenant_id uuid, p_phone text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    norm text := public.normalize_phone_for_search(p_phone);
    k bytea;
BEGIN
    IF p_tenant_id IS NULL OR norm IS NULL OR length(norm) <> 10 THEN RETURN; END IF;
    k := shield.phone_key(norm);

    WITH rows AS (
        SELECT f.base_id, f.created_at, f.status, f.is_delivered,
               COALESCE(rr.label_ar, o.rejection_reason) AS reason
          FROM public.customer_order_facts f
          JOIN public.orders o ON o.id = f.id
          LEFT JOIN public.order_reasons rr ON rr.id = o.reason_id AND rr.tenant_id = o.tenant_id
         WHERE f.tenant_id = p_tenant_id
           AND f.norm_phone = norm
           AND NOT f.is_return
    ), per_base AS (
        SELECT base_id,
               min(created_at) AS occurred_at,
               bool_or(is_delivered OR status IN ('completed', 'delivered')) AS delivered,
               -- Latest closed-unsold row decides the bad category.
               (array_agg(shield.reason_category(status, reason) ORDER BY created_at DESC)
                    FILTER (WHERE status IN ('rejected', 'no_response', 'cancelled')))[1] AS category,
               bool_or(status IN ('rejected', 'no_response', 'cancelled')) AS closed_unsold,
               bool_and(status IN ('completed', 'delivered', 'rejected', 'no_response', 'cancelled',
                                   'returned', 'refunded', 'refund_delivered', 'return_pending')) AS finished
          FROM rows
         GROUP BY base_id
    ), wanted AS (
        SELECT base_id, occurred_at,
               CASE WHEN delivered THEN 'delivered' ELSE 'bad' END AS outcome,
               CASE WHEN delivered THEN NULL ELSE category END AS category
          FROM per_base
         WHERE delivered OR (finished AND closed_unsold AND category IS NOT NULL)
    ), del AS (
        DELETE FROM shield.events e
         WHERE e.tenant_id = p_tenant_id AND e.phone_key = k
           AND NOT EXISTS (SELECT 1 FROM wanted w WHERE w.base_id = e.base_id)
    )
    INSERT INTO shield.events AS e (tenant_id, base_id, phone_key, outcome, category, occurred_at, updated_at)
    SELECT p_tenant_id, w.base_id, k, w.outcome, w.category, w.occurred_at, now()
      FROM wanted w
    ON CONFLICT (tenant_id, base_id, phone_key) DO UPDATE
       SET outcome = EXCLUDED.outcome, category = EXCLUDED.category,
           occurred_at = EXCLUDED.occurred_at, updated_at = now()
     WHERE (e.outcome, e.category, e.occurred_at) IS DISTINCT FROM
           (EXCLUDED.outcome, EXCLUDED.category, EXCLUDED.occurred_at);
END;
$$;
REVOKE ALL ON FUNCTION shield.sync_phone(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION shield.orders_sync_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        PERFORM shield.sync_phone(OLD.tenant_id, OLD.phone);
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE')
       AND (TG_OP = 'INSERT' OR NEW.phone IS DISTINCT FROM OLD.phone OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id) THEN
        PERFORM shield.sync_phone(NEW.tenant_id, NEW.phone);
    END IF;
    RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION shield.orders_sync_trigger() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_orders_shield_sync ON public.orders;
CREATE TRIGGER trg_orders_shield_sync
AFTER INSERT OR DELETE OR UPDATE OF status, phone, tenant_id, reason_id, rejection_reason,
    deleted_at, is_test, is_archived, is_return, original_order_id, delivered_at
ON public.orders
FOR EACH ROW EXECUTE FUNCTION shield.orders_sync_trigger();

-- ---------------------------------------------------------------- scoring
-- Pure scoring over other stores' events for a set of normalized phones.
-- Internal: callers must already have scoped p_tenant_id from the session.
CREATE OR REPLACE FUNCTION shield.compute(p_tenant_id uuid, p_norms text[])
RETURNS TABLE (
    phone text, band text, score integer, confidence text, stores integer, outcomes integer,
    delivered integer, delivered_stores integer, bad jsonb, sequence text[],
    last_bad_orders_ago integer, trend text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
    WITH ph AS (
        SELECT n AS phone, shield.phone_key(n) AS k
          FROM (SELECT DISTINCT unnest(p_norms) AS n) x
         WHERE length(n) = 10
    ), ev AS (
        SELECT ph.phone, e.tenant_id, e.outcome, e.category, e.occurred_at,
               row_number() OVER (PARTITION BY ph.phone ORDER BY e.occurred_at DESC, e.base_id) - 1 AS newer
          FROM ph
          JOIN shield.events e ON e.phone_key = ph.k AND e.tenant_id <> p_tenant_id
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
$$;
REVOKE ALL ON FUNCTION shield.compute(uuid, text[]) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------- lookup
CREATE OR REPLACE FUNCTION public.shield_lookup(p_phones text[])
RETURNS TABLE (
    phone text, band text, score integer, confidence text, stores integer, outcomes integer,
    delivered integer, delivered_stores integer, bad jsonb, sequence text[],
    last_bad_orders_ago integer, trend text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_tenant uuid := public.require_current_tenant();
    v_norms text[];
    v_recent bigint;
BEGIN
    IF COALESCE(cardinality(p_phones), 0) = 0 THEN RETURN; END IF;
    IF cardinality(p_phones) > 200 THEN
        RAISE EXCEPTION 'shield_lookup: at most 200 phones per call' USING ERRCODE = '22023';
    END IF;

    -- Only numbers that already ordered from this store: nobody can map the
    -- network by pasting phone lists.
    SELECT array_agg(DISTINCT n) INTO v_norms
      FROM (SELECT public.normalize_phone_for_search(p) AS n FROM unnest(p_phones) p) x
     WHERE length(n) = 10
       AND EXISTS (SELECT 1 FROM public.customer_trust ct WHERE ct.tenant_id = v_tenant AND ct.phone = x.n);
    IF v_norms IS NULL THEN RETURN; END IF;

    SELECT COALESCE(sum(l.phones), 0) INTO v_recent
      FROM shield.lookup_log l
     WHERE l.tenant_id = v_tenant AND l.at > now() - interval '1 hour';
    IF v_recent + cardinality(v_norms) > 6000 THEN
        RAISE EXCEPTION 'shield_lookup: hourly lookup limit reached' USING ERRCODE = '54000';
    END IF;
    INSERT INTO shield.lookup_log (tenant_id, phones) VALUES (v_tenant, cardinality(v_norms));

    RETURN QUERY SELECT * FROM shield.compute(v_tenant, v_norms);
END;
$$;
REVOKE ALL ON FUNCTION public.shield_lookup(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shield_lookup(text[]) TO authenticated;

-- Old lookup rows are useless after the hour window.
SELECT cron.schedule('shield-lookup-log-prune', '17 * * * *',
    $$DELETE FROM shield.lookup_log WHERE at < now() - interval '2 hours'$$)
 WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'shield-lookup-log-prune');

-- ---------------------------------------------------------------- backfill
DO $$
DECLARE r record;
BEGIN
    FOR r IN SELECT DISTINCT f.tenant_id, f.norm_phone FROM public.customer_order_facts f WHERE length(f.norm_phone) = 10 LOOP
        PERFORM shield.sync_phone(r.tenant_id, r.norm_phone);
    END LOOP;
END $$;
