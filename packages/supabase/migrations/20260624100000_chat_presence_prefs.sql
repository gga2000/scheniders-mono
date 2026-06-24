-- CHAT PHASE 6A-db: status presets / DND / notification prefs
-- (drafted; apply when the Supabase MCP is stable)
ALTER TABLE public.chat_user_status ADD COLUMN IF NOT EXISTS preset text;
ALTER TABLE public.chat_user_status ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE public.chat_user_status ADD COLUMN IF NOT EXISTS dnd boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.chat_notification_prefs (
    user_id    uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    tenant_id  uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    kind       text NOT NULL CHECK (kind IN ('channel','dm','group','order')),
    level      text NOT NULL DEFAULT 'all' CHECK (level IN ('all','mentions','none')),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, tenant_id, kind)
);
ALTER TABLE public.chat_notification_prefs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chat_notification_prefs_self ON public.chat_notification_prefs;
CREATE POLICY chat_notification_prefs_self ON public.chat_notification_prefs
    FOR ALL USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid() AND tenant_id IN (SELECT get_user_tenant_ids()));

-- mark-all-read RPC (caller's own memberships only)
CREATE OR REPLACE FUNCTION public.chat_mark_all_read()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
    UPDATE public.chat_members SET last_read_at = now() WHERE user_id = auth.uid();
$$;
REVOKE EXECUTE ON FUNCTION public.chat_mark_all_read() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.chat_mark_all_read() TO authenticated;
