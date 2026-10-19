-- Diwaniyah city (مركز قضاء الديوانية) neighbourhoods.
-- Main list: ar.wikipedia "الديوانية (مدينة)" table "أحياء مدينة الديوانية سنة 2007",
-- itself cited to two Al-Qadisiyah University papers.
-- Supplemented by dewaniapc.gov.iq (رفعت, أم الخيل, المزاريج, الخصيمة, الحضارة).
-- Omitted on purpose because the bare token is too generic to match safely:
-- السوق, الجديدة, الإمام.
INSERT INTO iraq_district_areas (district_id, area_ar, confidence, source)
SELECT 292, v.area, 'sourced', 'gazetteer:wikipedia-diwaniyah'
  FROM (VALUES
    ('الصدر'), ('الوحدات'), ('الفرات'), ('الإمام الصادق'), ('الإسكان الصناعي'),
    ('الحكيم'), ('الجزائر'), ('السراي'), ('الإسكان القديم'), ('الثقافي'),
    ('العروبة'), ('النهضة'), ('الجمهوري الشرقي'), ('الجمهوري الغربي'), ('العصري'),
    ('الجمعية'), ('14 رمضان'), ('التأميم الأولى'), ('التأميم الثانية'), ('السكك'),
    ('الضباط'), ('الفاضلية'), ('صوب الشامية'), ('المعلمين'), ('الوحدة الميكانيكية'),
    ('رفعت'), ('أم الخيل'), ('المزاريج'), ('الخصيمة'), ('الحضارة'), ('الوحدة')
  ) AS v(area)
 WHERE NOT EXISTS (
   SELECT 1 FROM iraq_district_areas a
    WHERE a.district_id = 292
      AND a.area_key = waseet_strip_article(waseet_search_key(v.area))
 );;
