-- A5 + E3: one preference model, one dispatcher.
--
-- Before this, "on" meant three different things: the bell's toggle wrote a row
-- in chat_notification_prefs (kind='order_alert'), desktop notifications came
-- from a client hook that consulted nothing at all, and chat sound had its own
-- path. A user could switch new-order push on and still be alerted by a channel
-- that never read that setting.

CREATE TABLE IF NOT EXISTS public.notification_prefs (
    user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    -- A notification category, or '*' for "everything not named explicitly".
    category  TEXT NOT NULL,
    in_app    BOOLEAN NOT NULL DEFAULT true,
    push      BOOLEAN NOT NULL DEFAULT true,
    sound     BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, tenant_id, category)
);

ALTER TABLE public.notification_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_prefs_self ON public.notification_prefs;
CREATE POLICY notification_prefs_self
    ON public.notification_prefs FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid() AND tenant_id IN (SELECT get_user_tenant_ids()));

REVOKE ALL ON public.notification_prefs FROM anon;
REVOKE ALL ON public.notification_prefs FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_prefs TO authenticated;

-- Carry across the one preference that already existed, so nobody who muted
-- new-order push silently gets it back.
INSERT INTO public.notification_prefs (user_id, tenant_id, category, push)
SELECT p.user_id, p.tenant_id, 'orders', false
FROM public.chat_notification_prefs p
WHERE p.kind = 'order_alert' AND p.level = 'none'
ON CONFLICT (user_id, tenant_id, category) DO UPDATE SET push = false;

-- ---------------------------------------------------------------------------
-- Channel resolution: the single answer to "should this reach this person
-- through this channel", used by every delivery path.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notification_channel_enabled(
    p_user_id   UUID,
    p_tenant_id UUID,
    p_category  TEXT,
    p_channel   TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_enabled BOOLEAN;
BEGIN
    -- Do Not Disturb silences the interrupting channels outright; the in-app
    -- feed still fills up, which is the point of it being in-app.
    IF p_channel IN ('push', 'sound') THEN
        IF EXISTS (SELECT 1 FROM public.chat_user_status s
                   WHERE s.user_id = p_user_id AND s.dnd) THEN
            RETURN false;
        END IF;
    END IF;

    -- Most specific wins: this category, then the '*' default, then on.
    SELECT CASE p_channel WHEN 'in_app' THEN in_app WHEN 'push' THEN push
                          WHEN 'sound' THEN sound ELSE true END
    INTO v_enabled
    FROM public.notification_prefs
    WHERE user_id = p_user_id AND tenant_id = p_tenant_id AND category = p_category;

    IF v_enabled IS NULL THEN
        SELECT CASE p_channel WHEN 'in_app' THEN in_app WHEN 'push' THEN push
                              WHEN 'sound' THEN sound ELSE true END
        INTO v_enabled
        FROM public.notification_prefs
        WHERE user_id = p_user_id AND tenant_id = p_tenant_id AND category = '*';
    END IF;

    RETURN COALESCE(v_enabled, true);
END;
$$;

REVOKE ALL ON FUNCTION public.notification_channel_enabled(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notification_channel_enabled(UUID, UUID, TEXT, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- The dispatcher. One trigger on `notifications` decides delivery for every
-- category, replacing notify_order_push (which fired on orders INSERT, only
-- ever covered new orders, and re-derived the audience itself).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.dispatch_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_url        TEXT;
    v_secret     TEXT;
    v_recipients UUID[];
BEGIN
    SELECT order_function_url, edge_secret INTO v_url, v_secret
    FROM public.chat_push_config WHERE id = 1;
    IF v_url IS NULL OR v_secret IS NULL THEN RETURN NEW; END IF;

    -- Who is this for, and do they want it pushed? Resolved here so the edge
    -- function never has to know about audiences or preferences.
    SELECT array_agg(u) INTO v_recipients FROM (
        SELECT DISTINCT tm.user_id AS u
        FROM public.tenant_members tm
        WHERE tm.tenant_id = NEW.tenant_id
          AND tm.status = 'active'
          AND (NEW.audience = 'tenant' OR tm.user_id = NEW.recipient_id)
          -- Never push someone their own action back at them.
          AND NOT EXISTS (
              SELECT 1 FROM public.user_profiles up
              WHERE up.id = tm.user_id AND up.display_name = NEW.actor_name)
          AND public.notification_channel_enabled(tm.user_id, NEW.tenant_id, NEW.category, 'push')
          AND EXISTS (SELECT 1 FROM public.chat_push_subscriptions s WHERE s.user_id = tm.user_id)
    ) q;

    IF v_recipients IS NULL OR array_length(v_recipients, 1) IS NULL THEN
        RETURN NEW;
    END IF;

    BEGIN
        PERFORM net.http_post(
            url     := v_url,
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || v_secret),
            body    := jsonb_build_object(
                'notification_id', NEW.id,
                'tenant_id',       NEW.tenant_id,
                'type',            NEW.type,
                'category',        NEW.category,
                'actor_name',      NEW.actor_name,
                'entity_type',     NEW.entity_type,
                'entity_id',       NEW.entity_id,
                'entity_label',    NEW.entity_label,
                'payload',         NEW.payload,
                'priority',        NEW.priority,
                'recipients',      to_jsonb(v_recipients))
        );
    EXCEPTION WHEN OTHERS THEN
        -- A push that cannot be sent must never roll back the notification that
        -- caused it; the in-app feed is the durable channel.
        NULL;
    END;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_notification() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_dispatch_notification ON public.notifications;
CREATE TRIGGER trg_dispatch_notification
AFTER INSERT ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.dispatch_notification();

-- The old order-only push trigger is now one of the dispatcher's cases. Leaving
-- it enabled would double-push every new order.
DROP TRIGGER IF EXISTS trg_notify_order_push ON public.orders;;
