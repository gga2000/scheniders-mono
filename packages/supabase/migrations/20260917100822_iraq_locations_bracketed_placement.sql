-- A third, weaker form of catalogue-order evidence: a row sitting BETWEEN two
-- entries of the same district, within three ids either side. Measured against
-- the 235 Baghdad rows whose district is already known: 84.7% accurate — good
-- enough to be useful, not good enough to pass as fact.
--
-- It gets its own provenance value rather than borrowing 'adjacency' (90.5%),
-- so the two can be told apart and filtered separately, and every row it
-- places is flagged for review with the accuracy stated.
ALTER TABLE iraq_locations DROP CONSTRAINT IF EXISTS iraq_locations_district_source_check;
ALTER TABLE iraq_locations
    ADD CONSTRAINT iraq_locations_district_source_check
    CHECK (district_source IN ('gazetteer','adjacency','bracketed','manual'));

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

WITH b AS (
    SELECT l.id, l.governorate_code, l.district_id, cr.external_id::INT AS wid
      FROM iraq_locations l
      JOIN iraq_location_carrier_refs cr
        ON cr.location_id = l.id AND cr.carrier = 'al_waseet' AND cr.is_preferred
     WHERE l.is_active
),
bracket AS (
    SELECT t.id,
      (SELECT p.district_id FROM b p
        WHERE p.governorate_code = t.governorate_code AND p.district_id IS NOT NULL
          AND p.wid < t.wid ORDER BY p.wid DESC LIMIT 1) AS before_d,
      (SELECT p.wid FROM b p
        WHERE p.governorate_code = t.governorate_code AND p.district_id IS NOT NULL
          AND p.wid < t.wid ORDER BY p.wid DESC LIMIT 1) AS before_w,
      (SELECT n.district_id FROM b n
        WHERE n.governorate_code = t.governorate_code AND n.district_id IS NOT NULL
          AND n.wid > t.wid ORDER BY n.wid ASC LIMIT 1) AS after_d,
      (SELECT n.wid FROM b n
        WHERE n.governorate_code = t.governorate_code AND n.district_id IS NOT NULL
          AND n.wid > t.wid ORDER BY n.wid ASC LIMIT 1) AS after_w
      FROM b t WHERE t.district_id IS NULL
)
UPDATE iraq_locations l
   SET district_id     = br.before_d,
       district_source = 'bracketed',
       review_status   = 'needs_review',
       review_reason   = 'Placed by catalogue position — it sits between two entries of this district. That rule measured 84.7% accurate, so confirm before relying on it.',
       updated_at      = now()
  FROM bracket br
 WHERE l.id = br.id
   AND br.before_d = br.after_d
   AND (br.after_w - br.before_w) <= 3;
