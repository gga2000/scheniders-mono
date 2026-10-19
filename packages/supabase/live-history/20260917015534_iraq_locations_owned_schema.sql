-- =============================================================
-- Our own Iraq locations database.
--
-- Everything so far has been shaped as Al-Waseet's catalogue: their ids, their
-- duplicates, their spelling. This is the copy we own. Al-Waseet becomes one
-- SOURCE we seeded from, recorded in iraq_location_carrier_refs, instead of
-- being the schema.
--
-- Two decisions shape it:
--   * FROZEN. Seeded once, then authoritative. The importer stays so a fresh
--     Al-Waseet snapshot can be reviewed and merged deliberately, but nothing
--     upstream silently rewrites our rows.
--   * ONE ROW PER PLACE. The 422 duplicate rows and 28 test rows do not come
--     across as locations. Every Al-Waseet id still resolves, through the
--     carrier-ref table, so nothing is lost.
-- =============================================================

-- 1. Governorates. The 3-letter codes the orders table already uses.
CREATE TABLE IF NOT EXISTS iraq_governorates (
    code          TEXT PRIMARY KEY,
    name_ar       TEXT NOT NULL,
    name_en       TEXT NOT NULL,
    postal_prefix INT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Districts: one table for both real administrative parents (qadha,
--    municipality) and the clusters derived from naming patterns. `kind` and
--    `source` keep them honest and separable.
CREATE TABLE IF NOT EXISTS iraq_districts (
    id               INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    governorate_code TEXT NOT NULL REFERENCES iraq_governorates(code) ON DELETE CASCADE,
    name_ar          TEXT NOT NULL,
    name_search      TEXT GENERATED ALWAYS AS (waseet_search_key(name_ar)) STORED,
    kind             TEXT NOT NULL CHECK (kind IN ('qadha','municipality','area_cluster')),
    confidence       TEXT NOT NULL DEFAULT 'sourced' CHECK (confidence IN ('sourced','inferred')),
    source           TEXT NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (governorate_code, name_ar)
);

CREATE INDEX IF NOT EXISTS idx_iraq_districts_gov ON iraq_districts(governorate_code);
CREATE INDEX IF NOT EXISTS idx_iraq_districts_search ON iraq_districts(governorate_code, name_search);

-- 3. Locations: one row per real place.
CREATE TABLE IF NOT EXISTS iraq_locations (
    id               INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    governorate_code TEXT NOT NULL REFERENCES iraq_governorates(code) ON DELETE CASCADE,
    district_id      INT REFERENCES iraq_districts(id) ON DELETE SET NULL,
    name_ar          TEXT NOT NULL,
    name_search      TEXT GENERATED ALWAYS AS (waseet_search_key(name_ar)) STORED,
    name_key         TEXT GENERATED ALWAYS AS (waseet_dedupe_key(waseet_search_key(name_ar))) STORED,
    place_kind       TEXT NOT NULL DEFAULT 'area',
    postal_code      INT REFERENCES iraq_postal_codes(code) ON DELETE SET NULL,
    -- deliverability is a fact about the real world, set by hand when someone
    -- discovers a courier will not go there; never inferred
    is_serviceable   BOOLEAN NOT NULL DEFAULT true,
    service_note     TEXT,
    review_status    TEXT NOT NULL DEFAULT 'ok'
                     CHECK (review_status IN ('ok','needs_review','rejected')),
    review_reason    TEXT,
    is_active        BOOLEAN NOT NULL DEFAULT true,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_iraq_locations_gov ON iraq_locations(governorate_code);
CREATE INDEX IF NOT EXISTS idx_iraq_locations_district ON iraq_locations(district_id);
CREATE INDEX IF NOT EXISTS idx_iraq_locations_search ON iraq_locations(governorate_code, name_search);
CREATE INDEX IF NOT EXISTS idx_iraq_locations_key ON iraq_locations(governorate_code, name_key);
CREATE INDEX IF NOT EXISTS idx_iraq_locations_review ON iraq_locations(review_status)
    WHERE review_status <> 'ok';
CREATE INDEX IF NOT EXISTS idx_iraq_locations_trgm
    ON iraq_locations USING gin (name_search extensions.gin_trgm_ops);

-- 4. Aliases: every other way a place is written. This is what makes a free
--    text address resolvable, and it is where the collapsed duplicates go.
CREATE TABLE IF NOT EXISTS iraq_location_aliases (
    id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    location_id INT NOT NULL REFERENCES iraq_locations(id) ON DELETE CASCADE,
    alias_ar    TEXT NOT NULL,
    alias_search TEXT GENERATED ALWAYS AS (waseet_search_key(alias_ar)) STORED,
    source      TEXT NOT NULL CHECK (source IN ('al_waseet','duplicate','postal','wikipedia','manual','learned')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (location_id, alias_ar)
);

CREATE INDEX IF NOT EXISTS idx_iraq_aliases_search ON iraq_location_aliases(alias_search);
CREATE INDEX IF NOT EXISTS idx_iraq_aliases_location ON iraq_location_aliases(location_id);
CREATE INDEX IF NOT EXISTS idx_iraq_aliases_trgm
    ON iraq_location_aliases USING gin (alias_search extensions.gin_trgm_ops);

-- 5. Carrier references: how an outside system names this place. Every one of
--    Al-Waseet's 6,311 ids lands here, duplicates included, so a historical
--    order or a future submission still resolves.
CREATE TABLE IF NOT EXISTS iraq_location_carrier_refs (
    carrier       TEXT NOT NULL,
    external_id   TEXT NOT NULL,
    location_id   INT NOT NULL REFERENCES iraq_locations(id) ON DELETE CASCADE,
    external_name TEXT,
    is_preferred  BOOLEAN NOT NULL DEFAULT false,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (carrier, external_id)
);

CREATE INDEX IF NOT EXISTS idx_iraq_carrier_refs_location
    ON iraq_location_carrier_refs(location_id);
-- exactly one preferred external id per (location, carrier)
CREATE UNIQUE INDEX IF NOT EXISTS idx_iraq_carrier_refs_preferred
    ON iraq_location_carrier_refs(carrier, location_id) WHERE is_preferred;

-- 6. Pairs a person still has to judge.
CREATE TABLE IF NOT EXISTS iraq_location_reviews (
    a_location_id INT NOT NULL REFERENCES iraq_locations(id) ON DELETE CASCADE,
    b_location_id INT NOT NULL REFERENCES iraq_locations(id) ON DELETE CASCADE,
    reason        TEXT NOT NULL,
    similarity    REAL,
    resolved      BOOLEAN NOT NULL DEFAULT false,
    resolution    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (a_location_id, b_location_id),
    CHECK (a_location_id < b_location_id)
);

-- RLS: reference data, readable by the app, written only by the service role.
ALTER TABLE iraq_governorates           ENABLE ROW LEVEL SECURITY;
ALTER TABLE iraq_districts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE iraq_locations              ENABLE ROW LEVEL SECURITY;
ALTER TABLE iraq_location_aliases       ENABLE ROW LEVEL SECURITY;
ALTER TABLE iraq_location_carrier_refs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE iraq_location_reviews       ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['iraq_governorates','iraq_districts','iraq_locations',
                             'iraq_location_aliases','iraq_location_carrier_refs'] LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Public read on %1$s" ON %1$I', t);
        EXECUTE format('CREATE POLICY "Public read on %1$s" ON %1$I FOR SELECT TO anon, authenticated USING (true)', t);
        EXECUTE format('DROP POLICY IF EXISTS "Service role all on %1$s" ON %1$I', t);
        EXECUTE format('CREATE POLICY "Service role all on %1$s" ON %1$I FOR ALL TO service_role USING (true) WITH CHECK (true)', t);
        EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON %I FROM anon, authenticated', t);
    END LOOP;
END $$;

-- The review queue is internal, not part of the public catalogue.
DROP POLICY IF EXISTS "Authenticated read on iraq_location_reviews" ON iraq_location_reviews;
CREATE POLICY "Authenticated read on iraq_location_reviews"
    ON iraq_location_reviews FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Service role all on iraq_location_reviews" ON iraq_location_reviews;
CREATE POLICY "Service role all on iraq_location_reviews"
    ON iraq_location_reviews FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE INSERT, UPDATE, DELETE ON iraq_location_reviews FROM anon, authenticated;
REVOKE SELECT ON iraq_location_reviews FROM anon;

COMMENT ON TABLE iraq_locations IS
    'Our Iraq locations database: one row per real place. Seeded from the Al-Waseet catalogue and frozen; Al-Waseet ids live in iraq_location_carrier_refs, not here.';
COMMENT ON TABLE iraq_location_aliases IS
    'Every other spelling of a place, including the ones that were duplicate rows upstream. This is what lets a free-text address be resolved to a location.';;
