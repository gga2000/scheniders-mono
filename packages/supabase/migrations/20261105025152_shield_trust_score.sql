-- Shield Trust score (Ali, 2026-11-05): every customer starts at 100 and
-- moves only on what they did, in this store and in other stores.
--
-- Points per finished order, oldest first:
--   refused at the door -35 · refused, no reason -25 · no answer / phone off -25
--   wrong name, address or number -20 · changed mind -10 · away / postponed -5
--   delivered +15 (never above 100)
-- Store or courier fault reasons never reach the ledger (shield.reason_category).
-- Guards for other stores: one store takes at most 50 points off a number; bad
-- orders in 2+ different stores take 10 more, once (a pattern, not a bad day).
-- Other stores count only when 2+ other stores saw the number (same rule as
-- shield_lookup) and never from a held burst day (shield.holds).
-- Ad channel, order hour, address length and product count are not points.

CREATE OR REPLACE FUNCTION shield.trust_penalty(p_category text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
    SELECT CASE p_category
        WHEN 'refused' THEN 35
        WHEN 'refused_unspecified' THEN 25
        WHEN 'no_answer' THEN 25
        WHEN 'phone_off' THEN 25
        WHEN 'wrong_info' THEN 20
        WHEN 'changed_mind' THEN 10
        WHEN 'not_available' THEN 5
        ELSE 0
    END;
$$;
REVOKE ALL ON FUNCTION shield.trust_penalty(text) FROM PUBLIC, anon, authenticated;

-- Internal: callers must already have scoped p_tenant_id from the session.
-- steps: one entry per counted order, oldest first:
--   {src: own|net, kind: delivered|<category>|pattern, pts: applied change}
CREATE OR REPLACE FUNCTION shield.trust(p_tenant_id uuid, p_norms text[])
RETURNS TABLE (phone text, trust integer, trust_new boolean, trust_steps jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_norm text;
    v_key bytea;
    v_others integer;
    r record;
    v_pts integer;
    v_d integer;
    v_used jsonb;
    v_bad_tenants uuid[];
    v_pattern boolean;
    v_steps jsonb;
BEGIN
    FOR v_norm IN SELECT DISTINCT n FROM unnest(p_norms) n WHERE length(n) = 10 LOOP
        v_key := shield.phone_key(v_norm);

        SELECT count(DISTINCT e.tenant_id) INTO v_others
          FROM shield.events e
         WHERE e.phone_key = v_key AND e.tenant_id <> p_tenant_id;

        v_pts := 100;
        v_used := '{}'::jsonb;
        v_bad_tenants := '{}'::uuid[];
        v_pattern := false;
        v_steps := '[]'::jsonb;

        FOR r IN
            SELECT e.tenant_id, e.outcome, e.category, e.tenant_id = p_tenant_id AS own
              FROM shield.events e
             WHERE e.phone_key = v_key
               AND (e.tenant_id = p_tenant_id
                    OR (v_others >= 2
                        AND NOT EXISTS (SELECT 1 FROM shield.holds h
                                         WHERE h.tenant_id = e.tenant_id
                                           AND h.day = (e.updated_at AT TIME ZONE 'Asia/Baghdad')::date
                                           AND h.status <> 'released')))
             ORDER BY e.occurred_at, e.base_id
        LOOP
            IF r.outcome = 'delivered' THEN
                v_d := LEAST(15, 100 - v_pts);
            ELSE
                v_d := -shield.trust_penalty(r.category);
                IF NOT r.own THEN
                    v_d := GREATEST(v_d, -(50 - COALESCE((v_used ->> r.tenant_id::text)::int, 0)));
                END IF;
                v_d := GREATEST(v_d, -v_pts);
                IF NOT r.own THEN
                    v_used := v_used || jsonb_build_object(r.tenant_id::text,
                              COALESCE((v_used ->> r.tenant_id::text)::int, 0) - v_d);
                END IF;
                IF NOT (r.tenant_id = ANY (v_bad_tenants)) THEN
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
$$;
REVOKE ALL ON FUNCTION shield.trust(uuid, text[]) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------- lookup
-- Same checks as before; each row now also carries the Trust score.
DROP FUNCTION IF EXISTS public.shield_lookup(text[]);
CREATE FUNCTION public.shield_lookup(p_phones text[])
RETURNS TABLE (
    phone text, band text, score integer, confidence text, stores integer, outcomes integer,
    delivered integer, delivered_stores integer, bad jsonb, sequence text[],
    last_bad_orders_ago integer, trend text,
    trust integer, trust_new boolean, trust_steps jsonb
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

    RETURN QUERY
    SELECT c.phone, c.band, c.score, c.confidence, c.stores, c.outcomes, c.delivered, c.delivered_stores,
           c.bad, c.sequence, c.last_bad_orders_ago, c.trend,
           t.trust, t.trust_new, t.trust_steps
      FROM shield.compute(v_tenant, v_norms) c
      JOIN shield.trust(v_tenant, v_norms) t ON t.phone = c.phone;
END;
$$;
REVOKE ALL ON FUNCTION public.shield_lookup(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shield_lookup(text[]) TO authenticated;

-- ---------------------------------------------------------------- snapshot
-- Flagged now means a Trust score under 80 on a customer with a record.
CREATE OR REPLACE FUNCTION shield.record_of(p_tenant_id uuid, p_phone text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
    SELECT jsonb_build_object(
        'network_band', COALESCE(c.band, 'none'),
        'network_score', c.score,
        'own_tier', ct.trust_tier,
        'trust', t.trust,
        'trust_new', COALESCE(t.trust_new, true),
        'flagged', COALESCE(NOT t.trust_new AND t.trust < 80, false),
        'at', now())
      FROM (SELECT public.normalize_phone_for_search(p_phone) AS n) x
      LEFT JOIN LATERAL shield.compute(p_tenant_id, ARRAY[x.n]) c ON true
      LEFT JOIN LATERAL shield.trust(p_tenant_id, ARRAY[x.n]) t ON true
      LEFT JOIN public.customer_trust ct ON ct.tenant_id = p_tenant_id AND ct.phone = x.n;
$$;
REVOKE ALL ON FUNCTION shield.record_of(uuid, text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------- call first
DROP FUNCTION IF EXISTS public.shield_risky_open_orders(integer);
CREATE FUNCTION public.shield_risky_open_orders(p_limit integer DEFAULT 20)
RETURNS TABLE (id uuid, order_id text, customer_name text, status text, created_at timestamptz,
               own_tier text, network_band text, trust integer, worst_kind text, worst_src text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_tenant uuid := public.require_current_tenant();
BEGIN
    RETURN QUERY
    WITH open AS (
        SELECT o.id, o.order_id, o.customer_name, o.status::text AS status, o.created_at,
               public.normalize_phone_for_search(o.phone) AS n
          FROM public.orders o
         WHERE o.tenant_id = v_tenant
           AND o.deleted_at IS NULL
           AND NOT COALESCE(o.is_test, false)
           AND NOT COALESCE(o.is_return, false)
           AND o.status::text IN ('new', 'contacted', 'confirmed', 'suspended')
           AND o.created_at >= now() - interval '14 days'
    ), t AS (
        SELECT * FROM shield.trust(v_tenant, (SELECT array_agg(DISTINCT n) FROM open WHERE length(n) = 10))
    ), net AS (
        SELECT c.phone, c.band FROM shield.compute(v_tenant, (SELECT array_agg(DISTINCT n) FROM open)) c
    )
    SELECT o.id, o.order_id, o.customer_name, o.status, o.created_at, ct.trust_tier, COALESCE(net.band, 'none'),
           t.trust, w.kind, w.src
      FROM open o
      JOIN t ON t.phone = o.n
      LEFT JOIN net ON net.phone = o.n
      LEFT JOIN public.customer_trust ct ON ct.tenant_id = v_tenant AND ct.phone = o.n
      -- The step that cost the most points names the reason on the row.
      LEFT JOIN LATERAL (
          SELECT s ->> 'kind' AS kind, s ->> 'src' AS src
            FROM jsonb_array_elements(t.trust_steps) s
           WHERE (s ->> 'pts')::int < 0
           ORDER BY (s ->> 'pts')::int, (s ->> 'src') = 'own' DESC
           LIMIT 1
      ) w ON true
     WHERE NOT t.trust_new AND t.trust < 80
     ORDER BY t.trust, o.created_at
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
END;
$$;
REVOKE ALL ON FUNCTION public.shield_risky_open_orders(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shield_risky_open_orders(integer) TO authenticated;
