-- Two fixes.
--
-- 1. The "prefer the most common spelling" step took the most frequent RAW
--    Al-Waseet string, which for 14 rows was the run-together form —
--    undoing the un-glue. "الحريةدباش" came back and lost its الحرية district
--    with it. The split form is a repair, not a spelling variant, so it wins.
--
-- 2. An area whose name is a short word behind the definite article — الري
--    becomes "ري" — fell under the 3-character floor and matched nothing. The
--    floor is there to stop noise matches, so it should measure the name
--    BEFORE the article is stripped.

UPDATE iraq_locations l
   SET name_ar = s.split_name, updated_at = now()
  FROM (
    SELECT cr.location_id, max(r.name_display) AS split_name
      FROM iraq_location_carrier_refs cr
      JOIN waseet_regions r ON r.id::TEXT = cr.external_id
     WHERE cr.carrier = 'al_waseet'
       AND r.name_display IS NOT NULL
       AND r.canonical_id = r.id
     GROUP BY cr.location_id
  ) s
 WHERE l.id = s.location_id
   AND l.name_ar <> s.split_name
   AND NOT EXISTS (
        SELECT 1 FROM iraq_locations o
         WHERE o.governorate_code = l.governorate_code
           AND o.id <> l.id AND o.name_ar = s.split_name);

-- the glued form stays searchable
INSERT INTO iraq_location_aliases (location_id, alias_ar, source)
SELECT cr.location_id, r.name_clean, 'al_waseet'
  FROM iraq_location_carrier_refs cr
  JOIN waseet_regions r ON r.id::TEXT = cr.external_id
 WHERE cr.carrier = 'al_waseet' AND r.name_display IS NOT NULL
ON CONFLICT (location_id, alias_ar) DO NOTHING;

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
           -- measured before the article is stripped, so "الري" qualifies
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

SELECT iraq_refresh_location_districts();;
