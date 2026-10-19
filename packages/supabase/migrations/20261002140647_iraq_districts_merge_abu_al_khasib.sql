-- "ابو الخصيب" (derived area_cluster, 25 locations) and "أبي الخصيب" (sourced qadha, 11) are one
-- place: Abu al-Khasib, a qadha of Basra. The identity key did not catch the pair because the
-- spellings differ by a real letter (و vs ي), not by hamza or the definite article, and folding
-- و/ي generally would conflate genuinely different names. So this is a named, one-off merge.
--
-- Deliberately NOT merged: أربيل and سهل أربيل also score 0.60 similar, but Erbil and the Erbil
-- Plain are two distinct qadhas.
WITH pair AS (
    SELECT (SELECT id FROM iraq_districts
             WHERE governorate_code = 'BAS' AND name_ar = 'أبي الخصيب') AS winner_id,
           (SELECT id FROM iraq_districts
             WHERE governorate_code = 'BAS' AND name_ar = 'ابو الخصيب') AS loser_id
), moved_areas AS (
    UPDATE iraq_district_areas a
       SET district_id = p.winner_id
      FROM pair p
     WHERE a.district_id = p.loser_id
       AND p.winner_id IS NOT NULL AND p.loser_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM iraq_district_areas b
          WHERE b.district_id = p.winner_id AND b.area_key = a.area_key)
    RETURNING a.id
), moved_locs AS (
    UPDATE iraq_locations l
       SET district_id = p.winner_id, updated_at = now()
      FROM pair p
     WHERE l.district_id = p.loser_id
       AND p.winner_id IS NOT NULL AND p.loser_id IS NOT NULL
    RETURNING l.id
), dropped_areas AS (
    DELETE FROM iraq_district_areas a USING pair p
     WHERE a.district_id = p.loser_id AND p.loser_id IS NOT NULL
    RETURNING a.id
)
DELETE FROM iraq_districts d USING pair p
 WHERE d.id = p.loser_id AND p.winner_id IS NOT NULL AND p.loser_id IS NOT NULL;

-- The و spelling has to stay matchable. Districts carry no alias table, but the area list is
-- what both the placement matcher and the resolver's district pass read, so it serves the role.
INSERT INTO iraq_district_areas (district_id, area_ar, confidence, source)
SELECT d.id, v.area, 'sourced', 'spelling variant of the qadha name'
  FROM iraq_districts d
  CROSS JOIN (VALUES ('ابو الخصيب'), ('أبي الخصيب')) AS v(area)
 WHERE d.governorate_code = 'BAS' AND d.name_ar = 'أبي الخصيب'
   AND NOT EXISTS (
     SELECT 1 FROM iraq_district_areas a
      WHERE a.district_id = d.id
        AND a.area_key = waseet_strip_article(waseet_search_key(v.area)));
