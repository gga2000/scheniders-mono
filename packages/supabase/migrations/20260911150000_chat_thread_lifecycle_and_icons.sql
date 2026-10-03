-- Order-thread lifecycle (auto-resolve / auto-archive / reopen) + channel icons
--
-- WHY A LIFECYCLE AND NOT A TIMER
--
-- An order thread is a ticket, not a chat room. At ~10 order problems a day that
-- is a few thousand threads a year — trivial for Postgres to store, but a
-- sidebar nobody can read. The scarce resource is attention, not disk, so the
-- design is the one help desks converged on (Zendesk "solve", Intercom "close",
-- Linear "auto-close"): a two-stage lifecycle, never a delete.
--
--   stage 1  RESOLVE   quiet for `auto_resolve_hours`  → resolved_at set.
--                      Still listed, still searchable, fully reversible.
--   stage 2  ARCHIVE   resolved for `auto_archive_days` → archived_at set.
--                      Leaves the working list for the Archived section.
--
-- Three rules make it safe rather than merely tidy:
--
--   * REOPEN ON REPLY. A human message on a resolved thread clears resolved_at.
--     Without this people reply into a dead thread and nobody is looking.
--   * DON'T CLOSE LIVE WORK. Silence on an order that is still confirmed or
--     in_transit does not mean the problem is handled, so stage 1 normally waits
--     for the ORDER to reach a terminal status. `stale_days` is the backstop so
--     an abandoned thread cannot stay open forever.
--   * IT IS AUDITABLE. Every automatic transition posts a system event into the
--     thread, so "who closed this?" always has an answer.
--
-- The policy is data (app_settings, per tenant) rather than code, so the hours
-- can be tuned without a migration. The sweeps are incremental and bounded, and
-- read through partial indexes covering only unresolved / unarchived rows, so
-- cost tracks the number of threads coming due — not the size of the table.

-- ---------------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------------

-- Who resolved it. NULL with resolved_at set = resolved by the automatic sweep.
ALTER TABLE public.chat_conversations
    ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Optional glyph for a channel, chosen from a fixed allow-list in the UI.
ALTER TABLE public.chat_conversations
    ADD COLUMN IF NOT EXISTS icon text;

ALTER TABLE public.chat_conversations
    DROP CONSTRAINT IF EXISTS chat_conversations_icon_check;
ALTER TABLE public.chat_conversations
    ADD CONSTRAINT chat_conversations_icon_check
    CHECK (icon IS NULL OR icon ~ '^[a-z][a-z0-9-]{0,31}$');

-- The sweeps only ever look at threads that are still open (or resolved but not
-- yet archived), so give them indexes that contain nothing else.
CREATE INDEX IF NOT EXISTS chat_conversations_open_order_idx
    ON public.chat_conversations (last_message_at)
    WHERE kind = 'order' AND resolved_at IS NULL AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS chat_conversations_resolved_unarchived_idx
    ON public.chat_conversations (resolved_at)
    WHERE resolved_at IS NOT NULL AND archived_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Policy
-- ---------------------------------------------------------------------------
--
-- app_settings is PRIMARY KEY (key, tenant_id), so tenant_id is NOT NULL and
-- there is no place to park a global row. The shipped defaults therefore live in
-- this function, and a tenant overrides them by inserting its own
-- 'chat_thread_lifecycle' row — no migration needed to retune the cadence.

CREATE OR REPLACE FUNCTION public.chat_thread_lifecycle_policy(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
    SELECT COALESCE(
        (SELECT value FROM public.app_settings
          WHERE key = 'chat_thread_lifecycle' AND tenant_id = p_tenant_id LIMIT 1),
        jsonb_build_object(
            'auto_resolve_hours', 24,
            'auto_archive_days', 30,
            'require_terminal_order_status', true,
            'stale_days', 7,
            'terminal_statuses', jsonb_build_array('delivered', 'completed', 'cancelled', 'rejected', 'refunds')
        )
    );
$$;

-- ---------------------------------------------------------------------------
-- 3. Reopen on reply
-- ---------------------------------------------------------------------------
--
-- Folded into the existing touch trigger so it cannot be bypassed by any write
-- path. System rows (status changes, the auto-resolve note itself) must NOT
-- reopen a thread, or a delivery webhook would resurrect everything it touches.

CREATE OR REPLACE FUNCTION public.chat_touch_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_was_resolved boolean;
BEGIN
    SELECT resolved_at IS NOT NULL INTO v_was_resolved
    FROM public.chat_conversations WHERE id = NEW.conversation_id;

    UPDATE public.chat_conversations
    SET last_message_at = GREATEST(COALESCE(last_message_at, NEW.created_at), NEW.created_at),
        updated_at      = now(),
        -- A real person replying means the thread is live again.
        resolved_at     = CASE WHEN NEW.is_system THEN resolved_at ELSE NULL END,
        resolved_by     = CASE WHEN NEW.is_system THEN resolved_by ELSE NULL END,
        -- Un-archive too: a reply must surface the thread, not land in cold storage.
        archived_at     = CASE WHEN NEW.is_system THEN archived_at ELSE NULL END
    WHERE id = NEW.conversation_id;

    IF v_was_resolved AND NOT NEW.is_system THEN
        INSERT INTO public.chat_messages (conversation_id, tenant_id, sender_id, body, is_system, system_event)
        VALUES (NEW.conversation_id, NEW.tenant_id, NULL, '', true,
                jsonb_build_object('type', 'thread_reopened'));
    END IF;

    RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Stage 1 — auto-resolve
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.chat_auto_resolve_threads(p_limit integer DEFAULT 500)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_row record;
    v_policy jsonb;
    v_hours int;
    v_stale_days int;
    v_require_terminal boolean;
    v_terminal text[];
    v_count int := 0;
BEGIN
    FOR v_row IN
        SELECT c.id, c.tenant_id, c.last_message_at, c.created_at, o.status AS order_status
        FROM public.chat_conversations c
        LEFT JOIN public.orders o ON o.id = c.order_id
        WHERE c.kind = 'order'
          AND c.resolved_at IS NULL
          AND c.archived_at IS NULL
        ORDER BY COALESCE(c.last_message_at, c.created_at)
        LIMIT GREATEST(COALESCE(p_limit, 500), 1)
    LOOP
        v_policy := public.chat_thread_lifecycle_policy(v_row.tenant_id);
        v_hours := COALESCE((v_policy->>'auto_resolve_hours')::int, 24);
        v_stale_days := COALESCE((v_policy->>'stale_days')::int, 7);
        v_require_terminal := COALESCE((v_policy->>'require_terminal_order_status')::boolean, true);
        SELECT array_agg(value::text) INTO v_terminal
        FROM jsonb_array_elements_text(COALESCE(v_policy->'terminal_statuses', '[]'::jsonb)) AS value;

        CONTINUE WHEN COALESCE(v_row.last_message_at, v_row.created_at) > now() - make_interval(hours => v_hours);

        -- Quiet long enough. Close it if the order is finished, or if it has been
        -- abandoned past the backstop regardless of where the order stands.
        CONTINUE WHEN v_require_terminal
                  AND NOT (v_row.order_status = ANY(COALESCE(v_terminal, ARRAY[]::text[])))
                  AND COALESCE(v_row.last_message_at, v_row.created_at) > now() - make_interval(days => v_stale_days);

        UPDATE public.chat_conversations
           SET resolved_at = now(), resolved_by = NULL, updated_at = now()
         WHERE id = v_row.id AND resolved_at IS NULL;

        INSERT INTO public.chat_messages (conversation_id, tenant_id, sender_id, body, is_system, system_event)
        VALUES (v_row.id, v_row.tenant_id, NULL, '', true,
                jsonb_build_object('type', 'thread_resolved', 'auto', true, 'after_hours', v_hours));

        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Stage 2 — auto-archive
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.chat_auto_archive_threads(p_limit integer DEFAULT 500)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_row record;
    v_days int;
    v_count int := 0;
BEGIN
    FOR v_row IN
        SELECT c.id, c.tenant_id, c.resolved_at
        FROM public.chat_conversations c
        WHERE c.kind = 'order'
          AND c.resolved_at IS NOT NULL
          AND c.archived_at IS NULL
        ORDER BY c.resolved_at
        LIMIT GREATEST(COALESCE(p_limit, 500), 1)
    LOOP
        v_days := COALESCE(
            (public.chat_thread_lifecycle_policy(v_row.tenant_id)->>'auto_archive_days')::int, 30);

        CONTINUE WHEN v_row.resolved_at > now() - make_interval(days => v_days);

        UPDATE public.chat_conversations
           SET archived_at = now(), updated_at = now()
         WHERE id = v_row.id AND archived_at IS NULL;

        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Let a member resolve without being a conversation admin, and record who
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.chat_set_conversation_resolved(p_conversation_id uuid, p_resolved boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_tenant uuid;
BEGIN
    IF NOT public.chat_is_member(p_conversation_id) THEN
        RAISE EXCEPTION 'not a member' USING ERRCODE = '42501';
    END IF;

    SELECT tenant_id INTO v_tenant FROM public.chat_conversations WHERE id = p_conversation_id;

    UPDATE public.chat_conversations
       SET resolved_at = CASE WHEN p_resolved THEN now() ELSE NULL END,
           resolved_by = CASE WHEN p_resolved THEN auth.uid() ELSE NULL END,
           updated_at  = now()
     WHERE id = p_conversation_id;

    -- Audit the manual transition the same way the sweep audits its own, but
    -- without tripping the reopen rule (is_system = true).
    INSERT INTO public.chat_messages (conversation_id, tenant_id, sender_id, body, is_system, system_event)
    VALUES (p_conversation_id, v_tenant, NULL, '', true,
            jsonb_build_object(
                'type', CASE WHEN p_resolved THEN 'thread_resolved' ELSE 'thread_reopened' END,
                'auto', false,
                'actor_name', (SELECT display_name FROM public.user_profiles WHERE id = auth.uid())));
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Naming a channel's icon
-- ---------------------------------------------------------------------------

-- Replacing the 3-argument version rather than overloading it: two functions
-- differing only by a defaulted trailing parameter make every 3-argument call
-- ambiguous, and PostgREST would start failing on the existing clients.
DROP FUNCTION IF EXISTS public.chat_create_channel(text, boolean, text);

CREATE OR REPLACE FUNCTION public.chat_create_channel(p_name text, p_is_private boolean, p_topic text, p_icon text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_tenant_id uuid; v_conv_id uuid;
BEGIN
    v_tenant_id := get_current_tenant_id();
    IF v_tenant_id IS NULL OR v_tenant_id NOT IN (SELECT get_user_tenant_ids()) THEN
        RAISE EXCEPTION 'no active tenant' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.chat_conversations (tenant_id, kind, name, topic, icon, is_private, created_by)
    VALUES (v_tenant_id, 'channel', p_name, p_topic, p_icon, p_is_private, auth.uid())
    RETURNING id INTO v_conv_id;

    INSERT INTO public.chat_members (conversation_id, user_id, role)
    VALUES (v_conv_id, auth.uid(), 'owner');

    RETURN v_conv_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.chat_set_conversation_icon(p_conversation_id uuid, p_icon text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    IF NOT public.chat_is_conversation_admin(p_conversation_id) THEN
        RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
    END IF;
    UPDATE public.chat_conversations
       SET icon = p_icon, updated_at = now()
     WHERE id = p_conversation_id;
END;
$$;

-- Broadcast icon changes too, so a renamed/re-iconed channel updates live for
-- everyone instead of only after a refetch.
DROP TRIGGER IF EXISTS trg_chat_broadcast_conversation ON public.chat_conversations;
CREATE TRIGGER trg_chat_broadcast_conversation
    AFTER UPDATE OF name, topic, icon, archived_at, resolved_at
    ON public.chat_conversations
    FOR EACH ROW EXECUTE FUNCTION public.chat_broadcast_conversation();

-- ---------------------------------------------------------------------------
-- 8. Schedules
-- ---------------------------------------------------------------------------
--
-- Stage 1 runs often enough that a thread resolves within ~15 min of coming due;
-- stage 2 is a slow daily sweep. Both are bounded and idempotent, so a missed or
-- doubled run is harmless.

SELECT cron.unschedule('chat-auto-resolve-threads')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'chat-auto-resolve-threads');

SELECT cron.unschedule('chat-auto-archive-threads')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'chat-auto-archive-threads');

SELECT cron.schedule('chat-auto-resolve-threads', '*/15 * * * *',
                     $$SELECT public.chat_auto_resolve_threads();$$);

SELECT cron.schedule('chat-auto-archive-threads', '30 3 * * *',
                     $$SELECT public.chat_auto_archive_threads();$$);
