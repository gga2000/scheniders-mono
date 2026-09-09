-- I18N-6: the same governorate was stored under two different codes, so any
-- report grouped by governorate split one province into two rows.
--
-- 521 live orders carried a legacy code duplicating one already in the canonical
-- set in lib/address-validator.ts. Each mapping was confirmed empirically rather
-- than inferred from the abbreviation: every legacy code had exactly one distinct
-- `city` value, and that Arabic name matched the canonical entry's nameAr
-- exactly. (QAD/DWN: the city is الديوانية, capital of القادسية — same province.)
--
-- Nothing writes these any more — no code path in the repo references them and
-- the newest affected order was 2025-12-19 — so this is a one-time cleanup, not
-- a compatibility shim.
--
-- Applied in batches rather than as one transaction: orders carries per-row
-- triggers (version bump, inventory, customer trust) and 13 statements at once
-- exceeded the statement timeout. The statements are idempotent, so re-running
-- this migration is a no-op.

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
UPDATE public.orders SET governorate_code = 'SMH' WHERE governorate_code = 'SUL';  -- السليمانية
