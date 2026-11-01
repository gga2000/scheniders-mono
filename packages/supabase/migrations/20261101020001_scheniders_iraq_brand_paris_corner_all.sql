-- scheniders-iraq: every perfume is labelled Paris Corner, including the ones
-- that carried a Paris Corner house name (merchant confirmed 2026-11-01).
-- Follows 20261101004623 (the 7 that had no brand). Each row is pinned to the
-- brand it had when this was written, so a label changed since then is kept
-- and re-running is a no-op. Supply items untouched.
UPDATE public.products p
SET brand = 'باريس كورنر',
    updated_at = now()
FROM (VALUES
  ('d4bebf52-07b9-4314-bc8d-bc06c62d0222'::uuid, 'أمير'),               -- إيلانيا
  ('fc20a9fa-3f26-46f2-898e-4ed72e9d2735'::uuid, 'أمير'),               -- ديلايت
  ('cdee984c-8905-45af-9217-4f638ef03f46'::uuid, 'أمير'),               -- ريتش ساندال
  ('25be4be2-89c4-48f6-9a4b-108dd6917746'::uuid, 'أمير'),               -- فايبرنت
  ('e6370a6f-f826-42bb-8e81-a1a8065003a0'::uuid, 'ايبيسكو'),            -- نيرفانا
  ('d236bd3f-c7cc-404e-8bf0-03d12e06903e'::uuid, 'دانيال رينيه'),       -- ميدنايت سن
  ('4ce602a7-9b4b-493f-8049-a5b01bc39482'::uuid, 'دولسورا'),            -- دولسورا
  ('4d23b558-8248-482f-b470-472687e74f89'::uuid, 'منستري أوف عود'),     -- عود ساتان
  ('4cf04d6b-1c56-4a37-9c3b-0cd09de20294'::uuid, 'منستري أوف غورماند'), -- كوكونت لاغون
  ('0b472c9b-6c23-4a5f-9c43-b96b74ccfff7'::uuid, 'موج')                 -- موسكو ميول
) AS v(id, old_brand)
WHERE p.tenant_id = 'b5c4f2d4-834f-4af4-822d-9b9826a8f45a'
  AND p.id = v.id
  AND p.brand = v.old_brand;
