-- Applied 2026-10-29 by Ali in the Supabase SQL editor (not via MCP, so it has no schema_migrations row).
-- Iraq locations pending fixes, round 5 (2026-10-29): Ali's answers and row edits from the
-- cleanup page (claude.ai/artifact/3DH1crxHXngQ2rCH6vUpBc), read back 2026-10-29.
-- Round 4 (carrier-group fold) is live as migration 20261028165700. Districts Ali picked on the
-- page that were folded since are mapped to the district they went into (noted per row).
-- Q3 (4968/4970) was not answered and is left open.
--
-- Measured on real order addresses (read-only): 10 addresses change place, all from a merge
-- (حي القاهرة 2 -> حي القاهره x2, قرية الغدير -> حي الغدير x7, ناحية القادسيه -> حي القادسيه x1).
-- No order address resolves to any "اخرى" row. The placements below change only districts.

-- 1. Merges (Q1, Q2, Q4, Q5, Q9-Q12), same additive pattern as 20261021234343.
CREATE TEMP TABLE merge_pair (survivor INT, loser INT, why TEXT) ON COMMIT DROP;
INSERT INTO merge_pair VALUES
    (1435, 1436, 'Ali Q1: حي القاهره 2 is the same quarter'),
    ( 935,  950, 'Ali Q2: خمسه حصاروك مدرسه النور is the same place'),
    (4338, 4426, 'Ali Q4: spelling variant of محلة كوجر'),
    (3503, 3698, 'Ali Q5: typo of دور الامام'),
    (2870, 2804, 'Ali Q9: الحكيم is حي الحكيم'),
    (3904, 3916, 'Ali Q10: ناحيه اور is حي اور'),
    (1791, 1895, 'Ali Q11: قرية الغدير is حي الغدير'),
    (1804, 1943, 'Ali Q12: ناحيه القادسيه is حي القادسيه');

INSERT INTO iraq_location_aliases (location_id, alias_ar, source)
SELECT m.survivor, x.alias_ar, 'duplicate'
  FROM merge_pair m
  JOIN (SELECT l.id, l.name_ar AS alias_ar FROM iraq_locations l
        UNION
        SELECT a.location_id, a.alias_ar FROM iraq_location_aliases a) x ON x.id = m.loser
ON CONFLICT (location_id, alias_ar) DO NOTHING;

UPDATE iraq_location_carrier_refs c
   SET location_id = m.survivor, is_preferred = false
  FROM merge_pair m
 WHERE c.location_id = m.loser;

UPDATE iraq_locations l
   SET is_active = false, review_status = 'rejected',
       review_reason = 'Merged into #' || m.survivor || ' on 2026-10-29: ' || m.why,
       updated_at = now()
  FROM merge_pair m
 WHERE l.id = m.loser;

UPDATE iraq_location_reviews r
   SET resolved = true,
       resolution = 'merged ' || m.loser || ' into ' || m.survivor || ': ' || m.why
  FROM merge_pair m
 WHERE (r.a_location_id, r.b_location_id) = (LEAST(m.survivor, m.loser), GREATEST(m.survivor, m.loser));

-- Q6, Q7, Q8: two different places
UPDATE iraq_location_reviews
   SET resolved = true, resolution = 'distinct: Ali kept both on 2026-10-29'
 WHERE (a_location_id, b_location_id) IN ((499, 621), (552, 633), (5548, 5586));

-- 2. Placements from the page, manual so a refresh keeps them.
CREATE TEMP TABLE placement (location_id INT, district_id INT, why TEXT) ON COMMIT DROP;
INSERT INTO placement VALUES
    -- row edits, Baghdad
    ( 107,  19, 'Ali confirmed بغداد الجديدة'),
    ( 120,   7, 'Ali confirmed الشعب'),
    ( 133,  12, 'Ali confirmed (was the البلديات group, folded into الغدير)'),
    ( 178,  18, 'Ali confirmed (was the العدل group, folded into المنصور)'),
    ( 185,  18, 'Ali confirmed المنصور'),
    ( 122,  14, 'Ali chose the الزعفرانية group, folded into الكرادة'),
    ( 127,   7, 'customers write الشعب شارع الصحة (8 of 8)'),
    ( 128,  14, 'Ali chose الكرادة'),
    ( 134,  18, 'Ali chose the الغزالية group, folded into المنصور'),
    ( 156,  20, 'Ali chose مدينة الصدر'),
    -- question answers
    (2302, 282, 'Ali Q13: قضاء الموصل (COSIT 2009)'),
    (1043, 251, 'Ali Q14: Erbil city Shorsh quarter'),
    (4653,  37, 'Ali Q15: الابله'),
    (  61,   2, 'Ali Q16: الأعظمية'),
    (5583,   2, 'Ali Q17: الأعظمية'),
    (4560,  68, 'Ali Q18: the كنعان group, folded into بلدروز'),
    (3875, 164, 'Ali Q19: دخيل'),
    (1301, 297, 'Ali Q21: officially in طوز خورماتو (Salahuddin); governorate stays Kirkuk as Al-Waseet has it'),
    (1228, 297, 'Ali Q21: officially in طوز خورماتو (Salahuddin); governorate stays Kirkuk as Al-Waseet has it'),
    (1337, 297, 'Ali Q21: officially in طوز خورماتو (Salahuddin); governorate stays Kirkuk as Al-Waseet has it'),
    (1277, 297, 'Ali Q21: officially in طوز خورماتو (Salahuddin); governorate stays Kirkuk as Al-Waseet has it');

UPDATE iraq_locations l
   SET district_id = p.district_id, district_is_manual = true, district_source = 'manual',
       review_status = 'ok', review_reason = NULL, updated_at = now()
  FROM placement p
 WHERE l.id = p.location_id;

-- Q22: مدينة الصدر - شارع السفارات is on the Rusafa side
UPDATE iraq_locations SET side = 'rusafa', updated_at = now() WHERE id = 5605;

-- a location on a sided Baghdad district takes that side when it has none of its own
UPDATE iraq_locations l
   SET side = d.side, updated_at = now()
  FROM iraq_districts d
 WHERE d.id = l.district_id AND d.side IS NOT NULL AND l.side IS NULL;

-- 3. Q20: switch off the 18 "اخرى" (other) rows. Their carrier ids stay attached.
UPDATE iraq_locations
   SET is_active = false, review_status = 'rejected',
       review_reason = 'Placeholder "اخرى", switched off by Ali on 2026-10-29 (Q20)', updated_at = now()
 WHERE id IN (5, 11, 21, 213, 498, 639, 767, 806, 864, 1213, 1353, 1535, 1676, 2320, 2503, 2575, 2770, 2790)
   AND name_ar = 'اخرى';

-- Check
DO $$
DECLARE n INT;
BEGIN
    SELECT count(*) INTO n FROM iraq_locations l JOIN placement p ON p.location_id = l.id
     WHERE l.district_id = p.district_id AND l.district_is_manual;
    IF n <> 21 THEN RAISE EXCEPTION 'expected 21 placed rows, got %', n; END IF;
    SELECT count(*) INTO n FROM iraq_locations WHERE name_ar = 'اخرى' AND is_active;
    IF n <> 0 THEN RAISE EXCEPTION '% "اخرى" rows still active', n; END IF;
    SELECT count(*) INTO n FROM iraq_locations l JOIN merge_pair m ON m.loser = l.id WHERE l.is_active;
    IF n <> 0 THEN RAISE EXCEPTION '% merged rows still active', n; END IF;
END $$;
