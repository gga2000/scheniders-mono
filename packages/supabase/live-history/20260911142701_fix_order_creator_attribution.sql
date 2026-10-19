-- Two bugs, one cause: neither creation trigger looked at the creator the app
-- actually sends.
--
-- Order creation runs as a Server Action through a SERVICE-ROLE client
-- (create-order-core.ts), so `auth.uid()` is NULL inside these triggers — there
-- is no JWT on that connection. The creating employee is instead carried on the
-- row itself: the UI puts their display name and avatar in
-- `last_status_changed_by_name` / `_avatar`, and create_order_atomic persists
-- both. On INSERT that column is the creator and is NOT stale (the off-by-one
-- problem only applies to UPDATE, where it still holds the previous actor).
--
-- Bug 1: log_order_notification ignored it, so a manually-created order was
--        credited to `source` — which is the MARKETING CHANNEL the customer came
--        from (whatsapp/meta/tiktok), not whoever keyed the order in.
-- Bug 2 (regression from 20260911180000): log_order_creation_history wrote the
--        source label as `changed_by`, which fired update_order_last_actor and
--        OVERWROTE the real creator's name on the order row.

CREATE OR REPLACE FUNCTION public.resolve_order_creation_actor(
    p_order   public.orders,
    OUT actor_name   TEXT,
    OUT actor_avatar TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_uid UUID;
BEGIN
    -- 1. Whoever the app says created it.
    actor_name   := NULLIF(btrim(COALESCE(p_order.last_status_changed_by_name, '')), '');
    actor_avatar := p_order.last_status_changed_by_avatar;
    IF actor_name IS NOT NULL THEN RETURN; END IF;

    -- 2. A signed-in caller (direct client writes, not the server action).
    v_uid := auth.uid();
    IF v_uid IS NOT NULL THEN
        SELECT up.display_name, up.avatar_url INTO actor_name, actor_avatar
        FROM public.user_profiles up WHERE up.id = v_uid;
        actor_name := NULLIF(btrim(COALESCE(actor_name, '')), '');
        IF actor_name IS NOT NULL THEN RETURN; END IF;
    END IF;

    -- 3. Nobody claimed it: automated ingestion. Only name a channel when it
    --    really is the origin system; a marketing source is not an author.
    actor_avatar := NULL;
    actor_name := CASE lower(COALESCE(p_order.source, ''))
        WHEN 'lightfunnels' THEN 'LightFunnels'
        ELSE 'Automation'
    END;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_order_creation_actor(public.orders) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.log_order_creation_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_name TEXT; v_avatar TEXT;
BEGIN
    IF NEW.tenant_id IS NULL THEN RETURN NEW; END IF;

    SELECT actor_name, actor_avatar INTO v_name, v_avatar
    FROM public.resolve_order_creation_actor(NEW);

    INSERT INTO public.order_status_history (
        order_id, from_status, to_status, changed_by, changed_at, notes, tenant_id
    ) VALUES (
        NEW.id, NULL, NEW.status, v_name, NEW.created_at, 'Order Created', NEW.tenant_id
    );

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.log_order_creation_history() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.log_order_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_display_id TEXT;
    v_user_name  TEXT;
    v_avatar     TEXT;
    v_uid        UUID;
BEGIN
    IF NEW.tenant_id IS NULL THEN RETURN NEW; END IF;

    v_display_id := '#' || NEW.order_id;

    IF (TG_OP = 'INSERT') THEN
        SELECT actor_name, actor_avatar INTO v_user_name, v_avatar
        FROM public.resolve_order_creation_actor(NEW);

        INSERT INTO public.order_notifications (
            tenant_id, order_id, order_display_id, type,
            user_name, user_avatar, message, new_status
        ) VALUES (
            NEW.tenant_id, NEW.id, v_display_id, 'order_created',
            v_user_name, v_avatar,
            'New order ' || NEW.order_id || ' created', NEW.status
        );

        RETURN NEW;
    END IF;

    -- UPDATE: last_status_changed_by_name is written ~0.4s later by
    -- update_order_last_actor, so here it still holds the PREVIOUS actor and
    -- must not be trusted. A signed-in caller identifies themselves; otherwise
    -- the exact automation is named once order_status_history lands.
    v_uid := auth.uid();
    IF v_uid IS NOT NULL THEN
        SELECT up.display_name, up.avatar_url INTO v_user_name, v_avatar
        FROM public.user_profiles up WHERE up.id = v_uid;
    END IF;
    IF v_user_name IS NULL OR btrim(v_user_name) = '' THEN
        v_user_name := 'Automation';
        v_avatar := NULL;
    END IF;

    IF (OLD.status IS DISTINCT FROM NEW.status) THEN
        INSERT INTO public.order_notifications (
            tenant_id, order_id, order_display_id, type,
            user_name, user_avatar, message, old_status, new_status
        ) VALUES (
            NEW.tenant_id, NEW.id, v_display_id, 'status_change',
            v_user_name, v_avatar,
            'Order ' || NEW.order_id || ' status changed: '
                || OLD.status || ' → ' || NEW.status,
            OLD.status, NEW.status
        );

    ELSIF (OLD.customer_name IS DISTINCT FROM NEW.customer_name
           OR OLD.phone IS DISTINCT FROM NEW.phone
           OR OLD.items::TEXT IS DISTINCT FROM NEW.items::TEXT) THEN
        INSERT INTO public.order_notifications (
            tenant_id, order_id, order_display_id, type,
            user_name, user_avatar, message
        ) VALUES (
            NEW.tenant_id, NEW.id, v_display_id, 'order_updated',
            v_user_name, v_avatar,
            'Order ' || NEW.order_id || ' was updated'
        );
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.log_order_notification() FROM PUBLIC, anon, authenticated;;
