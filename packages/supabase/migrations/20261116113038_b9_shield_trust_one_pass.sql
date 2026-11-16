-- Fermi B9 (slow database queries), part 2b: Shield scores every customer of a
-- store in one pass.
--
-- The orders page's danger level (public.shield_customer_trust) took ~340 ms a
-- call on the biggest store: shield.trust ran two queries per phone (1,454
-- phones there), and every phone's key read and decrypted the pepper again.
-- Same scores, same steps, now:
--   * shield.phone_keys hashes a list of phones with the pepper read once.
--     shield.phone_key is that function for one phone, so the HMAC lives in
--     one place.
--   * shield.trust reads every phone's counted events in one query, ordered
--     per phone as before (occurred_at, base_id), and walks them in one loop.
--     Each other store's delivered volume is counted once, not once per phone.
--     The scoring inside the loop is the old code, line for line.
--   * shield_customer_trust hashes the store's phones once instead of inside
--     the per-phone lookup, and reads the store's phones from a new index
--     alone: normalising 5,000 phones again on every call cost ~50 ms.
-- When two events of one phone share occurred_at and base_id, their order was
-- left to chance; it now falls back to the store id.
-- Checked on live before applying (rolled back): for every store with orders,
-- the demo store and the test shop, over all 4,800+ phones, the new
-- shield.trust gave the same 15,420 rows (score, new flag, every step) and
-- shield_customer_trust the same 1,308 rows as the old code.
-- Live has no store with 40+ deliveries holding another store's phones yet,
-- so tests/behaviour/shield-trust checks the network rules (the 2-store gate,
-- caps, the pattern step, holds, the demo store, the burst guard, a missing
-- pepper) against the old code, kept there verbatim.

-- 1. Keys ------------------------------------------------------------------------
CREATE FUNCTION shield.phone_keys(p_norms text[])
RETURNS TABLE(norm text, key bytea)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
    -- A missing pepper gives a NULL key, as shield.phone_key always did.
    SELECT n.norm, extensions.hmac(n.norm, s.decrypted_secret, 'sha256')
      FROM unnest(p_norms) AS n(norm)
      LEFT JOIN (SELECT v.decrypted_secret FROM vault.decrypted_secrets v
                  WHERE v.name = 'shield_phone_pepper') s ON true;
$function$;

REVOKE ALL ON FUNCTION shield.phone_keys(text[]) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION shield.phone_key(p_norm text)
RETURNS bytea
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
    SELECT k.key FROM shield.phone_keys(ARRAY[p_norm]) k;
$function$;

-- 2. Trust -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION shield.trust(p_tenant_id uuid, p_norms text[])
RETURNS TABLE(phone text, trust integer, trust_new boolean, trust_steps jsonb)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    r record;
    v_norm text;
    v_pts integer;
    v_d integer;
    v_cap integer;
    v_w numeric;
    v_used jsonb;
    v_bad_tenants uuid[];
    v_pattern boolean;
    v_steps jsonb;
    -- The demo store reads only its own records (B13).
    v_demo boolean := public.tenant_is_demo(p_tenant_id);
BEGIN
    FOR r IN
        WITH k AS (
            SELECT pk.norm, pk.key
              FROM shield.phone_keys(ARRAY(SELECT DISTINCT n FROM unnest(p_norms) n
                                            WHERE length(n) = 10)) pk
        ), other_store AS (
            -- The other stores holding each phone. The demo store is never
            -- one of them, and the demo store asking sees none.
            SELECT DISTINCT k.key, e.tenant_id
              FROM k
              JOIN shield.events e ON e.phone_key = k.key
             WHERE e.tenant_id <> p_tenant_id
               AND NOT v_demo
               AND NOT EXISTS (SELECT 1 FROM public.tenants dt
                                WHERE dt.id = e.tenant_id AND dt.is_demo)
        ), volume AS (
            -- Each of those stores' own delivered volume, counted once.
            SELECT s.tenant_id,
                   (SELECT count(*) FROM shield.events d
                     WHERE d.tenant_id = s.tenant_id AND d.outcome = 'delivered') AS delivered
              FROM (SELECT DISTINCT o.tenant_id FROM other_store o) s
        ), gate AS (
            -- Only stores with a real delivery record (40+) corroborate a phone.
            SELECT o.key, count(*) FILTER (WHERE v.delivered >= 40) AS others
              FROM other_store o
              JOIN volume v ON v.tenant_id = o.tenant_id
             GROUP BY o.key
        )
        SELECT k.norm, ev.tenant_id, ev.outcome, ev.category, ev.own,
               COALESCE(v.delivered, 0) AS delivered
          FROM k
          LEFT JOIN gate g ON g.key = k.key
          LEFT JOIN LATERAL (
              SELECT e.tenant_id, e.outcome, e.category, e.tenant_id = p_tenant_id AS own,
                     e.occurred_at, e.base_id
                FROM shield.events e
               WHERE e.phone_key = k.key
                 AND (e.tenant_id = p_tenant_id
                      OR (COALESCE(g.others, 0) >= 2
                          AND NOT EXISTS (SELECT 1 FROM shield.holds h
                                           WHERE h.tenant_id = e.tenant_id
                                             AND h.day = (e.updated_at AT TIME ZONE 'Asia/Baghdad')::date
                                             AND h.status <> 'released')
                          AND NOT EXISTS (SELECT 1 FROM public.tenants dt
                                           WHERE dt.id = e.tenant_id AND dt.is_demo)))
          ) ev ON true
          LEFT JOIN volume v ON v.tenant_id = ev.tenant_id
         ORDER BY k.norm, ev.occurred_at, ev.base_id, ev.tenant_id
    LOOP
        IF v_norm IS DISTINCT FROM r.norm THEN
            IF v_norm IS NOT NULL THEN
                phone := v_norm;
                trust := v_pts;
                trust_new := jsonb_array_length(v_steps) = 0;
                trust_steps := v_steps;
                RETURN NEXT;
            END IF;
            v_norm := r.norm;
            v_pts := 100;
            v_used := '{}'::jsonb;
            v_bad_tenants := '{}'::uuid[];
            v_pattern := false;
            v_steps := '[]'::jsonb;
        END IF;
        -- A phone with no counted event: a new customer at 100.
        CONTINUE WHEN r.tenant_id IS NULL;

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

    IF v_norm IS NOT NULL THEN
        phone := v_norm;
        trust := v_pts;
        trust_new := jsonb_array_length(v_steps) = 0;
        trust_steps := v_steps;
        RETURN NEXT;
    END IF;
END;
$function$;

-- 3. The orders page's list ----------------------------------------------------------
-- The store's live phones, already normalised, straight from the index (phone
-- is included so Postgres may skip the table).
CREATE INDEX IF NOT EXISTS idx_orders_tenant_live_phone_norm
    ON public.orders (tenant_id, public.normalize_phone_for_search(phone))
    INCLUDE (phone, created_at, is_test)
 WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.shield_customer_trust()
RETURNS TABLE(phone text, trust integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_tenant uuid := public.require_current_tenant();
BEGIN
    RETURN QUERY
    WITH ph AS (
        SELECT public.normalize_phone_for_search(o.phone) AS n, min(o.created_at) AS first_at
          FROM public.orders o
         WHERE o.tenant_id = v_tenant AND o.deleted_at IS NULL AND NOT COALESCE(o.is_test, false)
         GROUP BY 1
    ), burst AS (
        SELECT count(*) > 500 AS on FROM ph WHERE ph.first_at > now() - interval '1 hour'
    ), cand AS (
        SELECT ph.n
          FROM ph, burst
         WHERE length(ph.n) = 10
           AND NOT (burst.on AND ph.first_at > now() - interval '1 hour')
    ), risky AS (
        SELECT array_agg(k.norm) AS a
          FROM shield.phone_keys(ARRAY(SELECT cand.n FROM cand)) k
         WHERE EXISTS (SELECT 1 FROM shield.events e
                        WHERE e.phone_key = k.key
                          AND e.outcome <> 'delivered')
    )
    SELECT t.phone, t.trust
      FROM shield.trust(v_tenant, (SELECT risky.a FROM risky)) t
     WHERE NOT t.trust_new AND t.trust < 80;
END;
$function$;