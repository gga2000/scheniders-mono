-- Baghdad's two sides of the Tigris — جانب الكرخ and جانب الرصافة — are a real
-- level that sources state plainly even when they do not name the بلدية.
-- Recording it turns "unknown" into "east bank, municipality still open".
ALTER TABLE iraq_districts
    ADD COLUMN IF NOT EXISTS side TEXT CHECK (side IN ('karkh','rusafa'));
ALTER TABLE iraq_locations
    ADD COLUMN IF NOT EXISTS side TEXT CHECK (side IN ('karkh','rusafa'));

COMMENT ON COLUMN iraq_locations.side IS
    'Baghdad only: which bank of the Tigris. Sourced independently of the district, because sources often give the side when they cannot give the municipality.';

UPDATE iraq_districts SET side = 'karkh'
 WHERE governorate_code = 'BGD'
   AND name_ar IN ('الكرخ','الكاظمية','المنصور','الرشيد','الدورة','الشعلة',
                   'أبو غريب','ابوغريب','المحمودية','الخضراء والمطار');

UPDATE iraq_districts SET side = 'rusafa'
 WHERE governorate_code = 'BGD'
   AND name_ar IN ('الرصافة','الأعظمية','الكرادة','الغدير','بغداد الجديدة',
                   'مدينة الصدر','الصدر الأولى','الصدر الثانية','الشعب','المدائن');

-- a location on a known district takes that district's side
UPDATE iraq_locations l
   SET side = d.side
  FROM iraq_districts d
 WHERE d.id = l.district_id AND d.side IS NOT NULL AND l.side IS DISTINCT FROM d.side;

-- Researched this pass, each with its source.
INSERT INTO iraq_district_areas (district_id, area_ar, confidence, source)
SELECT d.id, v.area, v.conf, v.src
FROM (VALUES
  ('الأعظمية','الخيزران','sourced',
   'ar.wikipedia.org/wiki/مقبرة_الخيزران — مقابر الخيزران تعرف حالياً بمقبرة الأعظمية، تحيط بمسجد الإمام أبي حنيفة'),
  ('بغداد الجديدة','ساحة ميسلون','sourced',
   'ساحة ميسلون تقع عند مدخل منطقة بغداد الجديدة على جهة الرصافة'),
  ('المنصور','ساحة قحطان','sourced',
   'ساحة قحطان في حي القادسية، والقادسية ضمن حي المنصور — ar.wikipedia.org/wiki/مناطق_بغداد')
) AS v(parent, area, conf, src)
JOIN iraq_districts d ON d.governorate_code = 'BGD' AND d.name_ar = v.parent
ON CONFLICT (district_id, area_ar) DO NOTHING;

-- Side established by research, municipality still open. These stay flagged;
-- the side is progress, not an answer.
UPDATE iraq_locations SET side = 'rusafa'
 WHERE governorate_code = 'BGD'
   AND name_ar IN ('السعادة','مهندسين','حي البتول','الرشاد','الشماعية',
                   'الرشاد شارع التانكي','ساحة ميسلون','الخيزران');

UPDATE iraq_locations SET side = 'karkh'
 WHERE governorate_code = 'BGD' AND name_ar IN ('ساحة قحطان');

-- الشماعية and الرشاد are the same place (ar.wikipedia.org/wiki/الرشاد_(بغداد):
-- "الشماعية أو الرشاد أحد أحياء العاصمة العراقية بغداد"). Recorded as an alias
-- rather than merged: they carry separate carrier ids and separate history.
INSERT INTO iraq_location_aliases (location_id, alias_ar, source)
SELECT l.id, 'الشماعية', 'wikipedia'
  FROM iraq_locations l
 WHERE l.governorate_code = 'BGD' AND l.name_ar = 'الرشاد'
ON CONFLICT (location_id, alias_ar) DO NOTHING;

INSERT INTO iraq_location_aliases (location_id, alias_ar, source)
SELECT l.id, 'الرشاد', 'wikipedia'
  FROM iraq_locations l
 WHERE l.governorate_code = 'BGD' AND l.name_ar = 'الشماعية'
ON CONFLICT (location_id, alias_ar) DO NOTHING;

INSERT INTO iraq_location_reviews (a_location_id, b_location_id, reason, similarity)
SELECT LEAST(a.id, b.id), GREATEST(a.id, b.id),
       'same place under two names (الشماعية = الرشاد, per Wikipedia) — decide whether to merge', 1.0
  FROM iraq_locations a, iraq_locations b
 WHERE a.governorate_code='BGD' AND a.name_ar='الرشاد'
   AND b.governorate_code='BGD' AND b.name_ar='الشماعية'
ON CONFLICT (a_location_id, b_location_id) DO NOTHING;

SELECT iraq_refresh_location_districts();
