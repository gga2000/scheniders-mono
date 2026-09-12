-- Migration: correct actor attribution on Activity Feed entries.
--
-- Reported: an order that arrived via LightFunnels was credited to "Team Member",
-- and a status change actually made by the WhatsApp bot was too.
--
-- Cause: log_order_notification() read `orders.last_status_changed_by_name`, which
-- is not written by the statement that changes the status. It is written by
-- `update_order_last_actor`, a trigger on order_status_history that fires ~0.4s
-- LATER (the app updates the order, then inserts history separately). So at
-- notification time that column still holds the actor of the PREVIOUS change:
--   - on INSERT it is NULL        -> everything fell back to 'Team Member'
--   - on UPDATE it is off-by-one  -> #7388's third event only looked right
--                                    because the same bot made the second one.
--
-- Fix, in two parts:
--   1. Resolve the actor from the SAME event. An authenticated team member is
--      identified by auth.uid(); anything with no JWT is automation, attributed
--      to where the order actually came from (`orders.source`) rather than
--      guessed. Never read the off-by-one column again.
--   2. order_status_history carries the authoritative `changed_by`, but only for
--      ~80% of status changes (the client inserts it after the update, unawaited,
--      and swallows failures), so it cannot be the sole source. Where it does
--      arrive, it sharpens the provisional label to the exact actor.

-- ---------------------------------------------------------------------------
-- Shared actor helpers
-- ---------------------------------------------------------------------------

-- Human-readable label for an order's origin, used when no human is on the call.
CREATE OR REPLACE FUNCTION public.order_source_actor_label(p_source TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE lower(coalesce(p_source, ''))
        WHEN 'lightfunnels'  THEN 'LightFunnels'
        WHEN 'tiktok'        THEN 'TikTok'
        WHEN 'meta'          THEN 'Meta'
        WHEN 'whatsapp'      THEN 'WhatsApp'
        WHEN 'shop'          THEN 'Online Store'
        WHEN 'prime'         THEN 'Prime'
        WHEN 'excel_import'  THEN 'Excel Import'
        WHEN 'manual'        THEN 'Manual Entry'
        WHEN 'other'         THEN 'Automation'
        WHEN ''              THEN 'Automation'
        ELSE initcap(replace(p_source, '_', ' '))
    END;
$$;

-- Maps an order_status_history.changed_by token to a display name + avatar.
-- Mirrors what update_order_last_actor already did for the orders table, so both
-- the order row and the feed entry agree on who acted.
CREATE OR REPLACE FUNCTION public.resolve_status_actor(
    p_changed_by TEXT,
    OUT actor_name TEXT,
    OUT actor_avatar TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    actor_name := NULL;
    actor_avatar := NULL;

    IF p_changed_by IS NULL THEN
        RETURN;
    END IF;

    IF p_changed_by = 'whatsapp_bot' THEN
        actor_name := 'WhatsApp Bot'; actor_avatar := 'bot'; RETURN;
    ELSIF p_changed_by IN ('waseet_api', 'waseet_sync') THEN
        actor_name := 'Waseet'; actor_avatar := 'bot'; RETURN;
    END IF;

    SELECT up.display_name, up.avatar_url INTO actor_name, actor_avatar
    FROM public.user_profiles up
    WHERE up.display_name = p_changed_by OR up.email = p_changed_by
    LIMIT 1;

    IF actor_name IS NULL THEN
        actor_name := p_changed_by;
    END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. Notification writer: resolve the actor from the event at hand
-- ---------------------------------------------------------------------------

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
    IF NEW.tenant_id IS NULL THEN
        RETURN NEW;
    END IF;

    v_display_id := '#' || NEW.order_id;

    -- A JWT on the connection means a real person is making this change, and it
    -- is THIS change — no staleness possible.
    v_uid := auth.uid();
    IF v_uid IS NOT NULL THEN
        SELECT up.display_name, up.avatar_url INTO v_user_name, v_avatar
        FROM public.user_profiles up WHERE up.id = v_uid;
    END IF;

    -- No session: a webhook, cron job or edge function did this.
    --   On INSERT the order's `source` IS the actor — LightFunnels really did
    --   create it. On UPDATE it is not: LightFunnels does not move an order to
    --   "contacted", so attributing a status change to the order's origin would
    --   just be a different wrong answer. Stay honest with "Automation"; the
    --   backfill below names the exact bot once order_status_history arrives.
    IF v_user_name IS NULL OR btrim(v_user_name) = '' THEN
        v_user_name := CASE
            WHEN TG_OP = 'INSERT' THEN public.order_source_actor_label(NEW.source)
            ELSE 'Automation'
        END;
        v_avatar := NULL;
    END IF;

    IF (TG_OP = 'INSERT') THEN
        INSERT INTO public.order_notifications (
            tenant_id, order_id, order_display_id, type,
            user_name, user_avatar, message, new_status
        ) VALUES (
            NEW.tenant_id, NEW.id, v_display_id, 'order_created',
            v_user_name, v_avatar,
            'New order ' || NEW.order_id || ' created', NEW.status
        );

    ELSIF (TG_OP = 'UPDATE') THEN
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
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.log_order_notification() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Sharpen the label once the authoritative history row arrives
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_order_last_actor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_actor_name   TEXT;
    v_actor_avatar TEXT;
    v_notification_id UUID;
BEGIN
    SELECT actor_name, actor_avatar INTO v_actor_name, v_actor_avatar
    FROM public.resolve_status_actor(NEW.changed_by);

    IF v_actor_name IS NULL THEN
        RETURN NEW;
    END IF;

    UPDATE public.orders
    SET last_status_changed_by_name = v_actor_name,
        last_status_changed_by_avatar = v_actor_avatar
    WHERE id = NEW.order_id;

    -- Correct the feed entry this history row describes. Scoped to the single
    -- most recent matching entry inside a short window so a re-entered status
    -- later on cannot rewrite an older, unrelated notification.
    IF NEW.from_status IS DISTINCT FROM NEW.to_status THEN
        SELECT n.id INTO v_notification_id
        FROM public.order_notifications n
        WHERE n.order_id = NEW.order_id
          AND n.type = 'status_change'
          AND n.new_status = NEW.to_status
          AND n.old_status IS NOT DISTINCT FROM NEW.from_status
          AND n.created_at > now() - interval '5 minutes'
        ORDER BY n.created_at DESC
        LIMIT 1;

        IF v_notification_id IS NOT NULL THEN
            UPDATE public.order_notifications
            SET user_name = v_actor_name,
                user_avatar = v_actor_avatar
            WHERE id = v_notification_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Repair the rows the old resolution already mislabelled.
--
-- Scoped to entries written after the trigger was restored (2026-09-11) that
-- still carry the 'Team Member' fallback. Older rows were migrated from the
-- previous project with their actors intact and are left alone.
-- ---------------------------------------------------------------------------

UPDATE public.order_notifications n
SET user_name = public.order_source_actor_label(o.source)
FROM public.orders o
WHERE o.id = n.order_id
  AND n.type = 'order_created'
  AND n.user_name = 'Team Member'
  AND n.created_at >= '2026-09-11';

WITH resolved AS (
    SELECT n.id, a.actor_name, a.actor_avatar
    FROM public.order_notifications n
    CROSS JOIN LATERAL (
        SELECT h.changed_by
        FROM public.order_status_history h
        WHERE h.order_id = n.order_id
          AND h.to_status = n.new_status
          AND h.from_status IS NOT DISTINCT FROM n.old_status
          AND h.changed_at BETWEEN n.created_at - interval '5 minutes'
                               AND n.created_at + interval '5 minutes'
        ORDER BY h.changed_at
        LIMIT 1
    ) hist
    CROSS JOIN LATERAL public.resolve_status_actor(hist.changed_by) a
    WHERE n.type = 'status_change'
      AND n.user_name = 'Team Member'
      AND n.created_at >= '2026-09-11'
      AND a.actor_name IS NOT NULL
)
UPDATE public.order_notifications n
SET user_name = r.actor_name,
    user_avatar = r.actor_avatar
FROM resolved r
WHERE r.id = n.id;

-- Anything still on the fallback had no audit row to learn from.
UPDATE public.order_notifications
SET user_name = 'Automation'
WHERE user_name = 'Team Member' AND created_at >= '2026-09-11';
