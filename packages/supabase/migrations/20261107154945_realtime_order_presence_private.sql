-- "Who is viewing this order" ran on a public channel named presence:<orderId>,
-- so anyone holding an order id and the public key could see (or fake) which
-- staff had it open. The channel is now private: only members of the order's
-- own store may join or announce on it.
CREATE OR REPLACE FUNCTION public.realtime_order_presence_allowed(p_topic text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.orders o
     WHERE o.id = (substring(p_topic FROM '^presence:([0-9a-fA-F-]{36})$'))::uuid
       AND o.tenant_id IN (SELECT public.get_user_tenant_ids())
  );
$function$;

REVOKE EXECUTE ON FUNCTION public.realtime_order_presence_allowed(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.realtime_order_presence_allowed(text) TO authenticated;

CREATE POLICY order_presence_read ON realtime.messages
  FOR SELECT TO authenticated
  USING (realtime.topic() ~ '^presence:[0-9a-fA-F-]{36}$' AND public.realtime_order_presence_allowed(realtime.topic()));

CREATE POLICY order_presence_write ON realtime.messages
  FOR INSERT TO authenticated
  WITH CHECK (realtime.topic() ~ '^presence:[0-9a-fA-F-]{36}$' AND public.realtime_order_presence_allowed(realtime.topic()));
