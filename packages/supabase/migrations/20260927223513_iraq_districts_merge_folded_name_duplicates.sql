-- 11 places exist twice in iraq_districts: once as the `area_cluster` derived from Al-Waseet's
-- own spelling and once as the sourced `qadha` from the nawahi list. The earlier merge only
-- folded the definite article, so pairs that also differ in ة/ه or أ/ء survived:
--   شيخان / الشيخان, الناصريه / الناصرية, الرطبه / الرطبة, العزيزيه / العزيزية,
--   راوه / راوة, دجيل / الدجيل, خالص / الخالص, كوفه / الكوفة, العماديه / العمادية,
--   حديثه / حديثة, قائم / القائم
-- The duplicate made every "شيخان قرية X" row a coin flip between two ids for the same place.
-- waseet_strip_article(waseet_search_key(...)) folds the article, ة→ه and أ/إ/آ→ا, so it is the
-- right identity key. The sourced qadha wins; the derived cluster's locations and areas move
-- onto it and the cluster is dropped.
WITH keyed AS (
    SELECT d.id, d.governorate_code, d.kind,
           waseet_strip_article(waseet_search_key(d.name_ar)) AS key
      FROM iraq_districts d
), winner AS (
    SELECT DISTINCT ON (governorate_code, key) governorate_code, key, id
      FROM keyed
     ORDER BY governorate_code, key,
              (kind = 'qadha') DESC, (kind = 'nahiya') DESC, id
), pair AS (
    SELECT k.id AS loser_id, w.id AS winner_id
      FROM keyed k
      JOIN winner w ON w.governorate_code = k.governorate_code AND w.key = k.key
     WHERE k.id <> w.id
), moved_areas AS (
    -- carry across only the area names the winner does not already hold
    UPDATE iraq_district_areas a
       SET district_id = p.winner_id
      FROM pair p
     WHERE a.district_id = p.loser_id
       AND NOT EXISTS (
         SELECT 1 FROM iraq_district_areas b
          WHERE b.district_id = p.winner_id AND b.area_key = a.area_key
       )
    RETURNING a.id
), moved_locs AS (
    UPDATE iraq_locations l
       SET district_id = p.winner_id, updated_at = now()
      FROM pair p
     WHERE l.district_id = p.loser_id
    RETURNING l.id
), dropped_areas AS (
    DELETE FROM iraq_district_areas a USING pair p
     WHERE a.district_id = p.loser_id
    RETURNING a.id
)
DELETE FROM iraq_districts d USING pair p WHERE d.id = p.loser_id;
