-- =============================================================================
-- Shield Trust: other stores count by their own delivered volume
-- =============================================================================
--
-- WHAT THIS PROVES (after 20261111193459_shield_trust_store_weight.sql)
--   * two brand-new stores (0 deliveries) refusing a phone again and again
--     cannot move its Trust at all: they do not open the "2+ other stores"
--     gate (was: 100 -> 0, red for every store on the network);
--   * one established store plus one new store still does not open the gate;
--   * established stores (400 and 40 delivered) both refusing once give
--     -35 (weight 1), -12 (weight 0.35) and the -10 pattern step: Trust 43;
--   * with the gate open, each new store is held to 13 points in total;
--   * the asking store's own refusals keep full weight and no cap.
--
-- NOT SAFE FOR PRODUCTION: inserts shield.events rows (all rolled back).
-- Run on a throwaway local Postgres that has the shield schema.
--
-- HOW TO RUN
--   psql -d <db> -v ON_ERROR_STOP=1 -f shield_trust_store_weight.sql
-- =============================================================================
BEGIN;

DO $$
DECLARE
    own  uuid := '00000000-0000-4000-8000-000000000001';
    p1   uuid := '00000000-0000-4000-8000-0000000000a1';
    p2   uuid := '00000000-0000-4000-8000-0000000000a2';
    big  uuid := '00000000-0000-4000-8000-0000000000b1';
    mid  uuid := '00000000-0000-4000-8000-0000000000b2';
    got  integer;
BEGIN
    -- Delivered history on unrelated phones: big 400, mid 40, puppets none.
    INSERT INTO shield.events (tenant_id, base_id, phone_key, outcome, category, occurred_at, updated_at)
    SELECT t, 'fill' || g, shield.phone_key('09' || lpad(g::text, 8, '0')), 'delivered', NULL,
           now() - interval '30 days', now() - interval '30 days'
      FROM (VALUES (big, 400), (mid, 40)) s(t, n), generate_series(1, s.n) g;

    -- Phone A: three refusals from each puppet.
    INSERT INTO shield.events
    SELECT s, 'a' || g, shield.phone_key('0770000001'), 'bad', 'refused',
           now() - g * interval '1 hour', now() - interval '3 days'
      FROM unnest(ARRAY[p1, p2]) s, generate_series(1, 3) g;
    SELECT trust INTO got FROM shield.trust(own, ARRAY['0770000001']);
    IF got <> 100 THEN RAISE EXCEPTION 'two new stores moved Trust to %, want 100', got; END IF;

    -- Phone B: big and mid refuse once each.
    INSERT INTO shield.events VALUES
        (big, 'b1', shield.phone_key('0770000002'), 'bad', 'refused', now() - interval '2 hours', now() - interval '3 days'),
        (mid, 'b2', shield.phone_key('0770000002'), 'bad', 'refused', now() - interval '1 hour', now() - interval '3 days');
    SELECT trust INTO got FROM shield.trust(own, ARRAY['0770000002']);
    IF got <> 43 THEN RAISE EXCEPTION 'established stores gave Trust %, want 43', got; END IF;

    -- Phone C: big plus one puppet.
    INSERT INTO shield.events VALUES
        (big, 'c1', shield.phone_key('0770000003'), 'bad', 'refused', now() - interval '2 hours', now() - interval '3 days'),
        (p1,  'c2', shield.phone_key('0770000003'), 'bad', 'refused', now() - interval '1 hour', now() - interval '3 days');
    SELECT trust INTO got FROM shield.trust(own, ARRAY['0770000003']);
    IF got <> 100 THEN RAISE EXCEPTION 'one established + one new store gave Trust %, want 100', got; END IF;

    -- Phone A again, gate opened by big (refused) and mid (delivered):
    -- big -35, each puppet at most 13, no pattern from puppets.
    INSERT INTO shield.events VALUES
        (big, 'a9', shield.phone_key('0770000001'), 'bad', 'refused', now() - interval '5 hours', now() - interval '3 days'),
        (mid, 'a8', shield.phone_key('0770000001'), 'delivered', NULL, now() - interval '6 hours', now() - interval '3 days');
    SELECT trust INTO got FROM shield.trust(own, ARRAY['0770000001']);
    IF got <> 39 THEN RAISE EXCEPTION 'capped puppets gave Trust %, want 39', got; END IF;

    -- Phone D: the asking store's own two refusals, full weight.
    INSERT INTO shield.events
    SELECT own, 'd' || g, shield.phone_key('0770000004'), 'bad', 'refused',
           now() - g * interval '1 hour', now()
      FROM generate_series(1, 2) g;
    SELECT trust INTO got FROM shield.trust(own, ARRAY['0770000004']);
    IF got <> 30 THEN RAISE EXCEPTION 'own refusals gave Trust %, want 30', got; END IF;

    RAISE NOTICE 'PASS shield_trust_store_weight';
END;
$$;

ROLLBACK;
