CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS waseet_cities (
    id                INT PRIMARY KEY,
    name_ar           TEXT NOT NULL,
    governorate_code  TEXT,
    is_active         BOOLEAN NOT NULL DEFAULT true,
    synced_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_waseet_cities_governorate_code
    ON waseet_cities(governorate_code);

CREATE TABLE IF NOT EXISTS waseet_regions (
    id          INT PRIMARY KEY,
    city_id     INT NOT NULL REFERENCES waseet_cities(id) ON DELETE CASCADE,
    name_ar     TEXT NOT NULL,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    synced_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_waseet_regions_city_id ON waseet_regions(city_id);

CREATE INDEX IF NOT EXISTS idx_waseet_regions_name_trgm
    ON waseet_regions USING gin (name_ar extensions.gin_trgm_ops);

ALTER TABLE waseet_cities  ENABLE ROW LEVEL SECURITY;
ALTER TABLE waseet_regions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read on waseet_cities" ON waseet_cities;
CREATE POLICY "Public read on waseet_cities"
    ON waseet_cities FOR SELECT
    TO anon, authenticated
    USING (is_active);

DROP POLICY IF EXISTS "Service role all on waseet_cities" ON waseet_cities;
CREATE POLICY "Service role all on waseet_cities"
    ON waseet_cities FOR ALL
    TO service_role
    USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public read on waseet_regions" ON waseet_regions;
CREATE POLICY "Public read on waseet_regions"
    ON waseet_regions FOR SELECT
    TO anon, authenticated
    USING (is_active);

DROP POLICY IF EXISTS "Service role all on waseet_regions" ON waseet_regions;
CREATE POLICY "Service role all on waseet_regions"
    ON waseet_regions FOR ALL
    TO service_role
    USING (true) WITH CHECK (true);

REVOKE INSERT, UPDATE, DELETE ON waseet_cities  FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON waseet_regions FROM anon, authenticated;

COMMENT ON TABLE waseet_cities  IS 'Al-Waseet delivery cities (mirrored from GET /citys). Global reference data.';
COMMENT ON TABLE waseet_regions IS 'Al-Waseet delivery regions (mirrored from GET /regions?city_id=). Global reference data; id is required to create an Al-Waseet order.';;
