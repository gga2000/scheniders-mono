-- payroll_pdfs_tenant_admin_only part 2 of 2. Production already runs this
-- policy (it was changed outside migrations); this file makes a fresh build
-- match it. A payslip PDF is reachable only by an active admin of the tenant
-- that owns payroll_records.id = <name>; the old global user_profiles.role
-- check let any signed-up account manage every tenant's payslips.
DROP POLICY IF EXISTS "Admins can manage payroll pdfs" ON storage.objects;
CREATE POLICY "Admins can manage payroll pdfs"
    ON storage.objects FOR ALL
    TO authenticated
    USING (bucket_id = 'payroll-pdfs' AND public.payroll_pdf_accessible(name))
    WITH CHECK (bucket_id = 'payroll-pdfs' AND public.payroll_pdf_accessible(name));
