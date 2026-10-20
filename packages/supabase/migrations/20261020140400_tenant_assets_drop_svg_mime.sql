-- tenant-assets: stop accepting SVG uploads (2026-10-20).
--
-- FIXES  F-24 (prod-readiness; REGRESSION.md D-07 "SVG half still open").
--
-- WHY
-- tenant-assets is a PUBLIC bucket served from the Supabase storage origin and
-- live allowed_mime_types includes image/svg+xml. Any tenant member can upload
-- an SVG with inline <script>; opening its public URL runs the script in the
-- storage origin (stored XSS, phishing pages under a trusted host). Tenant
-- logos, brand-kit images and onboarding uploads work as PNG/JPEG/WebP.
--
-- WHAT THIS CHANGES
--   allowed_mime_types becomes png/jpeg/webp; the 512 KB size limit and the
--   existing tenant-prefixed write policies are unchanged.
--   The 39 SVG objects already in the bucket (counted live 2026-10-20, all
--   under store-templates/, platform-authored assets that
--   lib/store-templates/scheniders-signature.ts links to) are NOT deleted or
--   rewritten here: removing them would break the template. They stay
--   readable. No code uploads into store-templates/ (grep), so the MIME change
--   does not block a seeding path; re-uploading those SVGs later would need a
--   temporary MIME change or PNG versions.
--   The business-settings logo picker stops offering SVG in the same change.
--
-- ROLLBACK
--   UPDATE storage.buckets
--      SET allowed_mime_types = ARRAY['image/png','image/jpeg','image/webp','image/svg+xml']
--    WHERE id = 'tenant-assets';

UPDATE storage.buckets
   SET allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp']
 WHERE id = 'tenant-assets';
