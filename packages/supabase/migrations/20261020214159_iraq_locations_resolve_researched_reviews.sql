-- Close the review items that research settled (2026-10-19). Sources per item are in the
-- resolution text; the rest stay open for a human.
--
-- A merge is additive: the survivor takes the loser's name and aliases as aliases and its
-- Al-Waseet ids (so a historical order still resolves), and the loser is deactivated with a
-- pointer to the survivor. Nothing is deleted, so any merge can be undone row by row.

CREATE TEMP TABLE merge_pair (survivor INT, loser INT, why TEXT) ON COMMIT DROP;
INSERT INTO merge_pair VALUES
    (4196, 4843, 'Sheladiz town, final letter dropped'),
    (3797, 3956, 'same quarter; differs only by حي'),
    (3538, 3534, 'same quarter; differs only by حي'),
    (5013, 3398, 'same quarter; differs only by حي'),
    (1521, 1372, 'ناحية العدل under قضاء المجر الكبير (marefa.org/Maysan_Governorate)'),
    (5739, 3089, 'Haditha town is the district centre (en.wikipedia Haditha_District)'),
    (3190, 3182, 'same place; differs only by الناحية'),
    (1084,  961, 'same village; differs only by قرية'),
    ( 551,  502, 'same quarter; differs only by حي/مركز'),
    (5437, 5436, 'same quarter; differs only by حي'),
    (5418, 5537, 'same area, same بلدية; differs only by منطقة'),
    (5569, 5412, 'one Qahira in Baghdad, by Adhamiyah (en.wikipedia List_of_neighborhoods_and_districts_in_Baghdad)'),
    (4155, 4154, 'same village; differs only by القرية'),
    (4414, 4718, 'same quarter; ي/ى and محله only'),
    (4274, 4002, 'same village; differs only by قرية'),
    (4182, 5245, 'same complex; differs only by منطقة'),
    (4033, 4020, 'ناحية روفيا, in قضاء بردرش (COSIT 2009 administrative units; capni-iraq.org/duhok)'),
    (5844, 4061, 'Suwaira city is the qadha seat (en.wikipedia Al-Suwaira_District)'),
    ( 347,  396, 'same quarter; differs only by حي'),
    ( 348,  404, 'same quarter; differs only by حي'),
    (1254, 1242, 'same quarter; differs only by حي'),
    (1343, 1294, 'ناحية شوان under قضاء كركوك (COSIT 2009)'),
    (2218, 1952, 'one Albu Saif village south of Mosul (rudaw.net)'),
    (2059, 1961, 'same Mosul quarter; differs only by حي'),
    (2302, 1967, 'ناحية الشورة (COSIT 2009)'),
    (2107, 1986, 'same Mosul quarter; differs only by حي'),
    (2114, 1987, 'same Mosul quarter; differs only by حي'),
    (2123, 1991, 'same Mosul quarter; differs only by حي'),
    (2943, 2941, 'same village; differs only by قرية'),
    (2100, 2214, 'same quarter; differs only by حي'),
    (2238, 2213, 'same village; differs only by قرية'),
    (2310, 2314, 'ناحية وانة under قضاء تلكيف (COSIT 2009)'),
    (5801,   14, 'قضاء الشطرة, Dhi Qar (ar.wikipedia محافظة_ذي_قار)'),
    (5802, 2788, 'قضاء النصر, formerly ناحية النصر (shafaq.com)'),
    (3392, 3397, 'same quarter; differs only by حي'),
    (1640, 1554, 'same quarter; differs only by حي');

-- the loser's own name and every spelling it carried become aliases of the survivor
INSERT INTO iraq_location_aliases (location_id, alias_ar, source)
SELECT m.survivor, x.alias_ar, 'duplicate'
  FROM merge_pair m
  JOIN (SELECT l.id, l.name_ar AS alias_ar FROM iraq_locations l
        UNION
        SELECT a.location_id, a.alias_ar FROM iraq_location_aliases a) x ON x.id = m.loser
ON CONFLICT (location_id, alias_ar) DO NOTHING;

-- the survivor keeps its own preferred id; the loser's ids follow it as non-preferred
UPDATE iraq_location_carrier_refs c
   SET location_id = m.survivor, is_preferred = false
  FROM merge_pair m
 WHERE c.location_id = m.loser;

-- a placement or side only the loser had moves with it
UPDATE iraq_locations s
   SET district_id = l.district_id, district_source = l.district_source,
       side = COALESCE(s.side, l.side), updated_at = now()
  FROM merge_pair m JOIN iraq_locations l ON l.id = m.loser
 WHERE s.id = m.survivor AND s.district_id IS NULL AND l.district_id IS NOT NULL;

UPDATE iraq_locations l
   SET is_active = false, review_status = 'rejected',
       review_reason = 'Merged into #' || m.survivor || ' on 2026-10-19: ' || m.why,
       updated_at = now()
  FROM merge_pair m
 WHERE l.id = m.loser;

UPDATE iraq_location_reviews r
   SET resolved = true,
       resolution = 'merged ' || m.loser || ' into ' || m.survivor || ': ' || m.why
  FROM merge_pair m
 WHERE (r.a_location_id, r.b_location_id) = (LEAST(m.survivor, m.loser), GREATEST(m.survivor, m.loser));

-- two places, not one
UPDATE iraq_location_reviews
   SET resolved = true,
       resolution = 'distinct: حي الخضراء is a Mansour neighbourhood (en.wikipedia Al_Khadhraa), منطقة الخضراء is the Green Zone'
 WHERE (a_location_id, b_location_id) = (5305, 5479);

-- placements research settled; manual so a gazetteer refresh does not undo them
CREATE TEMP TABLE placement (location_id INT, district_id INT, why TEXT) ON COMMIT DROP;
INSERT INTO placement VALUES
    ( 943, 251, 'Rizgari 2 is an Erbil city neighbourhood (REACH Erbil city map, 2017)'),
    (1165, 251, 'Rizgary Teaching Hospital is in Erbil city (kurdistan24.net)'),
    (1188, 258, 'ناحية رزكاري is in قضاء خبات (COSIT 2009; en.wikipedia Khabat_District)'),
    (4037, 244, 'بردرش is its own qadha in Duhok (COSIT 2009)'),
    (4815, 244, 'the camp was established at Bardarash (en.wikipedia Bardarash)'),
    (4033, 244, 'ناحية روفيا is in قضاء بردرش (COSIT 2009)'),
    (5801, 324, 'قضاء الشطرة (ar.wikipedia محافظة_ذي_قار)'),
    (4665,  83, 'الرميثة is its own qadha of Muthanna (ar.wikipedia محافظة_المثنى)'),
    (4664, 163, 'الوركاء is its own qadha of Muthanna (ar.wikipedia محافظة_المثنى)'),
    (5495, (SELECT district_id FROM iraq_locations WHERE id = 5495),
           'حي الحبيبية is a quarter of بلدية الصدر الأولى (iasj.rdd.edu.iq study)');

UPDATE iraq_locations l
   SET district_id = p.district_id, district_is_manual = true, district_source = 'manual',
       review_status = 'ok', review_reason = NULL, updated_at = now()
  FROM placement p
 WHERE l.id = p.location_id;

-- ناحية الشورة is merged, but which qadha holds it now is still open
UPDATE iraq_locations
   SET review_status = 'needs_review',
       review_reason = 'District unsure: COSIT 2009 puts ناحية الشورة under قضاء الموصل; later sources put it under القيارة'
 WHERE id = 2302;
