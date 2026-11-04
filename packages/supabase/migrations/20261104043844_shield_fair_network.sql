-- Shield wave 4a: keep the network fair.
--
-- * Burst guard: a store that suddenly writes far more bad outcomes in one
--   Baghdad day than it usually does has that day held out of the network
--   (shield.holds). A held day comes back by itself after 3 days unless a
--   reviewer blocks it. The day a store first enters the ledger (its history
--   load) is not checked. The store's own view never changes.
-- * Wrong-record reports: a store can say a customer's network record is
--   wrong (only for numbers that ordered from it, 20 per day). Reports wait
--   in shield.reports for our reviewer; nothing changes on its own.
-- * Store score: this store's delivery rate against the average of other
--   stores, only when 3 or more other stores have 30+ finished orders in the
--   window. Network aggregates only.

CREATE TABLE IF NOT EXISTS shield.holds (
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    day date NOT NULL,
    bad integer NOT NULL,
    usual numeric NOT NULL,
    status text NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'released', 'blocked')),
    created_at timestamptz NOT NULL DEFAULT now(),
    decided_at timestamptz,
    PRIMARY KEY (tenant_id, day)
);
ALTER TABLE shield.holds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON shield.holds FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS shield_events_tenant_updated_idx ON shield.events (tenant_id, updated_at DESC);

CREATE OR REPLACE FUNCTION shield.scan_bursts()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $$
    WITH days AS (
        SELECT e.tenant_id, (e.updated_at AT TIME ZONE 'Asia/Baghdad')::date AS day,
               count(*) FILTER (WHERE e.outcome = 'bad')::int AS bad
          FROM shield.events e
         WHERE e.updated_at >= now() - interval '2 days'
         GROUP BY 1, 2
    ), first_day AS (
        SELECT e.tenant_id, min((e.updated_at AT TIME ZONE 'Asia/Baghdad')::date) AS day
          FROM shield.events e
         WHERE e.tenant_id IN (SELECT tenant_id FROM days)
         GROUP BY 1
    ), usual AS (
        SELECT d.tenant_id, d.day,
               GREATEST(10, COALESCE((SELECT count(*) FILTER (WHERE p.outcome = 'bad') / 30.0
                                        FROM shield.events p
                                       WHERE p.tenant_id = d.tenant_id
                                         AND (p.updated_at AT TIME ZONE 'Asia/Baghdad')::date >= d.day - 30
                                         AND (p.updated_at AT TIME ZONE 'Asia/Baghdad')::date < d.day), 0)) AS usual,
               d.bad
          FROM days d
          JOIN first_day f ON f.tenant_id = d.tenant_id AND f.day < d.day
    )
    INSERT INTO shield.holds AS h (tenant_id, day, bad, usual)
    SELECT tenant_id, day, bad, round(usual, 1) FROM usual
     WHERE bad >= 40 AND bad >= 4 * usual
    ON CONFLICT (tenant_id, day) DO UPDATE SET bad = EXCLUDED.bad
     WHERE h.status = 'held';

    UPDATE shield.holds SET status = 'released', decided_at = now()
     WHERE status = 'held' AND created_at < now() - interval '3 days';
$$;
REVOKE ALL ON FUNCTION shield.scan_bursts() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('shield-scan-bursts', '*/15 * * * *', $$SELECT shield.scan_bursts()$$)
 WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'shield-scan-bursts');

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
         WHERE NOT EXISTS (SELECT 1 FROM shield.holds h
                            WHERE h.tenant_id = e.tenant_id
                              AND h.day = (e.updated_at AT TIME ZONE 'Asia/Baghdad')::date
                              AND h.status <> 'released')
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

CREATE TABLE IF NOT EXISTS shield.reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    phone_key bytea NOT NULL,
    note text NOT NULL CHECK (length(note) BETWEEN 1 AND 500),
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'kept', 'removed')),
    created_at timestamptz NOT NULL DEFAULT now(),
    decided_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS shield_reports_one_open_idx ON shield.reports (tenant_id, phone_key) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS shield_reports_tenant_created_idx ON shield.reports (tenant_id, created_at DESC);
ALTER TABLE shield.reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON shield.reports FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.shield_report_wrong(p_phone text, p_note text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_tenant uuid := public.require_current_tenant();
    v_norm text := public.normalize_phone_for_search(p_phone);
    v_note text := btrim(COALESCE(p_note, ''));
    v_key bytea;
BEGIN
    IF v_norm IS NULL OR length(v_norm) <> 10 THEN
        RAISE EXCEPTION 'invalid phone' USING ERRCODE = '22023';
    END IF;
    IF length(v_note) < 1 OR length(v_note) > 500 THEN
        RAISE EXCEPTION 'note must be 1 to 500 characters' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.customer_order_facts f
                    WHERE f.tenant_id = v_tenant AND f.norm_phone = v_norm) THEN
        RAISE EXCEPTION 'this number has no orders in this store' USING ERRCODE = '42501';
    END IF;
    IF (SELECT count(*) FROM shield.reports r
         WHERE r.tenant_id = v_tenant AND r.created_at > now() - interval '1 day') >= 20 THEN
        RAISE EXCEPTION 'report limit reached for today' USING ERRCODE = '54000';
    END IF;
    v_key := shield.phone_key(v_norm);
    INSERT INTO shield.reports (tenant_id, phone_key, note)
    VALUES (v_tenant, v_key, v_note)
    ON CONFLICT (tenant_id, phone_key) WHERE status = 'open' DO UPDATE SET note = EXCLUDED.note;
END;
$$;
REVOKE ALL ON FUNCTION public.shield_report_wrong(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shield_report_wrong(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.shield_store_score(p_days integer DEFAULT 30)
RETURNS TABLE (own_finished integer, own_delivered integer, network_rate integer, network_stores integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_tenant uuid := public.require_current_tenant();
    v_from timestamptz := now() - make_interval(days => LEAST(GREATEST(COALESCE(p_days, 30), 7), 365));
BEGIN
    RETURN QUERY
    WITH per AS (
        SELECT e.tenant_id, count(*)::int AS n, count(*) FILTER (WHERE e.outcome = 'delivered')::int AS d
          FROM shield.events e
         WHERE e.occurred_at >= v_from
         GROUP BY e.tenant_id
    ), net AS (
        SELECT count(*)::int AS stores, avg(d::numeric / n) AS rate
          FROM per WHERE tenant_id <> v_tenant AND n >= 30
    )
    SELECT COALESCE((SELECT n FROM per WHERE tenant_id = v_tenant), 0),
           COALESCE((SELECT d FROM per WHERE tenant_id = v_tenant), 0),
           CASE WHEN net.stores >= 3 THEN round(100 * net.rate)::int END,
           CASE WHEN net.stores >= 3 THEN net.stores END
      FROM net;
END;
$$;
REVOKE ALL ON FUNCTION public.shield_store_score(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shield_store_score(integer) TO authenticated;
