-- payroll-pdfs: access needs a tenant admin of the payroll record's tenant
-- (2026-10-20).
--
-- FIXES  cross-tenant payslip access via the global user_profiles.role
--        (raised with NEW-P1-09 / signup review; related ledger SEC-09).
--
-- WHY (live storage.objects policy, 2026-10-20)
--   "Admins can manage payroll pdfs"  FOR ALL TO public
--     USING / WITH CHECK  bucket_id = 'payroll-pdfs'
--       AND EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
--   user_profiles.role is global, and self-serve signup gives every new account
--   role 'admin'. Anyone who signs up can therefore list, read, overwrite or
--   delete every tenant's payslip PDFs (salary, deductions, employee names).
--
-- PATH CONVENTION (apps/platform/hooks/use-payroll.ts runPayroll)
--   <payroll_records.id>.pdf at the bucket root, uploaded with upsert: true
--   right after the payroll_records row is inserted, then read back with
--   createSignedUrl (SELECT). Live: the bucket holds 0 objects today.
--
-- WHAT THIS CHANGES
--   * public.payroll_pdf_accessible(name): SECURITY DEFINER boolean; TRUE only
--     when name is '<uuid>.pdf', that payroll_records row exists, and the
--     caller is_tenant_admin() of its tenant. Matches the admin-only writes
--     already on payroll_records (20261019100100).
--   * The old policy is replaced by one FOR ALL TO authenticated policy using
--     that helper for USING and WITH CHECK. anon gets nothing.
--
-- ROLLBACK
--   DROP POLICY payroll_pdfs_tenant_admin_all ON storage.objects;
--   recreate "Admins can manage payroll pdfs" as quoted above;
--   DROP FUNCTION public.payroll_pdf_accessible(text);

CREATE OR REPLACE FUNCTION public.payroll_pdf_accessible(p_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_tenant uuid;
BEGIN
    IF auth.uid() IS NULL
       OR p_name !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\.pdf$' THEN
        RETURN false;
    END IF;
    SELECT pr.tenant_id INTO v_tenant
      FROM public.payroll_records pr
     WHERE pr.id = left(p_name, 36)::uuid;
    RETURN v_tenant IS NOT NULL AND public.is_tenant_admin(v_tenant);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.payroll_pdf_accessible(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.payroll_pdf_accessible(text) TO authenticated, service_role;

DROP POLICY IF EXISTS "Admins can manage payroll pdfs" ON storage.objects;
DROP POLICY IF EXISTS payroll_pdfs_tenant_admin_all ON storage.objects;
CREATE POLICY payroll_pdfs_tenant_admin_all ON storage.objects
    FOR ALL TO authenticated
    USING (bucket_id = 'payroll-pdfs' AND public.payroll_pdf_accessible(name))
    WITH CHECK (bucket_id = 'payroll-pdfs' AND public.payroll_pdf_accessible(name));
