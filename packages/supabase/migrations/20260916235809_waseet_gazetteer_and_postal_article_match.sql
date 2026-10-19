CREATE TABLE IF NOT EXISTS waseet_gazetteer (
    id               INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    governorate_code TEXT NOT NULL,
    area_ar          TEXT NOT NULL,
    area_search      TEXT GENERATED ALWAYS AS (waseet_search_key(area_ar)) STORED,
    parent_ar        TEXT NOT NULL,
    parent_kind      TEXT NOT NULL CHECK (parent_kind IN ('municipality','qadha','nahiya')),
    confidence       TEXT NOT NULL DEFAULT 'sourced' CHECK (confidence IN ('sourced','inferred')),
    source           TEXT NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (governorate_code, area_ar)
);

CREATE INDEX IF NOT EXISTS idx_waseet_gazetteer_search
    ON waseet_gazetteer(governorate_code, area_search);

ALTER TABLE waseet_gazetteer ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read on waseet_gazetteer" ON waseet_gazetteer;
CREATE POLICY "Public read on waseet_gazetteer"
    ON waseet_gazetteer FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Service role all on waseet_gazetteer" ON waseet_gazetteer;
CREATE POLICY "Service role all on waseet_gazetteer"
    ON waseet_gazetteer FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE INSERT, UPDATE, DELETE ON waseet_gazetteer FROM anon, authenticated;

COMMENT ON TABLE waseet_gazetteer IS
    'Curated area -> administrative parent mapping. Every row cites a source; nothing here is inferred from the Al-Waseet strings. This is the level the catalogue itself does not encode.';

ALTER TABLE waseet_regions ADD COLUMN IF NOT EXISTS municipality_ar TEXT;
CREATE INDEX IF NOT EXISTS idx_waseet_regions_municipality
    ON waseet_regions(city_id, municipality_ar) WHERE municipality_ar IS NOT NULL;

-- Matches a gazetteer area anywhere in the region name, as a whole token run.
CREATE OR REPLACE FUNCTION waseet_refresh_municipalities()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_matched INT;
BEGIN
    UPDATE waseet_regions SET municipality_ar = NULL WHERE municipality_ar IS NOT NULL;

    WITH m AS (
        SELECT DISTINCT ON (r.id) r.id, g.parent_ar
          FROM waseet_regions r
          JOIN waseet_cities c ON c.id = r.city_id
          JOIN waseet_gazetteer g ON g.governorate_code = c.governorate_code
         WHERE COALESCE(r.name_search_split, r.name_search) = g.area_search
            OR COALESCE(r.name_search_split, r.name_search) LIKE g.area_search || ' %'
            OR COALESCE(r.name_search_split, r.name_search) LIKE '% ' || g.area_search
            OR COALESCE(r.name_search_split, r.name_search) LIKE '% ' || g.area_search || ' %'
         -- the longest area name wins, so "مدينة الصدر" beats a bare "الصدر"
         ORDER BY r.id, char_length(g.area_search) DESC
    )
    UPDATE waseet_regions r SET municipality_ar = m.parent_ar FROM m WHERE r.id = m.id;

    SELECT count(*)::INT INTO v_matched FROM waseet_regions WHERE municipality_ar IS NOT NULL;
    RETURN v_matched;
END;
$$;

REVOKE EXECUTE ON FUNCTION waseet_refresh_municipalities() FROM PUBLIC, anon, authenticated;

-- Postal matching ignores the definite article: the official list writes
-- "الدجيل" where the catalogue writes "دجيل", and they are one place.
CREATE OR REPLACE FUNCTION waseet_refresh_postal_codes()
RETURNS TABLE (regions_matched INT, districts_matched INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    UPDATE waseet_regions   SET postal_code = NULL WHERE postal_code IS NOT NULL;
    UPDATE waseet_districts SET postal_code = NULL WHERE postal_code IS NOT NULL;

    WITH m AS (
        SELECT DISTINCT ON (r.id) r.id, p.code
          FROM waseet_regions r
          JOIN waseet_cities c ON c.id = r.city_id
          JOIN iraq_postal_codes p
            ON p.governorate_code = c.governorate_code
           AND regexp_replace(p.name_search, '(^|\s)ال', '\1', 'g')
             = regexp_replace(COALESCE(r.name_search_split, r.name_search), '(^|\s)ال', '\1', 'g')
         ORDER BY r.id, p.code
    )
    UPDATE waseet_regions r SET postal_code = m.code FROM m WHERE r.id = m.id;

    WITH m AS (
        SELECT DISTINCT ON (d.id) d.id, p.code
          FROM waseet_districts d
          JOIN waseet_cities c ON c.id = d.city_id
          JOIN iraq_postal_codes p
            ON p.governorate_code = c.governorate_code
           AND regexp_replace(p.name_search, '(^|\s)ال', '\1', 'g')
             = regexp_replace(d.name_search, '(^|\s)ال', '\1', 'g')
         ORDER BY d.id, p.code
    )
    UPDATE waseet_districts d SET postal_code = m.code FROM m WHERE d.id = m.id;

    SELECT count(*)::INT INTO regions_matched  FROM waseet_regions   WHERE postal_code IS NOT NULL;
    SELECT count(*)::INT INTO districts_matched FROM waseet_districts WHERE postal_code IS NOT NULL;
    RETURN NEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION waseet_refresh_postal_codes() FROM PUBLIC, anon, authenticated;
