-- Seed a default public #general channel per tenant, with all active members,
-- so the chat drawer has content on first open. Also auto-join future members.

-- Create a public #general channel for every existing tenant, with all active members.
INSERT INTO public.chat_conversations (tenant_id, kind, name, is_private, created_by)
SELECT t.id, 'channel', 'general', false, NULL
FROM public.tenants t
WHERE NOT EXISTS (
    SELECT 1 FROM public.chat_conversations c WHERE c.tenant_id = t.id AND c.kind = 'channel' AND c.name = 'general'
);

INSERT INTO public.chat_members (conversation_id, user_id, role)
SELECT c.id, tm.user_id, 'member'
FROM public.chat_conversations c
JOIN public.tenant_members tm ON tm.tenant_id = c.tenant_id AND tm.status = 'active'
WHERE c.kind = 'channel' AND c.name = 'general'
ON CONFLICT (conversation_id, user_id) DO NOTHING;

-- Auto-add new tenant members to their tenant's #general going forward.
CREATE OR REPLACE FUNCTION public.chat_add_member_to_general()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_general uuid;
BEGIN
    IF NEW.status = 'active' THEN
        SELECT id INTO v_general FROM public.chat_conversations
        WHERE tenant_id = NEW.tenant_id AND kind = 'channel' AND name = 'general' LIMIT 1;
        IF v_general IS NOT NULL THEN
            INSERT INTO public.chat_members (conversation_id, user_id, role)
            VALUES (v_general, NEW.user_id, 'member') ON CONFLICT DO NOTHING;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_chat_add_member_to_general ON public.tenant_members;
CREATE TRIGGER trg_chat_add_member_to_general
    AFTER INSERT OR UPDATE OF status ON public.tenant_members
    FOR EACH ROW EXECUTE FUNCTION public.chat_add_member_to_general();

-- Revoke the default PUBLIC/anon EXECUTE grant on the trigger function (consistent with
-- the rest of the chat hardening). Trigger functions fire without an EXECUTE grant, so no GRANT.
REVOKE EXECUTE ON FUNCTION public.chat_add_member_to_general() FROM PUBLIC, anon;
