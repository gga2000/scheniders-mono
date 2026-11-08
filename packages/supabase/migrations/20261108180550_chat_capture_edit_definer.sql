-- Editing a chat message never worked: this trigger saves the old text into
-- chat_message_edits as the editing user, and that table has no INSERT policy
-- (on purpose: history rows are written only by this trigger). Run it as the
-- owner. It only fires on an UPDATE that already passed chat_messages' own
-- rules (author, current member of the store and conversation).
CREATE OR REPLACE FUNCTION public.chat_capture_edit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF OLD.body IS DISTINCT FROM NEW.body
       AND OLD.deleted_at IS NULL
       AND COALESCE(OLD.is_system, false) = false THEN
        INSERT INTO public.chat_message_edits (message_id, prev_body) VALUES (OLD.id, OLD.body);
    END IF;
    RETURN NEW;
END; $function$;

REVOKE EXECUTE ON FUNCTION public.chat_capture_edit() FROM PUBLIC, anon, authenticated;