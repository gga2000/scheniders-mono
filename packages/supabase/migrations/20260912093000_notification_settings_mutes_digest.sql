-- C2 (quiet hours), C3 (per-entity mute), C4 (digest mode).
--
-- These all answer the same question the dispatcher already asks — "should this
-- reach this person on this channel right now" — so they extend
-- notification_channel_enabled rather than adding parallel checks.

CREATE TABLE IF NOT EXISTS public.notification_settings (
    user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

    -- C2. Minutes from local midnight. A window that wraps past midnight
    -- (22:00 -> 07:00) is the normal case, so start > end is valid.
    quiet_hours_enabled BOOLEAN NOT NULL DEFAULT false,
    quiet_start         SMALLINT NOT NULL DEFAULT 1320 CHECK (quiet_start BETWEEN 0 AND 1439),
    quiet_end           SMALLINT NOT NULL DEFAULT 420  CHECK (quiet_end   BETWEEN 0 AND 1439),
    time_zone           TEXT NOT NULL DEFAULT 'Asia/Baghdad',

    -- C4. 'off' delivers immediately; otherwise interrupting channels are held
    -- and a summary is sent on a schedule.
    digest_mode         TEXT NOT NULL DEFAULT 'off'
                        CHECK (digest_mode IN ('off', 'hourly', 'daily')),
    digest_last_sent_at TIMESTAMPTZ,

    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, tenant_id)
);

ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_settings_self ON public.notification_settings;
CREATE POLICY notification_settings_self
    ON public.notification_settings FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid() AND tenant_id IN (SELECT get_user_tenant_ids()));

REVOKE ALL ON public.notification_settings FROM anon;
REVOKE ALL ON public.notification_settings FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_settings TO authenticated;

-- C3. Stop hearing about one specific thing, without muting its whole category.
CREATE TABLE IF NOT EXISTS public.notification_mutes (
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL,
    entity_id   UUID NOT NULL,
    tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, entity_type, entity_id)
);

ALTER TABLE public.notification_mutes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_mutes_self ON public.notification_mutes;
CREATE POLICY notification_mutes_self
    ON public.notification_mutes FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid() AND tenant_id IN (SELECT get_user_tenant_ids()));

REVOKE ALL ON public.notification_mutes FROM anon;
REVOKE ALL ON public.notification_mutes FROM authenticated;
GRANT SELECT, INSERT, DELETE ON public.notification_mutes TO authenticated;

-- Is this person inside their own quiet window right now?
CREATE OR REPLACE FUNCTION public.in_quiet_hours(p_user_id UUID, p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    s RECORD;
    v_now SMALLINT;
BEGIN
    SELECT quiet_hours_enabled, quiet_start, quiet_end, time_zone INTO s
    FROM public.notification_settings
    WHERE user_id = p_user_id AND tenant_id = p_tenant_id;

    IF s IS NULL OR NOT s.quiet_hours_enabled THEN RETURN false; END IF;

    BEGIN
        v_now := (EXTRACT(HOUR FROM now() AT TIME ZONE s.time_zone) * 60
                + EXTRACT(MINUTE FROM now() AT TIME ZONE s.time_zone))::SMALLINT;
    EXCEPTION WHEN OTHERS THEN
        -- An unknown zone must not silence someone forever.
        RETURN false;
    END;

    IF s.quiet_start = s.quiet_end THEN
        RETURN false;
    ELSIF s.quiet_start < s.quiet_end THEN
        RETURN v_now >= s.quiet_start AND v_now < s.quiet_end;
    ELSE
        -- Wraps past midnight.
        RETURN v_now >= s.quiet_start OR v_now < s.quiet_end;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.in_quiet_hours(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.in_quiet_hours(UUID, UUID) TO authenticated;

-- One gate, now covering DND, quiet hours, digest mode, and per-category prefs.
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
DECLARE
    v_enabled BOOLEAN;
    v_digest  TEXT;
BEGIN
    -- The interrupting channels answer to DND, quiet hours and digest mode; the
    -- in-app feed still fills up, which is the point of it being in-app.
    IF p_channel IN ('push', 'sound') THEN
        IF EXISTS (SELECT 1 FROM public.chat_user_status s
                   WHERE s.user_id = p_user_id AND s.dnd) THEN
            RETURN false;
        END IF;

        IF public.in_quiet_hours(p_user_id, p_tenant_id) THEN
            RETURN false;
        END IF;

        SELECT digest_mode INTO v_digest FROM public.notification_settings
        WHERE user_id = p_user_id AND tenant_id = p_tenant_id;
        IF COALESCE(v_digest, 'off') <> 'off' THEN
            RETURN false;  -- held for the scheduled summary instead
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

-- The dispatcher must also skip anyone who muted this specific thing.
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
          -- C3: muted this specific order/conversation.
          AND NOT EXISTS (
              SELECT 1 FROM public.notification_mutes m
              WHERE m.user_id = tm.user_id
                AND m.entity_type = NEW.entity_type
                AND m.entity_id = NEW.entity_id)
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
