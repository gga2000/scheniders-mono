-- =============================================
-- CHAT PHASE 3: message edit history
-- =============================================
CREATE TABLE IF NOT EXISTS public.chat_message_edits (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
    prev_body  text NOT NULL,
    edited_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_message_edits_message_idx ON public.chat_message_edits (message_id, edited_at DESC);

ALTER TABLE public.chat_message_edits ENABLE ROW LEVEL SECURITY;
-- members of the message's conversation may read its edit history; no client writes (trigger-only)
CREATE POLICY chat_message_edits_member_read ON public.chat_message_edits
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM public.chat_messages m
        WHERE m.id = message_id AND public.chat_is_member(m.conversation_id)
    ));

-- capture the prior body on a real edit (not a soft-delete, not a system row)
CREATE OR REPLACE FUNCTION public.chat_capture_edit()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
    IF OLD.body IS DISTINCT FROM NEW.body
       AND OLD.deleted_at IS NULL
       AND COALESCE(OLD.is_system, false) = false THEN
        INSERT INTO public.chat_message_edits (message_id, prev_body) VALUES (OLD.id, OLD.body);
    END IF;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_chat_capture_edit ON public.chat_messages;
CREATE TRIGGER trg_chat_capture_edit
    BEFORE UPDATE OF body ON public.chat_messages
    FOR EACH ROW EXECUTE FUNCTION public.chat_capture_edit();
