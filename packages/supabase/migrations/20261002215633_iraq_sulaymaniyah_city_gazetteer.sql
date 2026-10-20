-- Sulaymaniyah city (قضاء السليمانية) quarters from the table in ar.wikipedia "السليمانية",
-- cited to مجلة جامعة الأنبار للعلوم الإنسانية 2016, plus the three nahiyas of the qadha from
-- "محافظة السليمانية" § التقسيم الإداري. قضاء السليمانية held only 7 locations.
--
-- شورش is in the source list but deliberately EXCLUDED: it is already recorded as ناحية شورش
-- under قضاء جمجمال in this governorate, so adding it here would make every "شورش" row a tie
-- between two districts. Checked all 49 proposed names against the existing SMH districts and
-- areas; شورش was the only collision. "بيرة مكرون 1" is safe because the numbered form does not
-- share a key with ناحية بيرة مكرون under قضاء دوكان.
INSERT INTO iraq_district_areas (district_id, area_ar, confidence, source)
SELECT 304, v.area, 'sourced',
       CASE WHEN v.tag = 'nahiya'
            THEN 'ar.wikipedia.org/wiki/محافظة_السليمانية — التقسيم الإداري'
            ELSE 'ar.wikipedia.org/wiki/السليمانية — أحياء مدينة السليمانية (مجلة جامعة الأنبار 2016)'
       END
  FROM (VALUES
    ('رابرين','q'),('علي ناجي','q'),('اشتي 1','q'),('اشتي 2','q'),('اندازياريان','q'),
    ('برانان','q'),('باخان','q'),('هندرين','q'),('قاضي محمد','q'),('بختياري','q'),
    ('بختياري الجديدة','q'),('ماموستايان','q'),('هكاري','q'),('كازرة وشك 1','q'),
    ('شيروانة','q'),('دباشان','q'),('سرجنار 1','q'),('سرجنار 2','q'),('مصي سرجنار','q'),
    ('سورين','q'),('هروزي','q'),('بادينان','q'),('شكركة','q'),('زركتة','q'),
    ('كاني سبيكة','q'),('كوردسات 1','q'),('كوردسات 2','q'),('سارداو','q'),('سروري','q'),
    ('زيرين','q'),('نيركز','q'),('كويستان','q'),('فرمانبران','q'),('بيرة مكرون 1','q'),
    ('دركزين','q'),('شيخان','q'),('ملكندي','q'),('كردي جوكة','q'),('جبل كويزة','q'),
    ('داروغا','q'),('توي مليك','q'),('علي كمال','q'),('مجيد بيك 1','q'),('مجيد بيك 2','q'),
    ('شهيدان','q'),('آزادي 1','q'),('آزادي 2','q'),('أزمر','q'),
    ('بكرجو','nahiya'),('بازيان','nahiya'),('عربت','nahiya')
  ) AS v(area, tag)
 WHERE NOT EXISTS (
   SELECT 1 FROM iraq_district_areas a
    WHERE a.district_id = 304
      AND a.area_key = waseet_strip_article(waseet_search_key(v.area))
 );
