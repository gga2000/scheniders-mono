-- Migration: Repair order activity notifications (Activity Feed)
--
-- Problem 1 (root cause): `log_order_notification()` and its trigger on `orders`
--   never existed in this project. `20260101000000_base_schema.sql` creates the
--   `order_notifications` TABLE but not the writer, and
--   `20260308100000_persistent_notifications.sql` (which creates both) was only
--   ever applied to the OLD project. Result: no row has been written since
--   2026-06-01, the date the legacy rows were migrated across.
--
-- Problem 2: the original trigger predates `order_notifications.tenant_id`
--   (added in 20260406100001) and never set it. Re-applying it verbatim would
--   write rows with tenant_id NULL, which `tenant_isolation_select`
--   (tenant_id IN get_user_tenant_ids()) filters out — a second silent failure.
--
-- Problem 3: `is_read` is a single global boolean per row, so one team member
--   opening the feed cleared the unread badge for the whole tenant. Read and
--   dismiss state becomes per-user here.

-- ---------------------------------------------------------------------------
-- 1. Tenant integrity on the notification table
-- ---------------------------------------------------------------------------

ALTER TABLE public.order_notifications
    ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE public.order_notifications
    DROP CONSTRAINT IF EXISTS order_notifications_type_check;
ALTER TABLE public.order_notifications
    ADD CONSTRAINT order_notifications_type_check
    CHECK (type IN ('order_created', 'status_change', 'order_updated'));

-- The feed is always read tenant-scoped and newest-first; the existing index is
-- on created_at alone, so every read scanned across tenants before filtering.
CREATE INDEX IF NOT EXISTS idx_order_notifications_tenant_created
    ON public.order_notifications (tenant_id, created_at DESC);

COMMENT ON COLUMN public.order_notifications.is_read IS
    'LEGACY, tenant-wide read flag. Frozen: nothing writes it after migration '
    '20260911120000. It survives only as a read floor for rows migrated before '
    '2026-06-01 (all of which are true), so that backlog does not reappear as '
    'unread. Per-user read state lives in order_notification_user_state.';

-- ---------------------------------------------------------------------------
-- 2. Per-user read / dismiss state
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.order_notification_user_state (
    notification_id UUID NOT NULL
        REFERENCES public.order_notifications(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    read_at TIMESTAMPTZ,
    dismissed_at TIMESTAMPTZ,
    PRIMARY KEY (notification_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_order_notification_user_state_user
    ON public.order_notification_user_state (user_id);

ALTER TABLE public.order_notification_user_state ENABLE ROW LEVEL SECURITY;

-- A user may only ever see or write their own state row. The notification the
-- row points at is separately gated by order_notifications' tenant policies.
DROP POLICY IF EXISTS order_notification_user_state_select
    ON public.order_notification_user_state;
CREATE POLICY order_notification_user_state_select
    ON public.order_notification_user_state FOR SELECT
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS order_notification_user_state_insert
    ON public.order_notification_user_state;
CREATE POLICY order_notification_user_state_insert
    ON public.order_notification_user_state FOR INSERT
    WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.order_notifications n
            WHERE n.id = notification_id
              AND n.tenant_id IN (SELECT get_user_tenant_ids())
        )
    );

DROP POLICY IF EXISTS order_notification_user_state_update
    ON public.order_notification_user_state;
CREATE POLICY order_notification_user_state_update
    ON public.order_notification_user_state FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS order_notification_user_state_delete
    ON public.order_notification_user_state;
CREATE POLICY order_notification_user_state_delete
    ON public.order_notification_user_state FOR DELETE
    USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. The feed the client reads
-- ---------------------------------------------------------------------------

-- security_invoker keeps both the tenant policies on order_notifications and
-- the self-only policies on order_notification_user_state in force for the
-- caller. Dismissed rows drop out for that user only.
DROP VIEW IF EXISTS public.order_notifications_feed;
CREATE VIEW public.order_notifications_feed
WITH (security_invoker = true) AS
SELECT
    n.id,
    n.tenant_id,
    n.order_id,
    n.order_display_id,
    n.type,
    n.user_name,
    n.user_avatar,
    n.message,
    n.old_status,
    n.new_status,
    n.created_at,
    (n.is_read OR s.read_at IS NOT NULL) AS is_read
FROM public.order_notifications n
LEFT JOIN public.order_notification_user_state s
    ON s.notification_id = n.id AND s.user_id = auth.uid()
WHERE s.dismissed_at IS NULL;

GRANT SELECT ON public.order_notifications_feed TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. The writer that was missing
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
BEGIN
    -- A notification nobody can read is worse than none: tenant_isolation_select
    -- would hide it forever. Orders without a tenant are not feed material.
    IF NEW.tenant_id IS NULL THEN
        RETURN NEW;
    END IF;

    v_display_id := '#' || NEW.order_id;
    v_user_name  := COALESCE(NULLIF(TRIM(NEW.last_status_changed_by_name), ''), 'Team Member');
    v_avatar     := NEW.last_status_changed_by_avatar;

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

DROP TRIGGER IF EXISTS trigger_log_order_notification ON public.orders;
CREATE TRIGGER trigger_log_order_notification
AFTER INSERT OR UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.log_order_notification();

-- A trigger function has no business being reachable over PostgREST's /rpc.
-- Calling it outside a trigger errors anyway, but the surface is free to remove.
REVOKE ALL ON FUNCTION public.log_order_notification() FROM PUBLIC, anon, authenticated;

-- Supabase's default grants hand `anon` full DML on every new table. RLS already
-- yields nothing to a caller with no auth.uid(), but the grant is still surface
-- that nothing needs — same lockdown applied to the rest of the schema.
REVOKE ALL ON public.order_notification_user_state FROM anon;
REVOKE ALL ON public.order_notifications_feed FROM anon;

REVOKE ALL ON public.order_notification_user_state FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_notification_user_state TO authenticated;

REVOKE ALL ON public.order_notifications_feed FROM authenticated;
GRANT SELECT ON public.order_notifications_feed TO authenticated;
