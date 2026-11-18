-- Deleting leads writes its staff log row in the same transaction.
--
-- A deleted lead takes its history (activities, follow-ups, notes) with it:
-- the staff log row is all that says who deleted which business. The console
-- deleted the lead in one request and wrote that row in a second one. When
-- the second failed (a lost connection, the function timing out) the lead was
-- gone with no trace of who removed it; the console only told Sentry.
--
-- admin_delete_leads deletes the leads asked for, except a lead with a
-- prospect store (its store would stay online with the business's details and
-- no screen could find it again: the same rule the route had, in the delete
-- itself), and writes the rows in the same transaction:
--   * one lead from its own page: 'delete_lead' {lead_id, merchant_name};
--   * ticked leads (_bulk): one 'bulk_leads' {action: 'delete', changed,
--     leads: [{id, merchant_name}]}.
-- The rows are as the routes wrote them, so the Activity page reads them as
-- before. Nothing deleted, no row.
--
-- Answers {removed: [{id, merchant_name}], kept_with_store: [merchant_name]}.
-- The service role only.

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
BEGIN
    IF _lead_ids IS NULL OR cardinality(_lead_ids) = 0 OR _bulk IS NULL THEN
        RAISE EXCEPTION 'lead ids and _bulk are required' USING ERRCODE = '22023';
    END IF;

    WITH gone AS (
        DELETE FROM public.leads l
         WHERE l.id = ANY (_lead_ids)
           AND l.prospect_tenant_id IS NULL
        RETURNING l.id, l.merchant_name
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'merchant_name', g.merchant_name) ORDER BY g.merchant_name, g.id), '[]'::jsonb)
      INTO _removed
      FROM gone g;

    SELECT coalesce(jsonb_agg(l.merchant_name ORDER BY l.merchant_name), '[]'::jsonb)
      INTO _kept
      FROM public.leads l
     WHERE l.id = ANY (_lead_ids)
       AND l.prospect_tenant_id IS NOT NULL;

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

    RETURN jsonb_build_object('removed', _removed, 'kept_with_store', _kept);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_delete_leads(uuid[], uuid, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_leads(uuid[], uuid, text, boolean) TO service_role;
