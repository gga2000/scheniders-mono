-- The matcher was a cross join: every location against every area, with four
-- LIKE patterns each. At 5,865 locations and 931 areas that is 5.5M pattern
-- matches, and once the national qadha gazetteer landed it exceeded the
-- statement timeout and stopped running at all.
--
-- Same fix as the address resolver: generate the candidate phrases from the
-- LOCATION NAME and look the area side up by indexed equality, so the work is
-- proportional to the words in a name rather than to the size of the gazetteer.
CREATE INDEX IF NOT EXISTS idx_iraq_district_areas_key_lookup
    ON iraq_district_areas(area_key);

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
     WHERE district_is_manual = false
       AND district_source = 'gazetteer'
       AND district_id IS NOT NULL;

    WITH target AS (
        SELECT l.id, l.governorate_code,
               string_to_array(waseet_strip_article(l.name_search), ' ') AS toks
          FROM iraq_locations l
         WHERE l.district_is_manual = false
           AND l.district_source = 'gazetteer'
           AND l.is_active
    ),
    phrase AS (
        -- every run of 1-5 consecutive words in the name
        SELECT t.id, t.governorate_code,
               array_to_string(t.toks[i:j], ' ') AS p
          FROM target t,
               LATERAL generate_series(1, COALESCE(array_length(t.toks, 1), 0)) AS i,
               LATERAL generate_series(i, LEAST(i + 4, COALESCE(array_length(t.toks, 1), 0))) AS j
    ),
    hit AS (
        SELECT ph.id, a.district_id, char_length(ph.p) AS len
          FROM phrase ph
          JOIN iraq_district_areas a ON a.area_key = ph.p
          JOIN iraq_districts d ON d.id = a.district_id
         WHERE d.governorate_code = ph.governorate_code
           AND char_length(ph.p) >= 2
           AND char_length(waseet_search_key(a.area_ar)) >= 3
    ),
    best AS (
        SELECT DISTINCT ON (id) id, district_id
          FROM hit ORDER BY id, len DESC, district_id
    )
    UPDATE iraq_locations l
       SET district_id = best.district_id, updated_at = now()
      FROM best WHERE l.id = best.id;

    SELECT count(*)::INT INTO v_placed FROM iraq_locations WHERE district_id IS NOT NULL;
    RETURN v_placed;
END;
$$;

REVOKE EXECUTE ON FUNCTION iraq_refresh_location_districts() FROM PUBLIC, anon, authenticated;;
