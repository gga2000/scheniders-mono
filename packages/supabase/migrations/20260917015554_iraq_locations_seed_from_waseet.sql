-- Governorates, from the catalogue's own city list (one city per governorate).
INSERT INTO iraq_governorates (code, name_ar, name_en, postal_prefix)
SELECT c.governorate_code,
       -- the city names carry a qualifier ("الحلة - بابل"); the governorate is the plain part
       CASE WHEN c.name_ar LIKE '% - %' THEN split_part(c.name_ar, ' - ', 2) ELSE c.name_ar END,
       x.name_en,
       (SELECT min(p.code) / 1000 FROM iraq_postal_codes p WHERE p.governorate_code = c.governorate_code)
  FROM waseet_cities c
  JOIN (VALUES
    ('BGD','Baghdad'),('KRB','Karbala'),('ANB','Anbar'),('BBL','Babil'),('BAS','Basra'),
    ('DOH','Duhok'),('DYL','Diyala'),('ARB','Erbil'),('KRK','Kirkuk'),('AMA','Maysan'),
    ('SAM','Muthanna'),('NJF','Najaf'),('MOS','Ninawa'),('DWN','Diwaniyah'),('SAH','Saladin'),
    ('SMH','Sulaymaniyah'),('NAS','Dhi Qar'),('KOT','Wasit')
  ) AS x(code, name_en) ON x.code = c.governorate_code
ON CONFLICT (code) DO NOTHING;

-- Districts: the sourced administrative parents first, so they win the unique
-- key over a derived cluster of the same name.
INSERT INTO iraq_districts (governorate_code, name_ar, kind, confidence, source)
SELECT DISTINCT ON (g.governorate_code, g.parent_ar)
       g.governorate_code, g.parent_ar,
       CASE WHEN g.parent_kind = 'municipality' THEN 'municipality' ELSE 'qadha' END,
       min(g.confidence) OVER (PARTITION BY g.governorate_code, g.parent_ar),
       'gazetteer: ' || g.source
  FROM waseet_gazetteer g
ON CONFLICT (governorate_code, name_ar) DO NOTHING;

-- then the clusters derived from the catalogue's own naming patterns
INSERT INTO iraq_districts (governorate_code, name_ar, kind, confidence, source)
SELECT DISTINCT c.governorate_code, d.name_ar, 'area_cluster', 'inferred',
       'derived from Al-Waseet naming pattern (' || d.source || ')'
  FROM waseet_districts d
  JOIN waseet_cities c ON c.id = d.city_id
ON CONFLICT (governorate_code, name_ar) DO NOTHING;

-- Locations: one row per canonical, non-test region.
INSERT INTO iraq_locations
    (governorate_code, district_id, name_ar, place_kind, postal_code,
     review_status, review_reason)
SELECT c.governorate_code,
       -- the sourced municipality is the better parent when we have one
       COALESCE(
         (SELECT id FROM iraq_districts x
           WHERE x.governorate_code = c.governorate_code AND x.name_ar = r.municipality_ar),
         (SELECT id FROM iraq_districts x
           WHERE x.governorate_code = c.governorate_code
             AND x.name_ar = (SELECT name_ar FROM waseet_districts wd WHERE wd.id = r.district_id))
       ),
       COALESCE(r.name_display, r.name_clean),
       r.place_kind,
       r.postal_code,
       -- "اخرى" is a merchant picking a fallback from a dropdown, not a place
       CASE WHEN waseet_strip_article(r.name_search) IN ('اخري','غير محدد','لا يوجد')
            THEN 'needs_review' ELSE 'ok' END,
       CASE WHEN waseet_strip_article(r.name_search) IN ('اخري','غير محدد','لا يوجد')
            THEN 'Placeholder value, not a place — decide whether to keep it as a destination'
            END
  FROM waseet_regions r
  JOIN waseet_cities c ON c.id = r.city_id
 WHERE r.canonical_id = r.id
   AND NOT r.is_suspect
   AND r.is_active;
