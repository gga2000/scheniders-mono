-- Security audit: shield.trust gave every other store full weight, so two
-- brand-new stores (no deliveries) could report a phone as refused and take a
-- customer's Trust from 100 to red across the whole network. shield.compute
-- already weighs each store by its own delivered volume; Trust now does too.
--
--   * Another store's step (penalty, its 50-point cap, and a delivery bonus)
--     is scaled by that store's weight: 0.25 + delivered/400, capped at 1.
--     A store with no deliveries can move Trust by at most 13 points.
--   * Only established stores (40+ delivered parcels) open the "seen in 2+
--     other stores" gate and count toward the cross-store pattern step.
--   * The asking store's own history is unchanged (full weight, no cap).
--
-- Measured before applying: the network holds one store today, so no score
-- shown to any merchant changes.

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
BEGIN
    FOR v_norm IN SELECT DISTINCT n FROM unnest(p_norms) n WHERE length(n) = 10 LOOP
        v_key := shield.phone_key(v_norm);

        -- Each other store's own delivered volume, read once per phone. Only
        -- stores with a real delivery record (40+) corroborate a phone.
        SELECT COALESCE(jsonb_object_agg(t.tenant_id::text, t.delivered), '{}'::jsonb),
               count(*) FILTER (WHERE t.delivered >= 40)
          INTO v_delivered, v_others
          FROM (SELECT o.tenant_id,
                       (SELECT count(*) FROM shield.events d
                         WHERE d.tenant_id = o.tenant_id AND d.outcome = 'delivered') AS delivered
                  FROM (SELECT DISTINCT e.tenant_id FROM shield.events e
                         WHERE e.phone_key = v_key AND e.tenant_id <> p_tenant_id) o) t;

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
                                           AND h.status <> 'released')))
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
