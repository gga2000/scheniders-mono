-- Second Iraq locations cleanup (2026-10-20).
--
-- 1. Fourteen duplicates that the review scan missed: a bare name and the same name with a
--    district or governorate prefix, both rows already in the same district. The bare row is
--    kept, the prefixed one is merged in with the same additive pattern as 20261020214159.
-- 2. Eight placements settled by sources, set manual so a gazetteer refresh keeps them.

CREATE TEMP TABLE merge_pair (survivor INT, loser INT, why TEXT) ON COMMIT DROP;
INSERT INTO merge_pair VALUES
    (1523, 4935, 'same place; الكحلاء prefix, both in الكحلاء'),
    (5837, 5036, 'same place; الرمادي prefix, both in الحبانية'),
    (  67, 5529, 'same place; منطقة بغداد الجديدة prefix, both in بغداد الجديدة'),
    (5464, 5666, 'same quarter; بغداد prefix and حي only, both in الرشيد'),
    (5513, 5581, 'same place; طارمية prefix, both in الطارمية'),
    (5816, 5324, 'same quarter; المنصور prefix and حي only, both in المنصور'),
    (  50, 5574, 'same place; التاجي prefix, both in التاجي'),
    ( 208, 5576, 'same place; التاجي prefix, both in التاجي'),
    (5842,  838, 'same place; ديالى prefix, both in الخالص'),
    ( 261,  419, 'same quarter; كربلاء prefix and حي only, both in كربلاء'),
    (2774, 3823, 'same place; سوق الشيوخ prefix, both in سوق الشيوخ'),
    (2775, 3844, 'same place; سوق الشيوخ prefix, both in سوق الشيوخ'),
    (1562, 4462, 'same place; الخضر prefix, both in الخضر'),
    (1589, 4479, 'same place; الوركاء prefix, both in الوركاء');

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

UPDATE iraq_locations l
   SET is_active = false, review_status = 'rejected',
       review_reason = 'Merged into #' || m.survivor || ' on 2026-10-20: ' || m.why,
       updated_at = now()
  FROM merge_pair m
 WHERE l.id = m.loser;

-- three survivors were only flagged because of the duplicate; same district on both rows
UPDATE iraq_locations
   SET review_status = 'ok', review_reason = NULL, updated_at = now()
 WHERE id IN (50, 67, 208) AND review_status = 'needs_review';

-- placements research settled; manual so a gazetteer refresh does not undo them
CREATE TEMP TABLE placement (location_id INT, district_id INT, why TEXT) ON COMMIT DROP;
INSERT INTO placement VALUES
    (5792, 309, 'جوارتا is the seat of قضاء شاربازير (sourced area)'),
    (2787, 325, 'قضاء الإصلاح, Dhi Qar'),
    (2939,  68, 'ناحية قزانية is under قضاء بلدروز (COSIT 2009)'),
    (2771, 319, 'ناحية البطحاء is under قضاء الناصرية (COSIT 2009)'),
    ( 495, 102, 'ناحية كبيسة is under قضاء هيت (COSIT 2009)'),
    (2544, 139, 'الربيضة is a village of ناحية العلم (marefa.org ناحية_العلم)'),
    ( 730,  66, 'حي الرافدين is a Basra city quarter (ar.wikipedia أحياء_مدينة_البصرة)'),
    ( 653,  66, 'الحيانية is a quarter west of Basra city centre (areq.net الحيانية)');

UPDATE iraq_locations l
   SET district_id = p.district_id, district_is_manual = true, district_source = 'manual',
       review_status = 'ok', review_reason = NULL, updated_at = now()
  FROM placement p
 WHERE l.id = p.location_id;
