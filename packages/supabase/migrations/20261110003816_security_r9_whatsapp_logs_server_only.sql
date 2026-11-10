-- Security round 9 (R7-01): whatsapp_logs drives wallet charges and the
-- platform "Interakt empty" alert, so only server code (service role) writes
-- it. Staff keep read access to their own store's rows.
REVOKE INSERT, UPDATE, DELETE ON public.whatsapp_logs FROM anon, authenticated;
DROP POLICY IF EXISTS tenant_isolation_insert ON public.whatsapp_logs;
DROP POLICY IF EXISTS tenant_isolation_update ON public.whatsapp_logs;
DROP POLICY IF EXISTS tenant_isolation_delete ON public.whatsapp_logs;
DROP POLICY IF EXISTS whatsapp_logs_role_insert ON public.whatsapp_logs;
