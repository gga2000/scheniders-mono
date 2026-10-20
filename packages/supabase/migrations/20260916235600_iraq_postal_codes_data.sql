-- NOTE ON THIS FILE'S TIMESTAMP
-- The 348 postal codes were originally loaded into the live database by hand, not as a
-- migration, so there is no applied version to match. The timestamp here is chosen for
-- correctness on a rebuild, not to replay history: it must come after iraq_postal_codes
-- exists (20260916235524) and after waseet_districts exists (20260916215857), and before
-- waseet_refresh_postal_codes first runs in the pipeline (20260917011616), so the codes are
-- present when regions are matched to them.
-- Idempotent: CREATE ... IF NOT EXISTS, ON CONFLICT DO UPDATE, CREATE OR REPLACE.

-- =============================================================
-- Iraqi postal codes, and what they tell us about Al-Waseet's catalogue.
--
-- Source: https://ar.wikipedia.org/wiki/قائمة_الرموز_البريدية_في_العراق
-- 348 codes across all 18 governorates.
--
-- This is an INDEPENDENT list, which is what makes it useful. It gives the
-- official spelling of a place next to the merchant-typed one, and comparing
-- the two answers two questions at once: which official areas Al-Waseet does
-- not deliver to, and how much of our catalogue exists nowhere in the official
-- list (6,311 regions against 348 codes — most of it).
--
-- Matching is on the same folded key the rest of the catalogue uses, so
-- "الفلوجة" in the postal list meets "الفلوجه" in ours.
-- =============================================================

CREATE TABLE IF NOT EXISTS iraq_postal_codes (
    code             INT PRIMARY KEY,
    name_ar          TEXT NOT NULL,
    name_search      TEXT GENERATED ALWAYS AS (waseet_search_key(name_ar)) STORED,
    governorate_code TEXT NOT NULL,
    source           TEXT NOT NULL DEFAULT 'ar.wikipedia.org/wiki/قائمة_الرموز_البريدية_في_العراق',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_iraq_postal_codes_gov ON iraq_postal_codes(governorate_code);
CREATE INDEX IF NOT EXISTS idx_iraq_postal_codes_search ON iraq_postal_codes(name_search);

ALTER TABLE iraq_postal_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read on iraq_postal_codes" ON iraq_postal_codes;
CREATE POLICY "Public read on iraq_postal_codes"
    ON iraq_postal_codes FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Service role all on iraq_postal_codes" ON iraq_postal_codes;
CREATE POLICY "Service role all on iraq_postal_codes"
    ON iraq_postal_codes FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE INSERT, UPDATE, DELETE ON iraq_postal_codes FROM anon, authenticated;

COMMENT ON TABLE iraq_postal_codes IS
    'Official Iraqi postal codes (Wikipedia). Reference data, independent of Al-Waseet — used to attach an official code to a region and to measure catalogue coverage both ways.';

INSERT INTO iraq_postal_codes (code, name_ar, governorate_code) VALUES
    (10001, 'بغداد', 'BGD'),
    (10002, 'الصالحية', 'BGD'),
    (10003, 'حيفا', 'BGD'),
    (10004, 'فندق الرشيد', 'BGD'),
    (10005, 'حي عدن', 'BGD'),
    (10006, 'الكاظمية', 'BGD'),
    (10007, 'مستشفى الكلية', 'BGD'),
    (10008, 'النور', 'BGD'),
    (10009, 'الحرية', 'BGD'),
    (10010, 'السلام', 'BGD'),
    (10011, 'الكرخ', 'BGD'),
    (10012, 'المأمون', 'BGD'),
    (10013, 'المنصور', 'BGD'),
    (10014, 'كلية الرافدين الجامعة', 'BGD'),
    (10015, 'اليرموك', 'BGD'),
    (10016, 'العامل', 'BGD'),
    (10017, 'البياع', 'BGD'),
    (10018, 'الرسالة', 'BGD'),
    (10019, 'الانتصار', 'BGD'),
    (10020, 'الثورة', 'BGD'),
    (10021, 'الجهاد', 'BGD'),
    (10022, 'الدورة', 'BGD'),
    (10023, 'مطار بغداد الدولي', 'BGD'),
    (10024, 'محطة الشحن', 'BGD'),
    (10044, 'الرشيد', 'BGD'),
    (10045, 'الرصافة', 'BGD'),
    (10046, 'المصارف', 'BGD'),
    (10047, 'باب المعظم', 'BGD'),
    (10048, 'الأقصى', 'BGD'),
    (10049, 'المجمع الطبي', 'BGD'),
    (10050, 'المجمع الطلابي', 'BGD'),
    (10051, 'إدارة واقتصاد', 'BGD'),
    (10052, 'المستنصرية', 'BGD'),
    (10053, 'الأعظمية', 'BGD'),
    (10055, 'سبع ابكار', 'BGD'),
    (10056, 'حمورابي', 'BGD'),
    (10057, '14 تموز', 'BGD'),
    (10058, 'الفداء', 'BGD'),
    (10059, 'الصدر', 'BGD'),
    (10060, 'الخنساء', 'BGD'),
    (10061, 'البلديات', 'BGD'),
    (10062, 'بغداد الجديدة', 'BGD'),
    (10063, 'الضباط', 'BGD'),
    (10064, 'شارع فلسطين', 'BGD'),
    (10065, 'المجمع التربوي', 'BGD'),
    (10066, 'الجامعة التكنولوجية', 'BGD'),
    (10067, 'كلية المنصور الجامعة', 'BGD'),
    (10068, 'العلوية', 'BGD'),
    (10069, 'الكرادة', 'BGD'),
    (10070, 'الجادرية', 'BGD'),
    (10071, 'جامعة بغداد', 'BGD'),
    (10072, 'جامعة النهرين', 'BGD'),
    (10073, 'الشموخ', 'BGD'),
    (10074, 'الزعفرانية', 'BGD'),
    (10075, 'الوحدة', 'BGD'),
    (10076, 'المدائن', 'BGD'),
    (10077, 'ناحية الرشيد', 'BGD'),
    (10078, 'اليوسفية', 'BGD'),
    (10079, 'المحمودية', 'BGD'),
    (10080, 'اللطيفية', 'BGD'),
    (10081, 'أبو غريب', 'BGD'),
    (10082, 'النصر والسلام', 'BGD'),
    (10083, 'سبع البور', 'BGD'),
    (10084, 'الطارمية', 'BGD'),
    (10085, 'الراشدية', 'BGD'),
    (10086, 'المتنبي', 'BGD'),
    (10087, 'الشعب', 'BGD'),
    (10090, 'الداوودي', 'BGD'),
    (10091, 'زيونة', 'BGD'),
    (31001, 'الرمادي', 'ANB'),
    (31002, 'الفلوجة', 'ANB'),
    (31003, 'القائم', 'ANB'),
    (31004, 'حديثة', 'ANB'),
    (31005, 'عنة', 'ANB'),
    (31006, 'راوة', 'ANB'),
    (31007, 'هيت', 'ANB'),
    (31008, 'الحبانية', 'ANB'),
    (31009, 'الحقلانية', 'ANB'),
    (31010, 'الخالدية', 'ANB'),
    (31011, 'الرطبة', 'ANB'),
    (31012, 'القعقاع', 'ANB'),
    (31013, 'الكرمة', 'ANB'),
    (31014, 'البغدادي', 'ANB'),
    (31015, 'الوليد', 'ANB'),
    (31016, 'النخيب', 'ANB'),
    (31017, 'العبيدي', 'ANB'),
    (31018, 'كبيسة', 'ANB'),
    (31019, 'طريبيل', 'ANB'),
    (31020, 'أبو غريب', 'ANB'),
    (31021, 'سعدة', 'ANB'),
    (31022, 'عكاشات', 'ANB'),
    (32001, 'بعقوبة', 'DYL'),
    (32002, 'المنصورية', 'DYL'),
    (32003, 'المقدادية', 'DYL'),
    (32004, 'كفري', 'DYL'),
    (32005, 'بلدروز', 'DYL'),
    (32006, 'الخالص', 'DYL'),
    (32007, 'خانقين', 'DYL'),
    (32008, 'جلولاء', 'DYL'),
    (32009, 'مندلي', 'DYL'),
    (32010, 'قرة تبة', 'DYL'),
    (32011, 'كنعان', 'DYL'),
    (32012, 'هبهب', 'DYL'),
    (32013, 'قزانية', 'DYL'),
    (32014, 'ناحية أبي صيدا', 'DYL'),
    (32015, 'السعدية', 'DYL'),
    (32016, 'بني سعد', 'DYL'),
    (32017, 'الوجيهية', 'DYL'),
    (32018, 'السراي', 'DYL'),
    (32019, 'المنذرية', 'DYL'),
    (34001, 'تكريت', 'SAH'),
    (34002, 'الدور', 'SAH'),
    (34003, 'سعد', 'SAH'),
    (34004, 'سلمان باك', 'SAH'),
    (34005, 'الشرقاط', 'SAH'),
    (34006, 'الدجيل', 'SAH'),
    (34007, 'بيجي', 'SAH'),
    (34008, 'الصينية', 'SAH'),
    (34009, 'طوز خورماتو', 'SAH'),
    (34010, 'سامراء', 'SAH'),
    (34011, 'بلد', 'SAH'),
    (34012, 'ناحية الإسحاقي', 'SAH'),
    (34013, 'الضلوعية', 'SAH'),
    (34014, 'الفارس', 'SAH'),
    (36001, 'كركوك', 'KRK'),
    (36002, 'الرياض', 'KRK'),
    (36003, 'ليلان', 'KRK'),
    (36004, 'خالد بن الوليد', 'KRK'),
    (36005, 'الرشاد', 'KRK'),
    (36006, 'تازة خرماتو', 'KRK'),
    (36007, 'الحويجة', 'KRK'),
    (36008, 'داقوق', 'KRK'),
    (36009, 'الزاب', 'KRK'),
    (36010, 'الدبس', 'KRK'),
    (36011, 'العباسي', 'KRK'),
    (36012, 'الحي الصناعي', 'KRK'),
    (36013, 'الحي الواسطي', 'KRK'),
    (36014, 'الحي العسكري', 'KRK'),
    (36015, 'ألتون كوبري', 'KRK'),
    (36016, 'الحي الرشيد', 'KRK'),
    (41001, 'الموصل', 'MOS'),
    (41002, 'جامعة الموصل', 'MOS'),
    (41003, 'الزهور', 'MOS'),
    (41004, 'بلاط الشهداء', 'MOS'),
    (41005, 'الشراع', 'MOS'),
    (41006, 'بغديدا', 'MOS'),
    (41007, 'أبي تمام', 'MOS'),
    (41008, 'القيارة', 'MOS'),
    (41009, 'حمام العليل', 'MOS'),
    (41010, 'تلسقف', 'MOS'),
    (41011, 'عين سفني', 'MOS'),
    (41012, 'تلكيف', 'MOS'),
    (41013, 'بعشيقة', 'MOS'),
    (41014, 'زمار', 'MOS'),
    (41015, 'سنجار', 'MOS'),
    (41016, 'تلعفر', 'MOS'),
    (41017, 'مخمور', 'MOS'),
    (41018, 'آثار نينوى', 'MOS'),
    (41019, 'برطلة', 'MOS'),
    (41020, 'ألقوش', 'MOS'),
    (41021, 'النمرود', 'MOS'),
    (41022, 'الحضر', 'MOS'),
    (41023, 'البعاج', 'MOS'),
    (41024, 'الكوير', 'MOS'),
    (41025, 'ربيعة', 'MOS'),
    (42001, 'دهوك', 'DOH'),
    (42002, 'زاخو', 'DOH'),
    (42003, 'سيميلي', 'DOH'),
    (42004, 'عقرة', 'DOH'),
    (42005, 'بيجيل', 'DOH'),
    (42006, 'بردرش', 'DOH'),
    (42007, 'زاويتة', 'DOH'),
    (42008, 'العمادية', 'DOH'),
    (42009, 'سرسنك', 'DOH'),
    (42010, 'سولار', 'DOH'),
    (42011, 'باطوفة', 'DOH'),
    (42012, 'عين سفني', 'DOH'),
    (42013, 'قسروك', 'DOH'),
    (44001, 'أربيل', 'ARB'),
    (44002, 'جامعة صلاح الدين', 'ARB'),
    (44003, 'عنكاوا', 'ARB'),
    (44004, 'مصيف صلاح الدين', 'ARB'),
    (44005, 'شقلاوة', 'ARB'),
    (44006, 'حرير', 'ARB'),
    (44007, 'خليفان', 'ARB'),
    (44008, 'سوران', 'ARB'),
    (44009, 'رواندز', 'ARB'),
    (44010, 'جومان', 'ARB'),
    (44011, 'ناحية كلالة', 'ARB'),
    (44012, 'حاج عمران', 'ARB'),
    (44013, 'ميركسور', 'ARB'),
    (44014, 'سيروان', 'ARB'),
    (44015, 'ديبكا', 'ARB'),
    (44016, 'مشتاقة', 'ARB'),
    (44017, 'ديشتي هوير', 'ARB'),
    (44018, 'كلك', 'ARB'),
    (44020, 'مخمور', 'ARB'),
    (44021, 'كوير', 'ARB'),
    (44022, 'ألتون كوبري', 'ARB'),
    (46001, 'السليمانية', 'SMH'),
    (46002, 'بختياري', 'SMH'),
    (46003, 'رزكاري', 'SMH'),
    (46004, 'عربت', 'SMH'),
    (46005, 'شاره زور', 'SMH'),
    (46006, 'حلبجة', 'SMH'),
    (46007, 'بنجوين', 'SMH'),
    (46008, 'سيد صادق', 'SMH'),
    (46009, 'بازيان', 'SMH'),
    (46010, 'دوكان', 'SMH'),
    (46011, 'بكره جو', 'SMH'),
    (46012, 'رانية', 'SMH'),
    (46013, 'بشدر', 'SMH'),
    (46014, 'قره داغ', 'SMH'),
    (46015, 'كويسنجق', 'SMH'),
    (46016, 'قلعة دزا', 'SMH'),
    (46017, 'كويه', 'SMH'),
    (46019, 'جوارتا', 'SMH'),
    (46020, 'دربندخان', 'SMH'),
    (46021, 'كلار', 'SMH'),
    (46022, 'كفري', 'SMH'),
    (46023, 'جمجمال', 'SMH'),
    (51001, 'الحلة', 'BBL'),
    (51002, 'جامعة بابل', 'BBL'),
    (51003, 'باب المشهد', 'BBL'),
    (51004, 'عشتار', 'BBL'),
    (51005, 'الإمام', 'BBL'),
    (51006, 'المسيب', 'BBL'),
    (51007, 'الإسكندرية', 'BBL'),
    (51008, 'المحاويل', 'BBL'),
    (51009, 'المشروع', 'BBL'),
    (51010, 'ناحية سدة الهندية', 'BBL'),
    (51011, 'الكفل', 'BBL'),
    (51012, 'الهاشمية', 'BBL'),
    (51013, 'القاسم', 'BBL'),
    (51014, 'الشوملي', 'BBL'),
    (51015, 'أبي عرق', 'BBL'),
    (51016, 'المدحتية', 'BBL'),
    (51017, 'قناة النيل', 'BBL'),
    (51018, 'الطليعة', 'BBL'),
    (51019, 'جرف النصر', 'BBL'),
    (51020, 'الجزائر', 'BBL'),
    (52001, 'الكوت', 'KOT'),
    (52002, 'الصويرة', 'KOT'),
    (52003, 'الزبيدية', 'KOT'),
    (52004, 'بدرة', 'KOT'),
    (52005, 'العزيزية', 'KOT'),
    (52006, 'العروبة', 'KOT'),
    (52007, 'الأحرار', 'KOT'),
    (52008, 'شيخ سعد', 'KOT'),
    (52009, 'الموفقية', 'KOT'),
    (52010, 'النعمانية', 'KOT'),
    (52011, 'الحي', 'KOT'),
    (54001, 'النجف', 'NJF'),
    (54002, 'العباسية', 'NJF'),
    (54003, 'الكوفة', 'NJF'),
    (54004, 'القادسية', 'NJF'),
    (54005, 'المناذرة', 'NJF'),
    (54006, 'المشخاب', 'NJF'),
    (54007, 'الحيرة', 'NJF'),
    (56001, 'كربلاء', 'KRB'),
    (56002, 'الهندية', 'KRB'),
    (56003, 'الحسينية', 'KRB'),
    (56004, 'عين تمر', 'KRB'),
    (58001, 'الديوانية', 'DWN'),
    (58002, 'جامعة القادسية', 'DWN'),
    (58003, 'الحمزة', 'DWN'),
    (58004, 'عفك', 'DWN'),
    (58005, 'الشنافية', 'DWN'),
    (58006, 'الشامية', 'DWN'),
    (58007, 'الدغارة', 'DWN'),
    (58008, 'غماس', 'DWN'),
    (58009, 'المهناوية', 'DWN'),
    (58010, 'الصلاحية', 'DWN'),
    (58011, 'سومر', 'DWN'),
    (58012, 'الصويرة', 'DWN'),
    (58013, 'السنية', 'DWN'),
    (58014, 'الشافعية', 'DWN'),
    (58015, 'السدير', 'DWN'),
    (58016, 'نفر', 'DWN'),
    (58017, 'الصمود', 'DWN'),
    (58018, 'التحدي', 'DWN'),
    (61001, 'البصرة', 'BAS'),
    (61002, 'الاصمعي', 'BAS'),
    (61003, 'القبلة', 'BAS'),
    (61004, 'جامعة البصرة', 'BAS'),
    (61005, 'صفوان', 'BAS'),
    (61006, 'خور الزبير', 'BAS'),
    (61007, 'أبو الخصيب', 'BAS'),
    (61008, 'المدينة', 'BAS'),
    (61009, 'الهارثة', 'BAS'),
    (61010, 'الفاو', 'BAS'),
    (61011, 'أم قصر', 'BAS'),
    (61012, 'العز', 'BAS'),
    (61013, 'حطين', 'BAS'),
    (61014, 'شط العرب', 'BAS'),
    (61015, 'الأبلة', 'BAS'),
    (61016, 'القرنة', 'BAS'),
    (61017, 'طلحة', 'BAS'),
    (61018, 'حي الحسين', 'BAS'),
    (61019, 'الجمهورية', 'BAS'),
    (61020, 'الدير', 'BAS'),
    (61021, 'المنطقة الحرة', 'BAS'),
    (61022, 'حمدان', 'BAS'),
    (61023, 'ابن الهيثم', 'BAS'),
    (61024, 'النشوة', 'BAS'),
    (61026, 'رجال الاعمال', 'BAS'),
    (61027, 'مجمع العبور', 'BAS'),
    (61028, 'مطار البصرة', 'BAS'),
    (61029, 'الميثاق', 'BAS'),
    (61030, 'مدينة البصرة', 'BAS'),
    (61031, 'مناوي باشا', 'BAS'),
    (61032, 'حي العباس', 'BAS'),
    (62001, 'العمارة', 'AMA'),
    (62002, 'علي الشرقي', 'AMA'),
    (62003, 'علي الغربي', 'AMA'),
    (62004, 'كميت', 'AMA'),
    (62005, 'المشرح', 'AMA'),
    (62006, 'الميمونة', 'AMA'),
    (62007, 'المجر الكبير', 'AMA'),
    (62008, 'قلعة صالح', 'AMA'),
    (62009, 'الكحلاء', 'AMA'),
    (62010, 'العزير', 'AMA'),
    (62011, 'الإسكان', 'AMA'),
    (62012, 'السلام', 'AMA'),
    (64001, 'الناصرية', 'NAS'),
    (64002, 'الغراف', 'NAS'),
    (64003, 'قلعة سكر', 'NAS'),
    (64004, 'النصر', 'NAS'),
    (64005, 'الرفاعي', 'NAS'),
    (64006, 'الفجر', 'NAS'),
    (64007, 'الشطرة', 'NAS'),
    (64008, 'الإصلاح', 'NAS'),
    (64009, 'كرمة بني سعيد', 'NAS'),
    (64010, 'الفضيلية', 'NAS'),
    (64011, 'البطحاء', 'NAS'),
    (64012, 'الدواية', 'NAS'),
    (64013, 'الحمار', 'NAS'),
    (64014, 'الفهود', 'NAS'),
    (64015, 'الجبايش', 'NAS'),
    (64016, 'سوق الشيوخ', 'NAS'),
    (66001, 'السماوة', 'SAM'),
    (66002, 'الرميثة', 'SAM'),
    (66003, 'الخضر', 'SAM'),
    (66004, 'السلمان', 'SAM'),
    (66005, 'النجمة', 'SAM'),
    (66006, 'الوركاء', 'SAM'),
    (66007, 'الهلال', 'SAM'),
    (66008, 'المجد', 'SAM')
ON CONFLICT (code) DO UPDATE
   SET name_ar = EXCLUDED.name_ar,
       governorate_code = EXCLUDED.governorate_code;

-- A region carries the postal code of the official area whose name it matches.
ALTER TABLE waseet_regions ADD COLUMN IF NOT EXISTS postal_code INT REFERENCES iraq_postal_codes(code);
ALTER TABLE waseet_districts ADD COLUMN IF NOT EXISTS postal_code INT REFERENCES iraq_postal_codes(code);

CREATE INDEX IF NOT EXISTS idx_waseet_regions_postal ON waseet_regions(postal_code)
    WHERE postal_code IS NOT NULL;

CREATE OR REPLACE FUNCTION waseet_refresh_postal_codes()
RETURNS TABLE (regions_matched INT, districts_matched INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    UPDATE waseet_regions  SET postal_code = NULL WHERE postal_code IS NOT NULL;
    UPDATE waseet_districts SET postal_code = NULL WHERE postal_code IS NOT NULL;

    -- Exact name match only. A postal area and a region that merely share a
    -- word are not the same place, so no fuzzy matching here.
    WITH m AS (
        SELECT DISTINCT ON (r.id) r.id, p.code
          FROM waseet_regions r
          JOIN waseet_cities c ON c.id = r.city_id
          JOIN iraq_postal_codes p
            ON p.governorate_code = c.governorate_code
           AND p.name_search = COALESCE(r.name_search_split, r.name_search)
         ORDER BY r.id, p.code
    )
    UPDATE waseet_regions r SET postal_code = m.code FROM m WHERE r.id = m.id;

    WITH m AS (
        SELECT DISTINCT ON (d.id) d.id, p.code
          FROM waseet_districts d
          JOIN waseet_cities c ON c.id = d.city_id
          JOIN iraq_postal_codes p
            ON p.governorate_code = c.governorate_code
           AND p.name_search = d.name_search
         ORDER BY d.id, p.code
    )
    UPDATE waseet_districts d SET postal_code = m.code FROM m WHERE d.id = m.id;

    SELECT count(*)::INT INTO regions_matched FROM waseet_regions WHERE postal_code IS NOT NULL;
    SELECT count(*)::INT INTO districts_matched FROM waseet_districts WHERE postal_code IS NOT NULL;
    RETURN NEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION waseet_refresh_postal_codes() FROM PUBLIC, anon, authenticated;

SELECT * FROM waseet_refresh_postal_codes();
