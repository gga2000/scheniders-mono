-- I18N-6: the same governorate was stored under two different codes, so every
-- report grouped by governorate split one province into two rows.
--
-- 521 live orders carry a legacy code that duplicates one already in the
-- canonical set in lib/address-validator.ts. Each mapping below was confirmed
-- empirically rather than inferred from the abbreviation: every legacy code has
-- exactly one distinct `city` value in the data, and that Arabic name matches
-- the canonical entry's nameAr exactly. (QAD/DWN: the city is الديوانية, the
-- capital of القادسية — the same governorate.)
--
-- Nothing writes these any more: no code path in the repo references them, and
-- the newest affected order is 2025-12-19. This is a one-time cleanup, not an
-- ongoing compatibility shim.

UPDATE public.orders SET governorate_code = 'BAS' WHERE governorate_code = 'BSR';  -- البصرة
UPDATE public.orders SET governorate_code = 'MOS' WHERE governorate_code = 'NNV';  -- نينوى
UPDATE public.orders SET governorate_code = 'SAH' WHERE governorate_code = 'SLD';  -- صلاح الدين
UPDATE public.orders SET governorate_code = 'ARB' WHERE governorate_code = 'ERB';  -- أربيل
UPDATE public.orders SET governorate_code = 'AMA' WHERE governorate_code = 'MSN';  -- ميسان
UPDATE public.orders SET governorate_code = 'KRK' WHERE governorate_code = 'KIR';  -- كركوك
UPDATE public.orders SET governorate_code = 'NAS' WHERE governorate_code = 'DQR';  -- ذي قار
UPDATE public.orders SET governorate_code = 'DYL' WHERE governorate_code = 'DLY';  -- ديالى
UPDATE public.orders SET governorate_code = 'DWN' WHERE governorate_code = 'QAD';  -- القادسية / الديوانية
UPDATE public.orders SET governorate_code = 'KOT' WHERE governorate_code = 'WST';  -- واسط
UPDATE public.orders SET governorate_code = 'SAM' WHERE governorate_code = 'MTH';  -- المثنى
UPDATE public.orders SET governorate_code = 'DOH' WHERE governorate_code = 'DHK';  -- دهوك
UPDATE public.orders SET governorate_code = 'SMH' WHERE governorate_code = 'SUL';  -- السليمانية;
