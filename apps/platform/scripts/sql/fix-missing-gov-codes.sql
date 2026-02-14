-- Fix missing governorate_code for orders that have a recognizable city name
-- This fills in NULLs based on city name matching

-- Update orders where governorate_code is NULL but city matches known governorates
UPDATE orders 
SET governorate_code = CASE 
    -- Baghdad
    WHEN city ILIKE '%بغداد%' OR city ILIKE '%baghdad%' THEN 'BGD'
    -- Erbil
    WHEN city ILIKE '%أربيل%' OR city ILIKE '%اربيل%' OR city ILIKE '%erbil%' OR city ILIKE '%arbil%' OR city ILIKE '%hawler%' THEN 'ARB'
    -- Nineveh/Mosul
    WHEN city ILIKE '%نينوى%' OR city ILIKE '%موصل%' OR city ILIKE '%mosul%' OR city ILIKE '%nineveh%' THEN 'MOS'
    -- Kirkuk
    WHEN city ILIKE '%كركوك%' OR city ILIKE '%kirkuk%' THEN 'KRK'
    -- Basra
    WHEN city ILIKE '%بصرة%' OR city ILIKE '%basra%' THEN 'BAS'
    -- Najaf
    WHEN city ILIKE '%نجف%' OR city ILIKE '%najaf%' THEN 'NJF'
    -- Karbala
    WHEN city ILIKE '%كربلاء%' OR city ILIKE '%كربلا%' OR city ILIKE '%karbala%' THEN 'KRB'
    -- Dhi Qar/Nasiriyah
    WHEN city ILIKE '%ذي قار%' OR city ILIKE '%ناصرية%' OR city ILIKE '%الناصرية%' OR city ILIKE '%nasiriy%' THEN 'NAS'
    -- Babylon/Hilla
    WHEN city ILIKE '%بابل%' OR city ILIKE '%حلة%' OR city ILIKE '%الحلة%' OR city ILIKE '%babylon%' OR city ILIKE '%hilla%' THEN 'BBL'
    -- Wasit/Kut
    WHEN city ILIKE '%واسط%' OR city ILIKE '%كوت%' OR city ILIKE '%الكوت%' OR city ILIKE '%wasit%' OR city ILIKE '%kut%' THEN 'KOT'
    -- Diyala
    WHEN city ILIKE '%ديالى%' OR city ILIKE '%بعقوبة%' OR city ILIKE '%diyala%' THEN 'DYL'
    -- Sulaymaniyah
    WHEN city ILIKE '%سليمانية%' OR city ILIKE '%sulaymaniy%' OR city ILIKE '%slema%' THEN 'SAM'
    -- Duhok
    WHEN city ILIKE '%دهوك%' OR city ILIKE '%duhok%' OR city ILIKE '%dahuk%' THEN 'DOH'
    -- Saladin/Tikrit  
    WHEN city ILIKE '%صلاح الدين%' OR city ILIKE '%تكريت%' OR city ILIKE '%saladin%' OR city ILIKE '%tikrit%' THEN 'SAH'
    -- Anbar/Ramadi
    WHEN city ILIKE '%أنبار%' OR city ILIKE '%الانبار%' OR city ILIKE '%رمادي%' OR city ILIKE '%anbar%' OR city ILIKE '%ramadi%' THEN 'ANB'
    -- Muthanna/Samawah
    WHEN city ILIKE '%مثنى%' OR city ILIKE '%سماوة%' OR city ILIKE '%muthanna%' OR city ILIKE '%samawa%' THEN 'SMH'
    -- Qadisiyah/Diwaniyah
    WHEN city ILIKE '%قادسية%' OR city ILIKE '%ديوانية%' OR city ILIKE '%qadisiy%' OR city ILIKE '%diwaniy%' THEN 'DWN'
    -- Maysan/Amarah
    WHEN city ILIKE '%ميسان%' OR city ILIKE '%عمارة%' OR city ILIKE '%maysan%' OR city ILIKE '%amara%' THEN 'AMA'
    ELSE governorate_code
END
WHERE (governorate_code IS NULL OR governorate_code = '')
  AND city IS NOT NULL 
  AND city != '';

-- Show results
SELECT order_id, city, governorate_code 
FROM orders 
WHERE created_at >= '2025-12-28'
ORDER BY created_at DESC;
