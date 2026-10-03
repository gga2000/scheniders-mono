-- Karbala city (مركز قضاء كربلاء) neighbourhoods, sourced from University of Karbala
-- College of Dentistry, "الاقضية والاحياء وبعد المدينة عن المحافظات الاخرى".
-- حي الحر is deliberately excluded: ناحية/قضاء الحر is its own district here and the
-- name is ambiguous between the neighbourhood and the nahiya.
INSERT INTO iraq_district_areas (district_id, area_ar, confidence, source)
SELECT 144, v.area, 'sourced', 'gazetteer:uokerbala'
  FROM (VALUES
    ('باب السلالمة'), ('باب الطاق'), ('باب بغداد'), ('باب الخان'), ('المخيم'),
    ('باب النجف'), ('العباسية الشرقية'), ('العباسية الغربية'),
    ('حي الحسين'), ('حي المعلمين'), ('حي العباس'), ('حي النقيب'), ('حي رمضان'),
    ('حي الصحة'), ('حي الاسكان'), ('حي القزوينية'), ('حي العدالة'), ('حي البنوك'),
    ('حي الموظفين'), ('حي البلدية'), ('حي السعدية'), ('حي الملحق'), ('حي التعليب'),
    ('حي العامل'), ('حي الوفاء'), ('حي الاطباء'), ('حي القدس'), ('حي الانصار'),
    ('حي الصمود'), ('حي النجف الجديد')
  ) AS v(area)
 WHERE NOT EXISTS (
   SELECT 1 FROM iraq_district_areas a
    WHERE a.district_id = 144
      AND a.area_key = waseet_strip_article(waseet_search_key(v.area))
 );
