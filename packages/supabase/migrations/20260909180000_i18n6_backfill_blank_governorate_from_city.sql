-- I18N-6 (continued): 1,010 live orders had no governorate_code at all, while
-- their `city` in almost every case *is* the governorate's Arabic name. 905 were
-- recovered from it.
--
-- Matching goes through normalize_arabic_text_for_search so spelling variants
-- resolve too — البصره matches البصرة, which a literal comparison would miss.
--
-- Applied in chunks rather than one statement: `orders` carries per-row triggers
-- (version bump, inventory, customer trust) and a 398-row update exceeded the
-- statement timeout. Idempotent — re-running touches nothing, because it only
-- ever fills rows whose code is still blank.
--
-- 105 rows remain unresolved and are deliberately left alone: 72 have no city at
-- all, and the rest name something that is not a governorate. Guessing those
-- would be worse than leaving them blank.

WITH canon(code, name_ar) AS (VALUES
  ('BGD','بغداد'),('BAS','البصرة'),('NJF','النجف'),('KRB','كربلاء'),('ANB','الأنبار'),
  ('DYL','ديالى'),('NAS','ذي قار'),('KRK','كركوك'),('BBL','بابل'),('ARB','أربيل'),
  ('SAH','صلاح الدين'),('AMA','ميسان'),('MOS','نينوى'),('KOT','واسط'),('DWN','القادسية'),
  ('SAM','المثنى'),('DOH','دهوك'),('SMH','السليمانية'))
UPDATE public.orders o
   SET governorate_code = c.code
  FROM canon c
 WHERE o.deleted_at IS NULL
   AND coalesce(o.governorate_code, '') = ''
   AND normalize_arabic_text_for_search(o.city) = normalize_arabic_text_for_search(c.name_ar);
