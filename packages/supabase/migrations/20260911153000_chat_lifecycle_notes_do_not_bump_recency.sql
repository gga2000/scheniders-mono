-- Distinguish thread activity from thread bookkeeping.
--
-- Order activity (status_changed / assigned / delivered) is real activity and
-- must move the conversation up the list — that is why the touch trigger exists.
-- But 'thread_resolved' is the sweep filing the thread away, and letting that
-- note bump last_message_at shot every auto-closed thread straight back to the
-- top of the sidebar: precisely the noise the lifecycle exists to remove.

CREATE OR REPLACE FUNCTION public.chat_touch_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_was_resolved boolean;
    v_is_bookkeeping boolean;
BEGIN
    v_is_bookkeeping := NEW.is_system
        AND COALESCE(NEW.system_event->>'type', '') = 'thread_resolved';

    SELECT resolved_at IS NOT NULL INTO v_was_resolved
    FROM public.chat_conversations WHERE id = NEW.conversation_id;

    UPDATE public.chat_conversations
    SET last_message_at = CASE
            WHEN v_is_bookkeeping THEN last_message_at
            ELSE GREATEST(COALESCE(last_message_at, NEW.created_at), NEW.created_at)
        END,
        updated_at  = now(),
        -- A real person replying means the thread is live again.
        resolved_at = CASE WHEN NEW.is_system THEN resolved_at ELSE NULL END,
        resolved_by = CASE WHEN NEW.is_system THEN resolved_by ELSE NULL END,
        -- Un-archive too: a reply must surface the thread, not land in cold storage.
        archived_at = CASE WHEN NEW.is_system THEN archived_at ELSE NULL END
    WHERE id = NEW.conversation_id;

    -- Recursion terminates: this insert re-enters the trigger with is_system =
    -- true, and by then resolved_at is already NULL, so v_was_resolved is false.
    IF v_was_resolved AND NOT NEW.is_system THEN
        INSERT INTO public.chat_messages (conversation_id, tenant_id, sender_id, body, is_system, system_event)
        VALUES (NEW.conversation_id, NEW.tenant_id, NULL, '', true,
                jsonb_build_object('type', 'thread_reopened'));
    END IF;

    RETURN NEW;
END;
$$;

-- Repair rows an earlier sweep already bumped: recency is the newest message
-- that is not a lifecycle note.
UPDATE public.chat_conversations c
SET last_message_at = m.max_created
FROM (
    SELECT conversation_id, max(created_at) AS max_created
    FROM public.chat_messages
    WHERE NOT (is_system AND COALESCE(system_event->>'type', '') IN ('thread_resolved', 'thread_reopened'))
    GROUP BY conversation_id
) m
WHERE m.conversation_id = c.id
  AND c.kind = 'order'
  AND c.last_message_at IS DISTINCT FROM m.max_created;
