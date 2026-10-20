-- The definite article split nine districts in two: التاجي/تاجي,
-- الكرادة/كرادة, المدائن/مدائن and six more. Worse than cosmetic — in each
-- pair a SOURCED municipality or qadha was competing with a derived cluster of
-- the same place, so locations landed in whichever the matcher happened to
-- reach first and the tree showed one area twice.
--
-- The survivor is the better-evidenced row: a sourced qadha or municipality
-- beats a derived cluster, and the longer (article-bearing) spelling breaks a
-- tie, since that is how these places are actually written.
WITH ranked AS (
    SELECT id, governorate_code,
           waseet_strip_article(name_search) AS k,
           row_number() OVER (
             PARTITION BY governorate_code, waseet_strip_article(name_search)
             ORDER BY CASE kind WHEN 'qadha' THEN 0 WHEN 'municipality' THEN 1 ELSE 2 END,
                      CASE confidence WHEN 'sourced' THEN 0 ELSE 1 END,
                      char_length(name_ar) DESC,
                      id
           ) AS rn
      FROM iraq_districts
),
keep AS (SELECT governorate_code, k, id AS keep_id FROM ranked WHERE rn = 1),
drop_list AS (
    SELECT r.id AS drop_id, kp.keep_id
      FROM ranked r JOIN keep kp ON kp.governorate_code = r.governorate_code AND kp.k = r.k
     WHERE r.rn > 1
)
UPDATE iraq_locations l
   SET district_id = dl.keep_id, updated_at = now()
  FROM drop_list dl
 WHERE l.district_id = dl.drop_id;

-- move the loser's area names onto the survivor before deleting it
WITH ranked AS (
    SELECT id, governorate_code, waseet_strip_article(name_search) AS k,
           row_number() OVER (
             PARTITION BY governorate_code, waseet_strip_article(name_search)
             ORDER BY CASE kind WHEN 'qadha' THEN 0 WHEN 'municipality' THEN 1 ELSE 2 END,
                      CASE confidence WHEN 'sourced' THEN 0 ELSE 1 END,
                      char_length(name_ar) DESC, id
           ) AS rn
      FROM iraq_districts
),
keep AS (SELECT governorate_code, k, id AS keep_id FROM ranked WHERE rn = 1),
drop_list AS (
    SELECT r.id AS drop_id, kp.keep_id
      FROM ranked r JOIN keep kp ON kp.governorate_code = r.governorate_code AND kp.k = r.k
     WHERE r.rn > 1
)
INSERT INTO iraq_district_areas (district_id, area_ar, confidence, source)
SELECT dl.keep_id, a.area_ar, a.confidence, a.source
  FROM iraq_district_areas a
  JOIN drop_list dl ON dl.drop_id = a.district_id
ON CONFLICT (district_id, area_ar) DO NOTHING;

WITH ranked AS (
    SELECT id, governorate_code, waseet_strip_article(name_search) AS k,
           row_number() OVER (
             PARTITION BY governorate_code, waseet_strip_article(name_search)
             ORDER BY CASE kind WHEN 'qadha' THEN 0 WHEN 'municipality' THEN 1 ELSE 2 END,
                      CASE confidence WHEN 'sourced' THEN 0 ELSE 1 END,
                      char_length(name_ar) DESC, id
           ) AS rn
      FROM iraq_districts
)
DELETE FROM iraq_districts d USING ranked r WHERE d.id = r.id AND r.rn > 1;

-- التاجي is a real qadha of Baghdad, not a pattern in the strings
UPDATE iraq_districts
   SET kind = 'qadha', confidence = 'sourced',
       source = 'قضاء التاجي، أحد أقضية محافظة بغداد شمال العاصمة — aljazeera.net/encyclopedia قضاء التاجي',
       side = 'karkh'
 WHERE governorate_code = 'BGD' AND name_ar = 'التاجي';
