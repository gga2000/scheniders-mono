-- =============================================================================
-- P1 DB security holes: storage.objects policies NOT YET APPLIED to production
-- =============================================================================
--
-- These are part 2 of 20261025173134_storage_product_images_qc_evidence_tenant_writes
-- and of 20261025173244_payroll_pdfs_tenant_admin_only. Their part 1 (the
-- helpers storage_object_writable / payroll_pdf_accessible and the qc-evidence
-- bucket limits) is live. These two parts failed on 2026-10-25 with
--   42501 must be owner of table objects
-- because storage.objects is owned by supabase_storage_admin and the migration
-- role (postgres) is not a member of it. They are kept out of migrations/ so a
-- db push does not fail on them; they must be applied by the table owner
-- (dashboard Storage > Policies, or Supabase support), then moved into
-- migrations/ with the timestamp they were applied at.
-- The local test (p1_db_security_holes.sql) runs them as a superuser.
-- =============================================================================

BEGIN;

-- storage_product_images_qc_evidence_tenant_writes part 2 of 2: product-images and
-- qc-evidence writes scoped to the owning tenant. NOT APPLIED: storage.objects is owned
-- by supabase_storage_admin, so postgres (the migration role) gets 42501 "must be
-- owner of table objects". Apply as the table owner.
-- lock_timeout: fail fast rather than queue live traffic behind the storage.objects lock.
SET LOCAL lock_timeout = '3s';

-- product-images: the three TO public write policies become tenant-scoped
-- policies TO authenticated (renamed in place; same commands).
ALTER POLICY "Allow Uploads to Product Images" ON storage.objects RENAME TO product_images_tenant_insert;
ALTER POLICY product_images_tenant_insert ON storage.objects
    TO authenticated
    WITH CHECK (
        bucket_id = 'product-images'
        AND public.storage_object_writable(bucket_id, name, owner_id)
    );

ALTER POLICY "Allow Updates to Product Images" ON storage.objects RENAME TO product_images_tenant_update;
ALTER POLICY product_images_tenant_update ON storage.objects
    TO authenticated
    USING (
        bucket_id = 'product-images'
        AND public.storage_object_writable(bucket_id, name, owner_id)
    )
    WITH CHECK (
        bucket_id = 'product-images'
        AND public.storage_object_writable(bucket_id, name, owner_id)
    );

ALTER POLICY "Allow Deletions for Product Images" ON storage.objects RENAME TO product_images_tenant_delete;
ALTER POLICY product_images_tenant_delete ON storage.objects
    TO authenticated
    USING (
        bucket_id = 'product-images'
        AND public.storage_object_writable(bucket_id, name, owner_id)
    );

-- qc-evidence: same, for the upload and delete policies.
ALTER POLICY "Authenticated upload to qc-evidence" ON storage.objects RENAME TO qc_evidence_tenant_insert;
ALTER POLICY qc_evidence_tenant_insert ON storage.objects
    TO authenticated
    WITH CHECK (
        bucket_id = 'qc-evidence'
        AND public.storage_object_writable(bucket_id, name, owner_id)
    );

ALTER POLICY "Authenticated delete qc-evidence" ON storage.objects RENAME TO qc_evidence_tenant_delete;
ALTER POLICY qc_evidence_tenant_delete ON storage.objects
    TO authenticated
    USING (
        bucket_id = 'qc-evidence'
        AND public.storage_object_writable(bucket_id, name, owner_id)
    );

-- payroll_pdfs_tenant_admin_only part 2 of 2: payroll-pdfs for the payroll record's tenant
-- admin only. NOT APPLIED: needs the storage.objects owner (supabase_storage_admin).
-- lock_timeout: fail fast rather than queue live traffic behind the storage.objects lock.
SET LOCAL lock_timeout = '3s';

-- The old global-admin policy is renamed in place and narrowed (same FOR ALL).
ALTER POLICY "Admins can manage payroll pdfs" ON storage.objects RENAME TO payroll_pdfs_tenant_admin_all;
ALTER POLICY payroll_pdfs_tenant_admin_all ON storage.objects
    TO authenticated
    USING (bucket_id = 'payroll-pdfs' AND public.payroll_pdf_accessible(name))
    WITH CHECK (bucket_id = 'payroll-pdfs' AND public.payroll_pdf_accessible(name));

COMMIT;
