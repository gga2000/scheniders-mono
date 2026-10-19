-- harden: tenant-scope chat_mark_all_read (was applied without the tenant filter)
CREATE OR REPLACE FUNCTION public.chat_mark_all_read()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
    UPDATE public.chat_members cm
    SET    last_read_at = now()
    FROM   public.chat_conversations cc
    WHERE  cm.conversation_id = cc.id
      AND  cm.user_id         = auth.uid()
      AND  cc.tenant_id       IN (SELECT get_user_tenant_ids());
$$;
REVOKE EXECUTE ON FUNCTION public.chat_mark_all_read() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.chat_mark_all_read() TO authenticated;;
