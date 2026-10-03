-- Al-Waseet entered their catalogue in geographic order, so a row's id
-- neighbours are evidence about where it is. Measured against the 477 Baghdad
-- rows whose district is already known:
--   * majority of neighbours  -> 59.7% accurate. Rejected: a 40% error rate
--     would put wrong civic geography into the database.
--   * ALL neighbours agree (3+) -> 90.5% accurate. Used, and recorded as
--     'adjacency' so it is never mistaken for a sourced fact.
ALTER TABLE iraq_locations
    ADD COLUMN IF NOT EXISTS district_source TEXT NOT NULL DEFAULT 'gazetteer'
    CHECK (district_source IN ('gazetteer','adjacency','manual'));

-- the refresh recomputes gazetteer matches only; other provenance survives
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

    WITH m AS (
        SELECT DISTINCT ON (l.id) l.id, a.district_id
          FROM iraq_locations l
          JOIN iraq_district_areas a ON true
          JOIN iraq_districts d ON d.id = a.district_id
         WHERE l.district_is_manual = false
           AND l.district_source = 'gazetteer'
           AND d.governorate_code = l.governorate_code
           AND char_length(waseet_search_key(a.area_ar)) >= 3
           AND char_length(a.area_key) >= 2
           AND (waseet_strip_article(l.name_search) = a.area_key
             OR waseet_strip_article(l.name_search) LIKE a.area_key || ' %'
             OR waseet_strip_article(l.name_search) LIKE '% ' || a.area_key
             OR waseet_strip_article(l.name_search) LIKE '% ' || a.area_key || ' %'
             OR waseet_strip_article(l.name_search) ~
                ('(^|\s)' || regexp_replace(a.area_key, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') || '[0-9]'))
         ORDER BY l.id, char_length(a.area_key) DESC
    )
    UPDATE iraq_locations l SET district_id = m.district_id, updated_at = now()
      FROM m WHERE l.id = m.id;

    SELECT count(*)::INT INTO v_placed FROM iraq_locations WHERE district_id IS NOT NULL;
    RETURN v_placed;
END;
$$;

REVOKE EXECUTE ON FUNCTION iraq_refresh_location_districts() FROM PUBLIC, anon, authenticated;

-- apply it, scoped within one governorate
WITH b AS (
    SELECT l.id, l.governorate_code, l.district_id, cr.external_id::INT AS wid
      FROM iraq_locations l
      JOIN iraq_location_carrier_refs cr
        ON cr.location_id = l.id AND cr.carrier = 'al_waseet' AND cr.is_preferred
),
nb AS (
    SELECT t.id,
           count(DISTINCT n.district_id) AS distinct_districts,
           min(n.district_id)            AS only_district,
           count(*)                      AS neighbours
      FROM b t
      JOIN b n
        ON n.governorate_code = t.governorate_code
       AND n.id <> t.id
       AND n.district_id IS NOT NULL
       AND abs(n.wid - t.wid) <= 5
     WHERE t.district_id IS NULL
     GROUP BY t.id
)
UPDATE iraq_locations l
   SET district_id     = nb.only_district,
       district_source = 'adjacency',
       updated_at      = now()
  FROM nb
 WHERE l.id = nb.id
   AND nb.distinct_districts = 1
   AND nb.neighbours >= 3;
