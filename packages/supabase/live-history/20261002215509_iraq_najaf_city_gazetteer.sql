-- Najaf city (قضاء النجف) quarters from the 2017 GIS study table in ar.wikipedia "النجف",
-- cited to مجلة اداب الكوفة 2017 (areas in hectares and populations per quarter), plus the four
-- old محلات of the shrine city and the nahiyas from "محافظة النجف" § التقسيمات الإدارية.
--
-- Six entries in the source are study groupings of two quarters joined by "و" — الأطباء والنفط,
-- الاشتراكي والإسكان, المثنى وأبو خالد, الكرامة والصحة, العلماء والشعراء, الشرطة والثورة. Each is
-- split so either half matches on its own.
--
-- القادسية is in the source list but is deliberately EXCLUDED: it is already recorded as
-- ناحية القادسية under قضاء المشخاب in this governorate, so adding it to قضاء النجف would create
-- a same-length tie between two districts — the coin-flip class the ranking rules exist to avoid.
INSERT INTO iraq_district_areas (district_id, area_ar, confidence, source)
SELECT 80, v.area, 'sourced',
       CASE v.tag
         WHEN 'gis' THEN 'ar.wikipedia.org/wiki/النجف — أحياء مدينة النجف سنة 2017 (مجلة اداب الكوفة)'
         WHEN 'old' THEN 'ar.wikipedia.org/wiki/النجف — محلاتها القديمة'
         ELSE 'ar.wikipedia.org/wiki/محافظة_النجف — التقسيمات الإدارية'
       END
  FROM (VALUES
    ('أبو طالب','gis'),('الأطباء','gis'),('النفط','gis'),('الاشتراكي','gis'),('الإسكان','gis'),
    ('الحوراء','gis'),('الزهراء','gis'),('الأمير','gis'),('السعد','gis'),('المثنى','gis'),
    ('أبو خالد','gis'),('المعلمين','gis'),('المهدي','gis'),('الأنصار','gis'),('القدس','gis'),
    ('القدس 1','gis'),('القدس 2','gis'),('العدالة','gis'),('الفرات','gis'),('الغدير','gis'),
    ('الكرامة','gis'),('الصحة','gis'),('الحنانة','gis'),('الحسين','gis'),('العلماء','gis'),
    ('الشعراء','gis'),('الشرطة','gis'),('الثورة','gis'),('الغري','gis'),('السلام','gis'),
    ('السلام الجديد','gis'),('الجامعة','gis'),('الوفاء','gis'),('العروبة','gis'),
    ('الجمعية','gis'),('الهندية','gis'),('العسكري','gis'),('الكرمة','gis'),('النصر','gis'),
    ('الميلاد','gis'),('الميلاد الجديد','gis'),('الجديدات','gis'),('المدينة القديمة','gis'),
    ('الرحمة','gis'),('الرضوية','gis'),
    -- the four old quarters around the shrine; محلة العلا is now called المشراق
    ('المشراق','old'),('العلا','old'),('العمارة','old'),('الحويش','old'),('البراق','old'),
    -- nahiya of قضاء النجف not yet recorded
    ('بانيقيا','nahiya')
  ) AS v(area, tag)
 WHERE NOT EXISTS (
   SELECT 1 FROM iraq_district_areas a
    WHERE a.district_id = 80
      AND a.area_key = waseet_strip_article(waseet_search_key(v.area))
 );;
