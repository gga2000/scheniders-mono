-- Six Baghdad areas were recorded under two districts each because I hedged while the
-- qadha-vs-بلدية question was open. Those three questions are now settled, so remove the
-- losing copy and stop the placement from being a coin flip.
--
-- 1. التاجي is its own قضاء, not a ناحية of بلدية الكاظمية. Its four areas
--    (ابو الجدايل، ام الجدايل، سبع البور، هور الباشا) belong to التاجي alone.
-- 2. الجوادين is the الكاظمين/الجوادين shrine quarter, inside بلدية الكاظمية — the
--    الشعلة copy came from misreading the same Wikipedia list.
-- 3. زيونة sits in بلدية الغدير (Rusafa), confirmed earlier from an Amanat Baghdad notice;
--    the الكرادة copy is wrong.
DELETE FROM iraq_district_areas a
 USING iraq_districts d
 WHERE d.id = a.district_id
   AND d.governorate_code = 'BGD'
   AND (
        (d.name_ar = 'الكاظمية' AND a.area_key IN (
            waseet_strip_article(waseet_search_key('ابو الجدايل')),
            waseet_strip_article(waseet_search_key('ام الجدايل')),
            waseet_strip_article(waseet_search_key('سبع البور')),
            waseet_strip_article(waseet_search_key('هور الباشا'))))
     OR (d.name_ar = 'الشعلة'  AND a.area_key = waseet_strip_article(waseet_search_key('الجوادين')))
     OR (d.name_ar = 'الكرادة' AND a.area_key = waseet_strip_article(waseet_search_key('زيونة')))
   );;
