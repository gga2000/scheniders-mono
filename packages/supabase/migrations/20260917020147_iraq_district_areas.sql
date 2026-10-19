-- The area -> district gazetteer, now owned. The Al-Waseet layer is frozen, so
-- everything we learn from here on lands in our own tables.
CREATE TABLE IF NOT EXISTS iraq_district_areas (
    id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    district_id INT NOT NULL REFERENCES iraq_districts(id) ON DELETE CASCADE,
    area_ar     TEXT NOT NULL,
    area_key    TEXT GENERATED ALWAYS AS (waseet_strip_article(waseet_search_key(area_ar))) STORED,
    confidence  TEXT NOT NULL DEFAULT 'sourced' CHECK (confidence IN ('sourced','inferred')),
    source      TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (district_id, area_ar)
);

CREATE INDEX IF NOT EXISTS idx_iraq_district_areas_key ON iraq_district_areas(area_key);

ALTER TABLE iraq_district_areas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read on iraq_district_areas" ON iraq_district_areas;
CREATE POLICY "Public read on iraq_district_areas"
    ON iraq_district_areas FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Service role all on iraq_district_areas" ON iraq_district_areas;
CREATE POLICY "Service role all on iraq_district_areas"
    ON iraq_district_areas FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE INSERT, UPDATE, DELETE ON iraq_district_areas FROM anon, authenticated;

-- carry over everything already researched
INSERT INTO iraq_district_areas (district_id, area_ar, confidence, source)
SELECT d.id, g.area_ar, g.confidence, g.source
  FROM waseet_gazetteer g
  JOIN iraq_districts d
    ON d.governorate_code = g.governorate_code AND d.name_ar = g.parent_ar
ON CONFLICT (district_id, area_ar) DO NOTHING;

-- a manual assignment must still outrank the gazetteer here
ALTER TABLE iraq_locations
    ADD COLUMN IF NOT EXISTS district_is_manual BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION iraq_refresh_location_districts()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_placed INT;
BEGIN
    UPDATE iraq_locations SET district_id = NULL
     WHERE district_is_manual = false AND district_id IS NOT NULL;

    WITH m AS (
        SELECT DISTINCT ON (l.id) l.id, a.district_id
          FROM iraq_locations l
          JOIN iraq_district_areas a ON true
          JOIN iraq_districts d ON d.id = a.district_id
         WHERE l.district_is_manual = false
           AND d.governorate_code = l.governorate_code
           AND char_length(a.area_key) >= 3
           AND (waseet_strip_article(l.name_search) = a.area_key
             OR waseet_strip_article(l.name_search) LIKE a.area_key || ' %'
             OR waseet_strip_article(l.name_search) LIKE '% ' || a.area_key
             OR waseet_strip_article(l.name_search) LIKE '% ' || a.area_key || ' %'
             OR waseet_strip_article(l.name_search) ~
                ('(^|\s)' || regexp_replace(a.area_key, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') || '[0-9]'))
         -- the most specific area name wins
         ORDER BY l.id, char_length(a.area_key) DESC
    )
    UPDATE iraq_locations l SET district_id = m.district_id, updated_at = now()
      FROM m WHERE l.id = m.id;

    SELECT count(*)::INT INTO v_placed FROM iraq_locations WHERE district_id IS NOT NULL;
    RETURN v_placed;
END;
$$;

REVOKE EXECUTE ON FUNCTION iraq_refresh_location_districts() FROM PUBLIC, anon, authenticated;
