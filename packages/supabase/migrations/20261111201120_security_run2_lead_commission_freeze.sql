-- Security audit run 2: commission attribution is fixed at conversion.
--
-- Commission is paid to leads.assigned_to (else created_by) of a converted
-- lead. Lead PATCH and bulk assign let any console staff change assigned_to
-- after conversion, so a support_staff user could move an employee's
-- commission to themselves. Once a lead has converted_tenant_id, its owner,
-- creator, status and tenant no longer change, whichever route writes.

CREATE OR REPLACE FUNCTION public.leads_freeze_conversion_attribution()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF OLD.converted_tenant_id IS NOT NULL
       AND (NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
            OR NEW.created_by IS DISTINCT FROM OLD.created_by
            OR NEW.status IS DISTINCT FROM OLD.status
            OR NEW.converted_tenant_id IS DISTINCT FROM OLD.converted_tenant_id) THEN
        RAISE EXCEPTION 'This lead is already a store: its owner and status are locked'
            USING ERRCODE = 'P0001', HINT = 'LEAD_CONVERTED_LOCKED';
    END IF;
    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.leads_freeze_conversion_attribution() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_leads_freeze_conversion_attribution ON public.leads;
CREATE TRIGGER trg_leads_freeze_conversion_attribution
    BEFORE UPDATE ON public.leads
    FOR EACH ROW EXECUTE FUNCTION public.leads_freeze_conversion_attribution();
