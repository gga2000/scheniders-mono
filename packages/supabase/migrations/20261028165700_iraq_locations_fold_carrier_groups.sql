-- Applied 2026-10-28 by Ali in the Supabase SQL editor (not via MCP, so it has no schema_migrations row).
-- Source: /mnt/project-files/iraq-locations/pending-fixes-2.sql; summary in groups-fold.md.

-- Iraq locations pending fixes, round 4 (started 2026-10-28). Applied once, after Ali has reviewed all of it.
-- Round 3 (pending-fixes.sql) is live as migration 20261025220000.
--
-- 1. Fold carrier area groups into official districts.
--    135 iraq_districts rows of kind 'area_cluster' were built from how Al-Waseet starts its names
--    ("السيدية ..." -> a group called السيدية). They are neighbourhoods or towns, not districts.
--    Each group's area names move to the official district it lies in, so the refresh places
--    its rows there. Places pinned by hand onto a group move with it. A few rows whose group name
--    was the only thing anchoring them would be pulled elsewhere by a smaller word in their
--    name; those are pinned by hand. The emptied group rows stay in iraq_districts (no delete).
--    Ali chose "fold all" on 2026-10-28.

CREATE TEMP TABLE fold (cluster_id INT PRIMARY KEY, district_id INT NOT NULL, why TEXT NOT NULL) ON COMMIT DROP;
INSERT INTO fold VALUES
    -- Baghdad
    (175,   1, 'ابوغريب duplicates the qadha أبو غريب'),
    (210,   8, 'الحرية is in بلدية الشعلة (ar.wikipedia قائمة بلديات بغداد)'),
    (176,  19, 'الأمين is in بلدية بغداد الجديدة (ar.wikipedia قائمة بلديات بغداد)'),
    ( 79,  14, 'الزعفرانية is in بلدية الكرادة (ar.wikipedia قائمة بلديات بغداد)'),
    (152,  12, 'البلديات is served by دائرة بلدية الغدير (alssaa.com 38780; areq البلديات_(بغداد))'),
    (146,  12, 'العبيدي is a listed area of الغدير (ar.wikipedia مناطق بغداد)'),
    ( 46,   5, 'السيدية is in بلدية الرشيد (ar.wikipedia قائمة بلديات بغداد)'),
    ( 58,  18, 'الغزالية is in the Mansour district (en.wikipedia Ghazaliya)'),
    ( 88,  18, 'شارع مركز شرطة - الغزالية is a street in الغزالية'),
    (199,  18, 'حي العدل is served by دائرة بلدية المنصور (almuraqeb-aliraqi.org 579923)'),
    ( 29,  17, 'ناحية النهروان is in قضاء المدائن (marefa النهروان)'),
    -- Maysan, Anbar
    (117, 271, 'المجر is the seat of قضاء المجر الكبير (ar.wikipedia قائمة نواحي العراق)'),
    ( 55, 225, 'عامرية الفلوجة is the seat of قضاء العامرية (ar.wikipedia قائمة نواحي العراق)'),
    ( 31, 125, 'الصقلاوية is a listed area of الفلوجة'),
    (206, 125, 'الكرمة is a listed area of الفلوجة'),
    -- Basra
    (188,  66, 'كرمة علي is in ناحية الهارثة, قضاء البصرة (en.wikipedia Qarmat_Ali)'),
    ( 50,  66, 'المعقل is a district of Basra city (en.wikipedia Al_Maqal)'),
    (110, 211, 'الشعيبة is in قضاء الزبير (en.wikipedia Shaibah)'),
    (165, 173, 'جيكور belongs to قضاء أبي الخصيب (en.wikipedia Jaykur)'),
    ( 32, 235, 'ناحية الثغر is in قضاء القرنة (ar.wikipedia قائمة نواحي العراق)'),
    (209,  66, 'ناحية الهارثة is in قضاء البصرة (ar.wikipedia قائمة نواحي العراق)'),
    ( 60, 211, 'سفوان is a listed area of الزبير'),
    (193,  92, 'النشوة is a listed area of شط العرب'),
    -- Duhok
    ( 45, 181, 'بروشكي is a neighbourhood of Duhok city (kurdistan24 395224)'),
    -- Diyala
    (162, 135, 'ناحية جلولاء is in قضاء خانقين (ar.wikipedia قائمة نواحي العراق)'),
    (197, 107, 'ناحية بني سعد is in قضاء بعقوبة (ar.wikipedia قائمة نواحي العراق)'),
    (169, 247, 'دلي عباس is in ناحية المنصورية, قضاء الخالص (en.wikipedia El_Mansouria)'),
    ( 28,  65, 'شهربان is the old name of المقدادية (en.wikipedia Miqdadiyah)'),
    ( 98, 250, 'ناحية قرة تبة is in قضاء كفري (ar.wikipedia قائمة نواحي العراق)'),
    (159,  68, 'ناحية كنعان is in قضاء بلدروز (ar.wikipedia قائمة نواحي العراق)'),
    (170,  68, 'ناحية مندلي is in قضاء بلدروز (ar.wikipedia قائمة نواحي العراق)'),
    -- Nineveh
    ( 87, 282, 'الأيمن is the right bank of Mosul city'),
    (202,  74, 'سنوني is in قضاء سنجار (en.wikipedia Sinun)'),
    ( 72, 282, 'ناحية القيارة is part of قضاء الموصل (en.wikipedia Qayyarah_subdistrict)'),
    -- Dhi Qar
    (106, 324, 'ناحية الغراف is listed under قضاء الشطرة (marefa Dhi_Qar_Governorate)'),
    (185, 319, 'ناحية سيد دخيل is listed under قضاء الناصرية (marefa Dhi_Qar_Governorate)'),
    ( 41,  91, 'الحبايش is a misspelling of الجبايش'),
    -- Najaf, Salahuddin, Muthanna, Sulaymaniyah
    (149, 279, 'ناحية العباسية is in قضاء الكوفة (ar.wikipedia قائمة نواحي العراق)'),
    (139,  86, 'ناحية العلم is administratively part of قضاء تكريت (marefa ناحية_العلم)'),
    ( 84,  54, 'ناحية السوير is in قضاء السماوة (ar.wikipedia قائمة نواحي العراق)'),
    ( 27,  83, 'ناحية الهلال is in قضاء الرميثة (ar.wikipedia قائمة نواحي العراق)'),
    ( 51, 304, 'كاني ... are quarters of Sulaymaniyah city (REACH city reference map 2017)');

CREATE TEMP TABLE pin (location_id INT PRIMARY KEY, district_id INT NOT NULL, side TEXT, why TEXT NOT NULL) ON COMMIT DROP;
INSERT INTO pin VALUES
    -- Baghdad: rows the refresh would send elsewhere once their group is gone
    (5336,  8, NULL, 'الحرية ربيع: الحرية, not حي الربيع in الأعظمية'),
    (5435, 19, NULL, 'بغداد الامين نواب ضباط: الأمين, not حي الضباط in الرشيد'),
    (5524, 19, NULL, 'مركز شرطة الامين: الأمين, not حي الشرطة in الرشيد'),
    (5477, 14, NULL, 'معسكر الرشيد زعفرانيه: the camp is in الزعفرانية, not الرشيد'),
    (5406, 18, NULL, 'الغزاليه الكفائات الغزاليه: الغزالية, not الكفاءات in الغدير'),
    (5661, 17, NULL, 'النهروان - 9 نيسان: a quarter of النهروان, not 9 نيسان in الغدير'),
    (5375,  4, 'karkh', 'الدورة زراعي العبيدي: the carrier prefix is الدورة (Claude default, Ali may overrule)'),
    -- elsewhere
    (4737, 225, NULL, 'عامرية الفلوجة طريق الحبانيه: in العامرية, on the road towards الحبانية'),
    (3444, 135, NULL, 'جلولاء حي الشهداء: جلولاء, not the empty الشهداء group'),
    (3599, 107, NULL, 'خان بني سعد حي الشهداء: بني سعد, not the empty الشهداء group'),
    (5045,  74, NULL, 'سنوني قادسية: سنوني, not حي القادسية in الموصل');

-- 1a. Move each group's area names to its official district. A name the district already has is
--     a duplicate, so the group's copy is dropped.
DELETE FROM iraq_district_areas a
 USING fold f
 WHERE a.district_id = f.cluster_id
   AND EXISTS (SELECT 1 FROM iraq_district_areas b WHERE b.district_id = f.district_id AND b.area_ar = a.area_ar);

UPDATE iraq_district_areas a
   SET district_id = f.district_id,
       source = a.source || ' | folded from carrier group ' || f.cluster_id || ': ' || f.why
  FROM fold f
 WHERE a.district_id = f.cluster_id;

-- 1b. Rows the refresh doesn't place (by hand, by catalogue position, or from a bracketed
--     carrier name) follow their group, keeping how they were placed.
UPDATE iraq_locations l
   SET district_id = f.district_id, updated_at = now()
  FROM fold f
 WHERE l.district_id = f.cluster_id
   AND (l.district_is_manual OR l.district_source <> 'gazetteer');

-- 1c. Pins.
UPDATE iraq_locations l
   SET district_id = p.district_id, district_is_manual = true, district_source = 'manual',
       side = COALESCE(p.side, l.side), updated_at = now()
  FROM pin p
 WHERE l.id = p.location_id;

-- 1d. Re-place everything else and fill empty sides.
SELECT iraq_refresh_location_districts();

-- Check: no active row is left on a folded group.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM iraq_locations l JOIN fold f ON f.cluster_id = l.district_id WHERE l.is_active) THEN
        RAISE EXCEPTION 'active rows still on a folded carrier group';
    END IF;
END $$;
