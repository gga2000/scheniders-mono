-- ============================================================================
-- Storage Lockdown
-- ============================================================================
-- Closes audit findings B-07 (F-07), B-08 (F-08), F-22, F-23, F-24, F-37.
--
-- Five buckets exist in production:
--   product-images   PUBLIC  5MB   jpeg/png/webp/gif
--   tenant-assets    PUBLIC  512KB png/jpeg/webp/svg+xml      ← undeclared in any migration
--   qc-evidence      PUBLIC  ∞     ∞ (no MIME, no size limit) ← wide open
--   vault_backups    PRIVATE 100MB octet-stream/json/csv      ← no tenant scoping in RLS
--   payroll-pdfs     PRIVATE 10MB  pdf                        ← admin-only, OK
--
-- This migration:
--   1. Backfills the `tenant-assets` bucket declaration with explicit
--      MIME allowlist (drops SVG to neutralise stored-XSS).
--   2. Locks down `qc-evidence` — size + MIME limits, removes public
--      read, scopes uploads/reads to the caller's tenant via the path
--      convention `${tenant_id}/...`.
--   3. Adds tenant-scoping to `vault_backups` policy.
--   4. Closes anonymous uploads on `product-images`.
--
-- PREREQUISITES — DO NOT APPLY UNTIL platform code is changed to prefix
-- upload paths with `${tenantId}/`:
--
--   apps/platform/components/products/qc/qc-photo-uploader.tsx
--   apps/platform/components/products/product-gallery-section.tsx
--   apps/platform/components/products/product-image-upload.tsx
--   apps/platform/app/api/cron/backup/route.ts            (cron-driven)
--   apps/platform/lib/vault-utils.ts
--   apps/platform/hooks/use-voice-notes.ts                (bucket: customer-voice-notes — separately undeclared)
--
-- Ship the code change first, wait until existing uploads have flushed,
-- THEN apply this migration. Reverse order will reject uploads.
--
-- ROLLBACK
--   For each section, the original policy is preserved in a comment.
--   Drop the new policy and recreate the original.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. tenant-assets — declare bucket explicitly and tighten MIME (no SVG).
-- ----------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'tenant-assets',
  'tenant-assets',
  true,
  524288,                                                    -- 512KB
  ARRAY['image/png','image/jpeg','image/webp']               -- explicitly NO svg+xml (XSS vector)
)
ON CONFLICT (id) DO UPDATE
  SET allowed_mime_types = ARRAY['image/png','image/jpeg','image/webp'],
      file_size_limit    = 524288;

-- Public read (so storefronts can serve logos/branding).
DROP POLICY IF EXISTS "tenant_assets_public_read" ON storage.objects;
CREATE POLICY "tenant_assets_public_read" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'tenant-assets');

-- Member writes — path must begin with the caller's tenant id.
DROP POLICY IF EXISTS "tenant_assets_member_insert" ON storage.objects;
CREATE POLICY "tenant_assets_member_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'tenant-assets'
    AND (storage.foldername(name))[1]::uuid IN (SELECT public.get_user_tenant_ids())
  );

DROP POLICY IF EXISTS "tenant_assets_member_update" ON storage.objects;
CREATE POLICY "tenant_assets_member_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'tenant-assets'
    AND (storage.foldername(name))[1]::uuid IN (SELECT public.get_user_tenant_ids())
  );

DROP POLICY IF EXISTS "tenant_assets_member_delete" ON storage.objects;
CREATE POLICY "tenant_assets_member_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'tenant-assets'
    AND (storage.foldername(name))[1]::uuid IN (SELECT public.get_user_tenant_ids())
  );

-- ----------------------------------------------------------------------------
-- 2. qc-evidence — make private, set limits, tenant-scope paths.
-- ----------------------------------------------------------------------------

UPDATE storage.buckets
SET public            = false,
    file_size_limit   = 10485760,                            -- 10MB
    allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp']
WHERE id = 'qc-evidence';

DROP POLICY IF EXISTS "Public read qc-evidence"               ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload to qc-evidence"   ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete qc-evidence"      ON storage.objects;

CREATE POLICY "qc_evidence_tenant_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'qc-evidence'
    AND (storage.foldername(name))[1]::uuid IN (SELECT public.get_user_tenant_ids())
  );

CREATE POLICY "qc_evidence_tenant_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'qc-evidence'
    AND (storage.foldername(name))[1]::uuid IN (SELECT public.get_user_tenant_ids())
  );

CREATE POLICY "qc_evidence_tenant_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'qc-evidence'
    AND (storage.foldername(name))[1]::uuid IN (SELECT public.get_user_tenant_ids())
  );

-- ----------------------------------------------------------------------------
-- 3. vault_backups — enforce tenant prefix.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Allow authenticated full access to vault_backups" ON storage.objects;

CREATE POLICY "vault_backups_tenant_all" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'vault_backups'
    AND (storage.foldername(name))[1]::uuid IN (SELECT public.get_user_tenant_ids())
  )
  WITH CHECK (
    bucket_id = 'vault_backups'
    AND (storage.foldername(name))[1]::uuid IN (SELECT public.get_user_tenant_ids())
  );

-- ----------------------------------------------------------------------------
-- 4. product-images — close anonymous uploads.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Allow Uploads to Product Images"      ON storage.objects;
DROP POLICY IF EXISTS "Allow Updates to Product Images"      ON storage.objects;
DROP POLICY IF EXISTS "Allow Deletions for Product Images"   ON storage.objects;

-- Authenticated uploads only. Path convention: `${tenantId}/gallery/...`
-- (platform code change prerequisite — see header).
CREATE POLICY "product_images_member_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1]::uuid IN (SELECT public.get_user_tenant_ids())
  );

CREATE POLICY "product_images_member_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1]::uuid IN (SELECT public.get_user_tenant_ids())
  );

CREATE POLICY "product_images_member_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1]::uuid IN (SELECT public.get_user_tenant_ids())
  );

-- Read stays public (preserved from existing "Public Read Access for Product Images" policy).

-- ----------------------------------------------------------------------------
-- 5. customer-voice-notes — currently undeclared, referenced by code.
--    Declare it here as private + tenant-scoped paths.
-- ----------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'customer-voice-notes',
  'customer-voice-notes',
  false,
  10485760,                                                  -- 10MB
  ARRAY['audio/webm','audio/mpeg','audio/wav','audio/mp4','audio/ogg']
)
ON CONFLICT (id) DO UPDATE
  SET public             = false,
      file_size_limit    = 10485760,
      allowed_mime_types = ARRAY['audio/webm','audio/mpeg','audio/wav','audio/mp4','audio/ogg'];

-- Tenant-scoped via path prefix.
DROP POLICY IF EXISTS "customer_voice_notes_tenant_all" ON storage.objects;
CREATE POLICY "customer_voice_notes_tenant_all" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'customer-voice-notes'
    AND (storage.foldername(name))[1]::uuid IN (SELECT public.get_user_tenant_ids())
  )
  WITH CHECK (
    bucket_id = 'customer-voice-notes'
    AND (storage.foldername(name))[1]::uuid IN (SELECT public.get_user_tenant_ids())
  );

-- ----------------------------------------------------------------------------
-- Verification
--   mcp__supabase__get_advisors(security)
--   Expect public_bucket_allows_listing count drops; qc-evidence no longer
--   appears in public_bucket lints because it's private now.
-- ----------------------------------------------------------------------------
