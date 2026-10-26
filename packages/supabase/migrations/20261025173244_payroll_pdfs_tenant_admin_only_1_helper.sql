-- payroll_pdfs_tenant_admin_only part 1 of 2 (header and rollback notes:
-- packages/supabase/tests/p1_db_security_holes.sql): the payroll-pdfs access helper.
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
