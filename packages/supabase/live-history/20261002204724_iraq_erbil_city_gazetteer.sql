-- Erbil city (قضاء أربيل) residential quarters from ar.wikipedia "أربيل" § أهم المناطق السكنية.
--
-- Erbil's unplaced rows are a different problem from Karbala's: most are private residential
-- compounds and towers inside the city (لانه ستي, مارينا 1/2/3, شقق كامراني, مجمع الزيتون), which
-- no encyclopaedia lists. Catalogue-position inference does not rescue them either — the id block
-- 3280-3500 interleaves كويسنجق, شقلاوة, خبات and سهل أربيل with city entries, so there is no
-- contiguous city run to infer from. That leaves the genuinely civic names, which this covers.
INSERT INTO iraq_district_areas (district_id, area_ar, confidence, source)
SELECT 251, v.area, 'sourced', 'gazetteer:wikipedia-erbil'
  FROM (VALUES
    ('منارة جولي'), ('طيراوة'), ('حي العرب'), ('إسكان'), ('روناكي'), ('شورش'),
    ('سبعة نيسان'), ('كولان'), ('حي عسكري'), ('بختياري'), ('وة زيران'),
    ('عين كاوا'), ('عنكاوا'), ('حي المهندسين'), ('منتكاوا')
  ) AS v(area)
 WHERE NOT EXISTS (
   SELECT 1 FROM iraq_district_areas a
    WHERE a.district_id = 251
      AND a.area_key = waseet_strip_article(waseet_search_key(v.area))
 );;
