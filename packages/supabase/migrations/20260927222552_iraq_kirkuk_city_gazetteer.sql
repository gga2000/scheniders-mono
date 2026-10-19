-- Kirkuk city (قضاء كركوك) neighbourhoods from ar.wikipedia "كركوك" § أهم الأحياء السكنية.
-- تبه is omitted deliberately: it is the generic Turkmen word for "hill" and appears as a
-- bare token in unrelated KRK place names, so it would over-match.
INSERT INTO iraq_district_areas (district_id, area_ar, confidence, source)
SELECT 263, v.area, 'sourced', 'gazetteer:wikipedia-kirkuk'
  FROM (VALUES
    -- old quarters
    ('قورية'), ('بريادي'), ('الشورجة'), ('أحمد آغا'), ('شاطرلو'), ('إمام قاسم'),
    ('الماس'), ('القلعة'), ('المصلى'), ('تسعين'), ('عرفة'), ('ساحة طيران'),
    ('حمزه لي'), ('آزادي'), ('رحيم آوه'), ('الحديديين'),
    -- newer quarters
    ('حي البعث'), ('حي الواسطي'), ('غرناطة'), ('دوميز'), ('واحد آذار'),
    ('حي القادسية'), ('پنجه علي'), ('الممدودة'), ('حي النصر'), ('العسكري'),
    ('العروبة'), ('حي النور'), ('حي المنتوجات'), ('حي الشهداء'), ('حي الوحدة'),
    ('الأسرى والمفقودين'), ('المعلمين'), ('الضباط'), ('واحد حزيران'), ('الخضراء')
  ) AS v(area)
 WHERE NOT EXISTS (
   SELECT 1 FROM iraq_district_areas a
    WHERE a.district_id = 263
      AND a.area_key = waseet_strip_article(waseet_search_key(v.area))
 );
