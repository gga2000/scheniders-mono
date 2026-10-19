-- The General Commission for Taxes publishes which Baghdad areas each of its
-- branches covers (tax.mof.gov.iq/محافظة-بغداد/). It is an official
-- administrative listing and it names areas no encyclopaedia article does.
--
-- Branches are not municipalities, so only the branches that map cleanly onto
-- one are used: الحرية->الشعلة, الشعب->الشعب, بغداد الجديدة, المشتل->الغدير,
-- الاعظمية, الرصافة, الدورة, الكرادة الشرقية->الكرادة, البياع->الرشيد.
-- Branches that straddle two municipalities (كرخ الاطراف, الكرخ المركز) give
-- only the side of the river, not a parent.
INSERT INTO iraq_district_areas (district_id, area_ar, confidence, source)
SELECT d.id, v.area, 'sourced',
       'tax.mof.gov.iq/محافظة-بغداد/ — ' || v.branch
FROM (VALUES
  ('الشعلة','الهياكل','فرع الحرية'),
  ('الشعب','الثعالبة','فرع الشعب'),
  ('الشعب','بوب الشام','فرع الشعب'),
  ('بغداد الجديدة','تل محمد','فرع بغداد الجديدة'),
  ('بغداد الجديدة','الالف دار','فرع بغداد الجديدة'),
  ('بغداد الجديدة','الاعاشة','فرع بغداد الجديدة'),
  ('الغدير','حي العماري','فرع المشتل'),
  ('الغدير','العماري','فرع المشتل'),
  ('الغدير','حي البتول','فرع المشتل'),
  ('الغدير','المعوقين','فرع المشتل'),
  ('الغدير','الصحفيين','فرع المشتل'),
  ('الغدير','الكفاءات','فرع المشتل'),
  ('الغدير','ولداية','فرع المشتل'),
  ('الأعظمية','كميرة','فرع الاعظمية'),
  ('الأعظمية','سريدات','فرع الاعظمية'),
  ('الأعظمية','نجيب باشا','فرع الاعظمية'),
  ('الأعظمية','راغبة خاتون','فرع الاعظمية'),
  ('الأعظمية','الدهاليك','فرع الاعظمية'),
  ('الأعظمية','منشأة سعد','فرع الاعظمية'),
  ('الرصافة','مهندسين','فرع الرصافة'),
  ('الرصافة','باب الشيخ','فرع الرصافة'),
  ('الرصافة','قهوة شكر','فرع الرصافة'),
  ('الرصافة','المربعة','فرع الرصافة'),
  ('الرصافة','راس الساقية','فرع الرصافة'),
  ('الرشيد','التاميم','فرع البياع'),
  ('الرشيد','حي المعرفة','فرع البياع'),
  ('الرشيد','حي ذي قار','فرع البياع'),
  ('الرشيد','حي اجنادين','فرع البياع'),
  ('الرشيد','دور الشهداء','فرع البياع'),
  ('الدورة','الوادي','فرع الدورة'),
  ('الكرادة','سارة خاتون','فرع الكرادة الشرقية'),
  ('الكرادة','كب الارمن','فرع الكرادة الشرقية'),
  ('الكرادة','حسام الدين','فرع الكرادة الشرقية')
) AS v(parent, area, branch)
JOIN iraq_districts d ON d.governorate_code = 'BGD' AND d.name_ar = v.parent
ON CONFLICT (district_id, area_ar) DO NOTHING;

-- بوب الشام was placed by neighbour inference earlier; the tax listing is a
-- better authority, so it goes back to the gazetteer path.
UPDATE iraq_locations
   SET district_source = 'gazetteer', district_id = NULL
 WHERE governorate_code = 'BGD' AND name_ar = 'بوب الشام' AND district_source = 'adjacency';

-- كرخ الاطراف spans المنصور and الرشيد, so it establishes the side only.
UPDATE iraq_locations SET side = 'karkh'
 WHERE governorate_code = 'BGD' AND name_ar IN ('سويب','المامؤن');

SELECT iraq_refresh_location_districts();;
