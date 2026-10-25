-- Applied 2026-10-25 by Ali in the Supabase SQL editor (not via MCP, so it has no schema_migrations row).
-- Iraq locations pending fixes (audit round 3 onward, 2026-10-22). Applied once, when Ali has reviewed all of it.
--
-- 1. Twelve rows placed by catalogue position (adjacency) contradict their own name: the name
--    starts with, or is, a sourced qadha or ناحية that sits in another district. Placed there,
--    manual so a refresh keeps them.
-- 2. Baghdad side drift: a location on a sided district takes that district's side
--    (rule from 20260917022813), but iraq_refresh_location_districts never re-applied it, so 58
--    rows placed since have no side. Fill them, and make the refresh fill empty sides from now on.
--    Only empty sides are filled; a side set from a source is never overwritten.

CREATE TEMP TABLE placement (location_id INT, district_id INT, why TEXT) ON COMMIT DROP;
INSERT INTO placement VALUES
    (2242, 289, 'قضاء البعاج is its own qadha (ar.wikipedia قائمة_نواحي_العراق)'),
    (5808, 320, 'الرفاعي is its own qadha (ar.wikipedia قائمة_نواحي_العراق)'),
    (1500, 270, 'named under قلعة صالح, a qadha of Maysan'),
    (2514, 301, 'named under الدور, a qadha of Salahuddin'),
    ( 471, 102, 'البغدادي is a ناحية of هيت (COSIT 2009)'),
    ( 211,   8, 'الهياكل is in الشعلة (sourced area), with هياكل شارع 15 and 20'),
    ( 672, 211, 'أم قصر is a ناحية of الزبير (sourced area)'),
    ( 682, 211, 'أم قصر is a ناحية of الزبير (sourced area)'),
    ( 683, 211, 'أم قصر is a ناحية of الزبير (sourced area)'),
    ( 684, 211, 'أم قصر is a ناحية of الزبير (sourced area)'),
    ( 686, 211, 'أم قصر is a ناحية of الزبير (sourced area)'),
    ( 717, 211, 'أم قصر is a ناحية of الزبير (sourced area)'),
    -- 1b. Nine unplaced Baghdad landmark rows. Every real order address that names the
    --     landmark also names the same area (count in brackets), and no address disagrees.
    --     Dry run: 28 addresses gain a district, none resolve to a different place.
    ( 143,  58, 'customers write الغزالية شارع مدير الامن (6 of 6)'),
    ( 131,  18, 'customers write العامرية شارع العمل الشعبي (5 of 5); العامرية is in المنصور'),
    ( 137,  79, 'customers write الزعفرانية شارع المعهد (3 of 3)'),
    ( 182, 199, 'customers write حي العدل مجمع اليمامة (3 of 3)'),
    ( 132, 199, 'customers write حي العدل شارع القادة (2 of 2)'),
    (  91,  12, 'customers write زيونة دار الازياء (2 of 2); زيونة is in الغدير'),
    (  35,  12, 'customers write المعامل منطقة السعادة (2 of 2); المعامل is in الغدير'),
    (  22,   7, 'customers write الشعب شارع الاسواق المركزية (3 of 3)'),
    ( 146,   7, 'customers write الشعب شارع عدن (2 of 2)'),
    -- 1c. Two catalogue-position rows checked the same way.
    ( 104,  14, 'was الرصافة; customers write الكرادة ساحة الواثق (3 of 3), side stays rusafa'),
    (  65,   5, 'stays الرشيد; customers write السيدية/الاعلام تقاطع الدرويش, both in الرشيد');

UPDATE iraq_locations l
   SET district_id = p.district_id, district_is_manual = true, district_source = 'manual',
       review_status = 'ok', review_reason = NULL, updated_at = now()
  FROM placement p
 WHERE l.id = p.location_id;

CREATE OR REPLACE FUNCTION public.iraq_refresh_location_districts()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '180s'
AS $function$
DECLARE
    v_placed INT;
BEGIN
    UPDATE iraq_locations SET district_id = NULL
     WHERE district_is_manual = false
       AND district_source = 'gazetteer'
       AND district_id IS NOT NULL;

    WITH target AS MATERIALIZED (
        SELECT l.id, l.governorate_code,
               waseet_strip_article(waseet_search_key(g.name_ar)) AS gov_key,
               string_to_array(waseet_strip_article(l.name_search), ' ') AS toks
          FROM iraq_locations l
          JOIN iraq_governorates g ON g.code = l.governorate_code
         WHERE l.district_is_manual = false
           AND l.district_source = 'gazetteer'
           AND l.is_active
    ),
    phrase AS MATERIALIZED (
        SELECT t.id, t.governorate_code,
               array_to_string(t.toks[i:j], ' ') AS p,
               (i = j AND t.toks[i] = t.gov_key
                      AND COALESCE(array_length(t.toks, 1), 0) > 1) AS is_gov_qualifier
          FROM target t,
               LATERAL generate_series(1, COALESCE(array_length(t.toks, 1), 0)) AS i,
               LATERAL generate_series(i, LEAST(i + 4, COALESCE(array_length(t.toks, 1), 0))) AS j
    ),
    hit AS MATERIALIZED (
        SELECT ph.id, a.district_id, ph.p, char_length(ph.p) AS len, ph.is_gov_qualifier,
               (a.area_key = waseet_strip_article(waseet_search_key(d.name_ar))) AS is_own_name,
               (d.kind <> 'area_cluster') AS is_sourced_unit
          FROM phrase ph
          JOIN iraq_district_areas a ON a.area_key = ph.p
          JOIN iraq_districts d ON d.id = a.district_id
         WHERE d.governorate_code = ph.governorate_code
           AND char_length(ph.p) >= 2
           AND char_length(waseet_search_key(a.area_ar)) >= 3
    ),
    ranked AS (
        SELECT h.*,
               (h.is_own_name AND NOT EXISTS (
                  SELECT 1 FROM hit o
                   WHERE o.id = h.id AND o.len > h.len AND o.p LIKE '%' || h.p || '%'
               )) AS strong_own_name
          FROM hit h
    ),
    best AS (
        SELECT DISTINCT ON (id) id, district_id
          FROM ranked
         ORDER BY id, is_gov_qualifier, strong_own_name DESC, len DESC,
                  is_own_name DESC, is_sourced_unit DESC, district_id
    )
    UPDATE iraq_locations l
       SET district_id = best.district_id, updated_at = now()
      FROM best WHERE l.id = best.id;

    -- a location on a sided Baghdad district takes that side when it has none of its own
    UPDATE iraq_locations l
       SET side = d.side, updated_at = now()
      FROM iraq_districts d
     WHERE d.id = l.district_id AND d.side IS NOT NULL AND l.side IS NULL;

    SELECT count(*)::INT INTO v_placed FROM iraq_locations WHERE district_id IS NOT NULL;
    RETURN v_placed;
END;
$function$;

-- the 58 rows placed since the side rule last ran, plus 5 Baghdad rows placed above (63 in all)
UPDATE iraq_locations l
   SET side = d.side, updated_at = now()
  FROM iraq_districts d
 WHERE d.id = l.district_id AND d.side IS NOT NULL AND l.side IS NULL;

-- 3. Short names for capital-city rows. Al-Waseet writes most capital quarters with the city in
--    front ("الناصريه الحبوبي"), and customers write the quarter alone ("الحبوبي"), which did not
--    resolve. Each row below gets its name without the city as an alias. Measured on 4,082 real
--    order addresses (dry runs, rolled back): 41 more resolve, 5 move to a more specific row in
--    the same city, none stop resolving. Only names that no other row in the governorate uses
--    are included; a broader rule sent ~25 addresses to the wrong town and was dropped.
INSERT INTO iraq_location_aliases (location_id, alias_ar, source)
SELECT v.location_id, v.alias_ar, 'learned'
  FROM (VALUES
    (478, 'مدخل الشرقي'),
    (1318, 'تل الورد'),
    (1320, 'ملا عبدالله'),
    (1648, 'حي الرسالة'),
    (1649, 'حي الضباط'),
    (1989, 'قضاء الحمدانية'),
    (1990, 'ناحية الكيارة'),
    (2297, 'حي البعث'),
    (2846, 'الجديدة (حي العسكري)'),
    (2964, 'الزراعة'),
    (2971, 'حي الملعب'),
    (2972, 'العزيزية'),
    (2978, 'الاسكان'),
    (2980, 'سدة البعلون'),
    (2982, 'الورار'),
    (2984, 'بيوت الروسين'),
    (2985, 'مجسر الزيوت'),
    (3002, 'الفندق التركي'),
    (3007, 'شقق صفر'),
    (3009, 'سايلو'),
    (3010, 'دواجن'),
    (3017, 'الطاش الاولى'),
    (3018, 'الطاش الثالثة'),
    (3019, 'حميرة'),
    (3020, 'البجابر'),
    (3021, 'لواء الثامن'),
    (3023, 'الحكم المحلي'),
    (3024, 'حي الاكراد'),
    (3025, 'حي الاساتذة'),
    (3027, 'حي الارامل'),
    (3029, 'حي الشر كة'),
    (3030, 'الثيلة'),
    (3045, 'زنكورة الشراع'),
    (3046, 'خمسه كيلو'),
    (3048, 'زنكورة مجمع عمر الراوي'),
    (3050, 'زنبيل ماركت'),
    (3051, 'حي زيتون'),
    (3053, 'الصوفية السدة'),
    (3054, 'الصوفية جامع الواثق'),
    (3055, 'الصوفية البوغانم'),
    (3056, 'الصوفية البوسودة'),
    (3057, 'الصوفية البعلوان'),
    (3058, 'الصوفية جامع الصوفية'),
    (3059, 'الصوفية جامع بشائر الرحمن'),
    (3060, 'الصوفية محطة الكهرباء'),
    (3061, 'الصوفية مدرسة التوحيد'),
    (3062, 'الصوفية شارع الهور'),
    (3064, 'الصوفية مستشفى الاورام'),
    (3065, 'سجارية جويبة'),
    (3066, 'سجارية نساف'),
    (3067, 'سجارية مول زيتونة'),
    (3068, 'سجارية اسواق الكوخ'),
    (3069, 'سجارية مدرسة حليمة'),
    (3121, 'المضيق'),
    (3191, 'المجر'),
    (3328, 'عين الفرس'),
    (3329, 'حقول الدواجن'),
    (3334, 'شجرة الدر'),
    (3336, 'حي القضاة'),
    (3339, 'المعسكرات'),
    (3343, 'العمليات'),
    (3344, 'العوجه الجديده'),
    (3345, 'الطرابله'),
    (3346, 'الصقور'),
    (3347, 'الصافيه'),
    (3350, 'الديوم'),
    (3354, 'البودور'),
    (3355, 'الايوبي'),
    (3356, 'الضباعي'),
    (3364, 'القادسيه شارع الشهداء'),
    (3368, 'شارغ الاحتفالات'),
    (3369, 'حي التوحيد'),
    (3425, 'الرعاية'),
    (3499, 'زاغنية'),
    (3501, 'زهرة'),
    (3503, 'دور الامام'),
    (3504, 'الجزائر'),
    (3517, 'جرف الملح'),
    (3520, 'السوامرة'),
    (3531, 'الاهويدر'),
    (3533, 'السبتية'),
    (3535, 'ركة حجي سهيل'),
    (3536, 'الاسود'),
    (3539, 'سيف سعد'),
    (3540, 'الهاشميات'),
    (3543, 'دحيلة'),
    (3631, 'درو الزراع'),
    (3632, 'المجمع الصناعي'),
    (3637, 'الرحمة دليمات'),
    (3640, 'كاطون الرازي'),
    (3641, 'كاطون بيروت'),
    (3644, 'كاطون افران دبي'),
    (3645, 'كاطون الحولي'),
    (3646, 'كاطون العثمانية'),
    (3683, 'حي المعلمين دور الزراعة'),
    (3684, 'حي المعلمين دور المعجون'),
    (3685, 'الصناعة الاولى'),
    (3686, 'الصناعة الثانية'),
    (3687, 'الصناعة الثالثة'),
    (3688, 'ام الاعظام'),
    (3692, 'سايلو بعقوبة'),
    (3693, 'العزات'),
    (3697, 'عبدالحميد'),
    (3698, 'دورة الامام'),
    (3699, 'دور الباوية'),
    (3700, 'حد الاخضر'),
    (3701, 'خرنابات'),
    (3703, 'بودجة'),
    (3704, 'حي العبور'),
    (3705, 'الحكيم'),
    (3706, 'ام النوة'),
    (3707, 'ام الاكرفس'),
    (3708, 'باب الدرب'),
    (3709, 'الاحيمر'),
    (3710, 'عرب جتال'),
    (3711, 'جبينات'),
    (3712, 'كاتب العدل'),
    (3714, 'امام المحسن'),
    (3715, 'البردية'),
    (3716, 'قرية داود السالم'),
    (3717, 'قرية عداي'),
    (3718, 'البدوانية'),
    (3719, 'قرية دواي'),
    (3721, 'الفلاحة'),
    (3722, 'المجرة'),
    (3723, 'الامير هاوس'),
    (3728, 'بهرز ابو خميس'),
    (3731, 'بهرز امام حبش'),
    (3734, 'برغة'),
    (3745, 'المعد التقني'),
    (3747, 'معسكر سعد'),
    (3750, 'نادي ديالى'),
    (3752, 'القديمة خريسان'),
    (3795, 'حي الفداء'),
    (3796, 'السبل'),
    (3797, 'حي تضحيه'),
    (3798, 'الطاقه'),
    (3800, 'الحبوبي'),
    (3801, 'شوفه'),
    (3803, 'شرع المتنزه'),
    (3814, 'ابو لبنان'),
    (3869, 'عكر شرقي'),
    (3871, 'شركة الوسيط'),
    (3879, 'عكر غربي'),
    (3881, 'منصوريه'),
    (3882, 'حي الامير'),
    (3885, 'الثوره'),
    (3887, 'العرجه'),
    (3891, 'مهيديه'),
    (3892, 'الطليعه'),
    (3894, 'الصخيين'),
    (3895, 'شموخ الاولى'),
    (3896, 'شموخ الثانيه'),
    (3897, 'زعيلات'),
    (3898, 'العلويه ام كامله'),
    (3899, 'الشريف'),
    (3901, 'الزهيريه'),
    (3905, 'الاداره المحليه'),
    (3906, 'الاسكان الصناعي'),
    (3907, 'ال بو عظم'),
    (3908, 'الزيتون'),
    (3909, 'المدينه المائيه'),
    (3910, 'ال بو فياض'),
    (3912, 'السكك محطه القطار'),
    (3913, 'البهو'),
    (3914, 'حي البشائر'),
    (3915, 'الزاويه'),
    (3916, 'ناحيه اور'),
    (3917, 'مدينه الصدر'),
    (3918, 'عمارت الولاده'),
    (3919, 'مدينه البكر'),
    (3923, 'ام الدود'),
    (3924, 'قريه عبد الرزاق'),
    (3925, 'عمارات المدينه'),
    (3926, 'العويجه'),
    (3928, 'قاعده الام علي'),
    (3929, 'اريدو'),
    (3933, 'الشيباني'),
    (3935, 'حي السكني الاول'),
    (3937, 'الشمامره'),
    (3940, 'اسواق بابا اشتريلي'),
    (3941, 'قريه العصريه'),
    (3944, 'دور الزراعه'),
    (3949, 'سومر الاولى'),
    (3950, 'سومر الثانيه'),
    (3955, 'بدرية'),
    (3959, 'الصالحيه'),
    (3967, 'سديناويه'),
    (3970, 'حي الزهراء'),
    (3971, 'حي الخضراء'),
    (3973, 'حي الرافدين'),
    (3974, 'ام حكروص'),
    (3976, 'ال نياز'),
    (3996, 'مزرعه'),
    (4049, 'جمبور'),
    (4135, 'قرية بيتاسى'),
    (4136, 'قرية طلوه'),
    (4137, 'قرية افريكى'),
    (4138, 'سلفر ستي'),
    (4139, 'اسيرو'),
    (4140, 'رونا ستي'),
    (4141, 'ديلوكس'),
    (4144, 'سلمان كيسته ى'),
    (4145, 'تل ايتيت'),
    (4146, 'ثقافة افريكي'),
    (4147, 'بير الماء'),
    (4148, 'نيولاند'),
    (4150, 'ايتيت رعاية'),
    (4153, 'المربع الذهبي'),
    (4156, 'بارز ستي'),
    (4157, 'ليلاف ستي'),
    (4158, 'لاوان ستي'),
    (4159, 'لمجمعات'),
    (4160, 'مشمش'),
    (4162, 'القريه السياحيه سد دهوك'),
    (4164, 'ماركت هلكت بامرني'),
    (4168, 'الفوق'),
    (4169, 'اسفنج'),
    (4171, 'بهار ستي'),
    (4173, 'نزاركي القرية'),
    (4174, 'نزاركي محاميا'),
    (4175, 'نزاركي الجديدة'),
    (4176, 'نزاركى القديمة'),
    (4177, 'معارض سيارات'),
    (4178, 'نزاركئ'),
    (4214, 'ضريبه'),
    (4216, 'گري صور'),
    (4217, 'گشتيار'),
    (4219, 'گفرگي'),
    (4223, 'صناعه مالطا'),
    (4224, 'جوازات القديمه'),
    (4253, 'شرفيه'),
    (4254, 'باقوفه'),
    (4255, 'تل لسقف'),
    (4256, 'بندوايه'),
    (4257, 'سريجكه'),
    (4259, 'حتاره'),
    (4260, 'كرماوه'),
    (4261, 'نسيريه'),
    (4262, 'جرحيه'),
    (4263, 'عين بقره'),
    (4264, 'شيخكا'),
    (4265, 'بيبان'),
    (4267, 'سيطرت الإقامة'),
    (4312, 'كري كةوري'),
    (4313, 'كمونة'),
    (4314, 'قرية سيجي'),
    (4316, 'خانكي'),
    (4317, 'مسيريكي'),
    (4318, 'سيميل'),
    (4319, 'شقق لولاف ستي'),
    (4320, 'قريه بازلان'),
    (4325, 'وار ستي'),
    (4326, 'ورافين ستي'),
    (4338, 'محلة كوجر'),
    (4339, 'محلة خستي'),
    (4340, 'محلة شيلي'),
    (4348, 'کراج شورش'),
    (4350, 'دورة كورك'),
    (4352, 'بارك نوروز'),
    (4358, 'بانوراما سنتر'),
    (4359, 'قوج سنتر'),
    (4361, 'مازي ماركت'),
    (4362, 'دوره حصان'),
    (4363, 'شققه كاتو'),
    (4365, 'كيار ستى'),
    (4366, 'شقق احمد خاني'),
    (4368, 'كرى باص'),
    (4370, 'شقق مازي لاند'),
    (4371, 'معهد دافنشي'),
    (4372, 'زوزان ستي'),
    (4374, 'شاخكئ'),
    (4375, 'زريلاند'),
    (4379, 'مسشفى ژيان'),
    (4381, 'شقيت مازي لاند'),
    (4388, 'كراند ليفل'),
    (4389, 'شاريا قديمه'),
    (4396, 'سرطنك'),
    (4397, 'كارفور'),
    (4398, 'دلبي'),
    (4401, 'حوشكي'),
    (4402, 'تناهي'),
    (4403, 'ارام ستي'),
    (4405, 'باشا ستي'),
    (4406, 'ميرسين تاور'),
    (4407, 'ساب سنتر'),
    (4408, 'كيڤلا'),
    (4412, 'شقق نوزين ستي'),
    (4414, 'محله دياري'),
    (4417, 'جمعيه بروشكي'),
    (4418, 'مهاباد'),
    (4419, 'ناعورا'),
    (4422, 'فرمانده'),
    (4423, 'صناعة معارض او بروشكي'),
    (4424, 'بروشكي محله قراجه'),
    (4425, 'محله قصابه'),
    (4426, 'محله كوجرا'),
    (4427, 'طوارئ بروشكي'),
    (4430, 'حي جزمه'),
    (4431, 'كلي بدري'),
    (4432, 'تلخش'),
    (4433, 'خرشنيا'),
    (4434, 'سينا'),
    (4435, 'كمبه شاريا'),
    (4436, 'وشتيان'),
    (4437, 'كاني كولان'),
    (4438, 'صالحيه'),
    (4439, 'قصارا'),
    (4441, 'كريباني'),
    (4442, 'رحمانيه'),
    (4443, 'نمريك'),
    (4446, 'قريه رزكاري'),
    (4447, 'كمبه فايدا'),
    (4448, 'كمبه كبرتو'),
    (4449, 'باختمي'),
    (4524, 'الشرقيه'),
    (4634, 'السنيدية'),
    (4651, 'الجديده نهر الحجيه'),
    (4674, 'حي اليرموك'),
    (4679, 'الابلة تقاطع النجدة'),
    (4680, 'الشعله'),
    (4685, 'كفركي'),
    (4701, 'حي نيسان'),
    (4702, 'كيارو شارع المشاتل'),
    (4709, 'قابلوات'),
    (4710, 'السريع'),
    (4712, 'خميسات'),
    (4713, 'مزرعة ابو هبة'),
    (4714, 'لالش'),
    (4715, 'حي العادل'),
    (4717, 'سي كركا'),
    (4719, 'حي شرطه تاخى رةزي'),
    (4732, 'السراي'),
    (4733, 'حي موسى الكاظم'),
    (4807, 'كيفلا'),
    (4808, 'كيري باص'),
    (4809, 'حي التاميم'),
    (4811, 'كري كوري'),
    (4812, 'شاخكي'),
    (4828, 'ايتيت شقق مسيحي'),
    (4833, 'بارك بارزان'),
    (4835, 'قسارا'),
    (4839, 'الحميدية'),
    (4844, 'جوري بازار'),
    (4851, 'دور الالمنيوم'),
    (4856, 'حديقه بارزان'),
    (4857, 'مالطا روز ستي'),
    (4859, 'حي الملاين'),
    (4860, 'المعهد التقني'),
    (4861, 'نادي الفروسيه'),
    (4864, 'تاج مول'),
    (4865, 'حي التحرير'),
    (4869, 'باجلور كلي'),
    (4877, 'جزيره البعساف'),
    (4879, 'خطوة الامام علي'),
    (4898, 'حي المدراء'),
    (4900, 'مالطا شارع الجوازات القديم'),
    (4901, 'القرنه - شلهه عكاب'),
    (4919, 'دوره ماموزين'),
    (4927, 'كه لي'),
    (4942, 'كفرك الجديد'),
    (5005, 'ئاكري'),
    (5012, 'زركا جامع صباح اتروشي'),
    (5017, 'شقق كايار'),
    (5027, 'مالطا قاعه اوسكار'),
    (5049, 'فايدا الجامع الكبير'),
    (5097, 'كري سور'),
    (5099, 'الموحية'),
    (5113, 'حديقه الحيوان'),
    (5114, 'صوب الشامية'),
    (5205, 'مالطا انور مايي'),
    (5213, 'كرو صيدليه هناسه'),
    (5216, 'ماسيك مرسين تاور'),
    (5225, 'اريا ستي'),
    (5233, 'سوك برا'),
    (5237, 'مالطا شاهان تاور'),
    (5238, 'برايم فيو تاور'),
    (5239, 'صناعه بروشكي'),
    (5240, 'بروشكي مطعم العزائم'),
    (5244, 'بروشكي بارك سرهلدان'),
    (5247, 'بروشكي سوق العصري'),
    (5248, 'ماربيلا'),
    (5253, 'مالطا بيل ستي'),
    (5255, 'زركا شارع ميدان'),
    (5288, 'افرو ستي تيرمنال')
  ) AS v(location_id, alias_ar)
  JOIN iraq_locations l ON l.id = v.location_id AND l.is_active
ON CONFLICT (location_id, alias_ar) DO NOTHING;

-- 4. Spelling variants customers write that the search key does not fold: ئ for ي (الملائين) and
--    ئ for ء inside a name whose row keeps the city prefix. Measured on the 266 real addresses
--    that could be touched (AMA, MOS, and BGD addresses with كفا/صح): 3 more resolve, none move,
--    none are lost. A blanket ئ→ي swap was tested and rejected: it breaks القائم and الجزائر.
INSERT INTO iraq_location_aliases (location_id, alias_ar, source)
SELECT v.location_id, v.alias_ar, 'learned'
  FROM (VALUES
    (2120, 'حي الملائين'),
    (1440, 'الكفاءات'),
    (5402, 'كفاءات الصحه')
  ) AS v(location_id, alias_ar)
  JOIN iraq_locations l ON l.id = v.location_id AND l.is_active
ON CONFLICT (location_id, alias_ar) DO NOTHING;
