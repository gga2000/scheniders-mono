CREATE TABLE IF NOT EXISTS iraq_postal_codes (
    code             INT PRIMARY KEY,
    name_ar          TEXT NOT NULL,
    name_search      TEXT GENERATED ALWAYS AS (waseet_search_key(name_ar)) STORED,
    governorate_code TEXT NOT NULL,
    source           TEXT NOT NULL DEFAULT 'ar.wikipedia.org/wiki/قائمة_الرموز_البريدية_في_العراق',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_iraq_postal_codes_gov ON iraq_postal_codes(governorate_code);
CREATE INDEX IF NOT EXISTS idx_iraq_postal_codes_search ON iraq_postal_codes(name_search);

ALTER TABLE iraq_postal_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read on iraq_postal_codes" ON iraq_postal_codes;
CREATE POLICY "Public read on iraq_postal_codes"
    ON iraq_postal_codes FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Service role all on iraq_postal_codes" ON iraq_postal_codes;
CREATE POLICY "Service role all on iraq_postal_codes"
    ON iraq_postal_codes FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE INSERT, UPDATE, DELETE ON iraq_postal_codes FROM anon, authenticated;

COMMENT ON TABLE iraq_postal_codes IS
    'Official Iraqi postal codes (Wikipedia). Reference data, independent of Al-Waseet — used to attach an official code to a region and to measure catalogue coverage both ways.';

ALTER TABLE waseet_regions ADD COLUMN IF NOT EXISTS postal_code INT REFERENCES iraq_postal_codes(code);
ALTER TABLE waseet_districts ADD COLUMN IF NOT EXISTS postal_code INT REFERENCES iraq_postal_codes(code);

CREATE INDEX IF NOT EXISTS idx_waseet_regions_postal ON waseet_regions(postal_code)
    WHERE postal_code IS NOT NULL;

CREATE OR REPLACE FUNCTION waseet_refresh_postal_codes()
RETURNS TABLE (regions_matched INT, districts_matched INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    UPDATE waseet_regions  SET postal_code = NULL WHERE postal_code IS NOT NULL;
    UPDATE waseet_districts SET postal_code = NULL WHERE postal_code IS NOT NULL;

    WITH m AS (
        SELECT DISTINCT ON (r.id) r.id, p.code
          FROM waseet_regions r
          JOIN waseet_cities c ON c.id = r.city_id
          JOIN iraq_postal_codes p
            ON p.governorate_code = c.governorate_code
           AND p.name_search = COALESCE(r.name_search_split, r.name_search)
         ORDER BY r.id, p.code
    )
    UPDATE waseet_regions r SET postal_code = m.code FROM m WHERE r.id = m.id;

    WITH m AS (
        SELECT DISTINCT ON (d.id) d.id, p.code
          FROM waseet_districts d
          JOIN waseet_cities c ON c.id = d.city_id
          JOIN iraq_postal_codes p
            ON p.governorate_code = c.governorate_code
           AND p.name_search = d.name_search
         ORDER BY d.id, p.code
    )
    UPDATE waseet_districts d SET postal_code = m.code FROM m WHERE d.id = m.id;

    SELECT count(*)::INT INTO regions_matched FROM waseet_regions WHERE postal_code IS NOT NULL;
    SELECT count(*)::INT INTO districts_matched FROM waseet_districts WHERE postal_code IS NOT NULL;
    RETURN NEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION waseet_refresh_postal_codes() FROM PUBLIC, anon, authenticated;
