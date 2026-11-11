-- The trial banner and the billing page counted trial orders with a direct
-- orders query filtered on till_session_id, a column the authenticated role
-- may not read, so PostgREST answered 403 and the count never showed. This
-- counts with the database's own billing rule (order_is_billable) for a store
-- the caller is an active member of.

CREATE OR REPLACE FUNCTION public.trial_order_count(p_tenant_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_tenant_id IS NULL OR p_tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT count(*)::integer INTO v_count
    FROM public.orders o
   WHERE o.tenant_id = p_tenant_id
     AND public.order_is_billable(o);
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.trial_order_count(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trial_order_count(uuid) TO authenticated;
