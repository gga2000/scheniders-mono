-- Deleting leads keeps the ones that became shops.
--
-- admin_delete_leads (20261117080936) kept a lead with a prospect store but
-- deleted a converted one (converted_tenant_id set). Its conversion then left
-- every record that counts it: Lead numbers ("Became a shop", days from lead
-- to shop) and the Team board ("Converted") read converted leads from leads,
-- and the commission row's lead_id is ON DELETE SET NULL. One ticked old lead
-- in a bulk delete was enough to take a salesperson's conversion away.
--
-- Now a converted lead is never deleted either, and is named back on its own
-- list, so the console can say why it was kept: a converted lead is a shop,
-- even when it came from a prospect store.
--
-- Answers {removed: [{id, merchant_name}], kept_with_store: [merchant_name]
-- (a prospect store, not converted), kept_converted: [merchant_name]}.
-- Rows written as before. The service role only.

CREATE OR REPLACE FUNCTION public.admin_delete_leads(
    _lead_ids uuid[],
    _admin_user_id uuid,
    _actor_email text,
    _bulk boolean
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
    _removed jsonb;
    _kept jsonb;
    _converted jsonb;
BEGIN
    IF _lead_ids IS NULL OR cardinality(_lead_ids) = 0 OR _bulk IS NULL THEN
        RAISE EXCEPTION 'lead ids and _bulk are required' USING ERRCODE = '22023';
    END IF;

    WITH gone AS (
        DELETE FROM public.leads l
         WHERE l.id = ANY (_lead_ids)
           AND l.prospect_tenant_id IS NULL
           AND l.converted_tenant_id IS NULL
        RETURNING l.id, l.merchant_name
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'merchant_name', g.merchant_name) ORDER BY g.merchant_name, g.id), '[]'::jsonb)
      INTO _removed
      FROM gone g;

    SELECT coalesce(jsonb_agg(l.merchant_name ORDER BY l.merchant_name) FILTER (WHERE l.converted_tenant_id IS NULL), '[]'::jsonb),
           coalesce(jsonb_agg(l.merchant_name ORDER BY l.merchant_name) FILTER (WHERE l.converted_tenant_id IS NOT NULL), '[]'::jsonb)
      INTO _kept, _converted
      FROM public.leads l
     WHERE l.id = ANY (_lead_ids)
       AND (l.prospect_tenant_id IS NOT NULL OR l.converted_tenant_id IS NOT NULL);

    IF jsonb_array_length(_removed) > 0 THEN
        IF _bulk THEN
            INSERT INTO public.admin_activity_logs (admin_user_id, actor_email, action, details)
            VALUES (
                _admin_user_id, _actor_email, 'bulk_leads',
                jsonb_build_object('action', 'delete', 'changed', jsonb_array_length(_removed), 'leads', _removed)
            );
        ELSE
            INSERT INTO public.admin_activity_logs (admin_user_id, actor_email, action, details)
            SELECT _admin_user_id, _actor_email, 'delete_lead',
                   jsonb_build_object('lead_id', r ->> 'id', 'merchant_name', r ->> 'merchant_name')
              FROM jsonb_array_elements(_removed) AS r;
        END IF;
    END IF;

    RETURN jsonb_build_object('removed', _removed, 'kept_with_store', _kept, 'kept_converted', _converted);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_delete_leads(uuid[], uuid, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_leads(uuid[], uuid, text, boolean) TO service_role;
