-- Wave 1 — notification integrity: creation audit, retention, pipeline canary.
--
-- A2. Creation history was written by the CLIENT (use-order-crud createOrder), so
--     only orders created through the UI got one. Orders ingested by the
--     LightFunnels webhook never did — webhook-handler.ts writes no history at
--     all. Measured over 14 days: whatsapp 99.3%, shop/meta/tiktok/other 100%,
--     lightfunnels 35.7%. The daily decline we saw (100% on Sep 4 -> 19% on
--     Sep 10) was not a regression, just LightFunnels taking a larger share.
--
--     Moving the write into the database covers every ingestion path at once —
--     webhook, cron, client, Excel import, and anything added later — instead of
--     asking each new path to remember. The client-side insert is removed in the
--     same change so nothing is written twice.
--
--     Historical gaps are deliberately NOT backfilled: for an order that has
--     since moved status we cannot know what its status was at creation, and a
--     fabricated audit row is worse than a missing one.

CREATE OR REPLACE FUNCTION public.log_order_creation_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_actor TEXT;
    v_uid   UUID;
BEGIN
    IF NEW.tenant_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Same actor rule as the Activity Feed, so the audit log and the feed never
    -- disagree about who created an order.
    v_uid := auth.uid();
    IF v_uid IS NOT NULL THEN
        SELECT up.display_name INTO v_actor FROM public.user_profiles up WHERE up.id = v_uid;
    END IF;
    IF v_actor IS NULL OR btrim(v_actor) = '' THEN
        v_actor := public.order_source_actor_label(NEW.source);
    END IF;

    INSERT INTO public.order_status_history (
        order_id, from_status, to_status, changed_by, changed_at, notes, tenant_id
    ) VALUES (
        NEW.id, NULL, NEW.status, v_actor, NEW.created_at, 'Order Created', NEW.tenant_id
    );

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.log_order_creation_history() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_log_order_creation_history ON public.orders;
CREATE TRIGGER trg_log_order_creation_history
AFTER INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.log_order_creation_history();

-- ---------------------------------------------------------------------------
-- A4. Retention.
--
-- Only order_notifications is pruned. order_status_history is NOT: payroll,
-- agent confirmation stats and the order timeline all read it, and losing old
-- rows there would silently change reported figures.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.prune_order_notifications(p_keep_days INTEGER DEFAULT 90)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_deleted INTEGER;
BEGIN
    IF p_keep_days IS NULL OR p_keep_days < 7 THEN
        RAISE EXCEPTION 'refusing to prune with keep_days=%; minimum is 7', p_keep_days;
    END IF;

    -- order_notification_user_state rows follow via ON DELETE CASCADE.
    DELETE FROM public.order_notifications
    WHERE created_at < now() - make_interval(days => p_keep_days);

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_order_notifications(INTEGER) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- G1. Pipeline canary.
--
-- The feed died for 102 days and nothing noticed. A check on "has a
-- notification been written recently" alone would false-alarm every quiet
-- night, so this compares the pipeline against real order activity: orders are
-- flowing but notifications are not = broken, and that is exactly the shape the
-- outage had.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.system_health_checks (
    check_name     TEXT PRIMARY KEY,
    status         TEXT NOT NULL CHECK (status IN ('ok', 'warn', 'fail')),
    detail         TEXT,
    observed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    failing_since  TIMESTAMPTZ
);

ALTER TABLE public.system_health_checks ENABLE ROW LEVEL SECURITY;

-- Operational status, readable by any signed-in staff member; only the cron
-- job (SECURITY DEFINER) writes it.
DROP POLICY IF EXISTS system_health_checks_read ON public.system_health_checks;
CREATE POLICY system_health_checks_read
    ON public.system_health_checks FOR SELECT
    USING (auth.uid() IS NOT NULL);

REVOKE ALL ON public.system_health_checks FROM anon;
REVOKE ALL ON public.system_health_checks FROM authenticated;
GRANT SELECT ON public.system_health_checks TO authenticated;

CREATE OR REPLACE FUNCTION public.check_notification_pipeline()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_orders_recent  INTEGER;
    v_notifs_recent  INTEGER;
    v_last_notif     TIMESTAMPTZ;
    v_status         TEXT;
    v_detail         TEXT;
    v_prev_status    TEXT;
BEGIN
    SELECT count(*) INTO v_orders_recent
    FROM public.orders WHERE created_at > now() - interval '2 hours';

    SELECT count(*), max(created_at) INTO v_notifs_recent, v_last_notif
    FROM public.order_notifications WHERE created_at > now() - interval '2 hours';

    IF v_orders_recent > 0 AND v_notifs_recent = 0 THEN
        v_status := 'fail';
        v_detail := format(
            '%s orders created in the last 2h but no notification written. Last notification: %s.',
            v_orders_recent, COALESCE((SELECT max(created_at)::text FROM public.order_notifications), 'never'));
    ELSIF v_orders_recent = 0 THEN
        v_status := 'ok';
        v_detail := 'No order activity in the last 2h — nothing expected.';
    ELSE
        v_status := 'ok';
        v_detail := format('%s orders, %s notifications in the last 2h.', v_orders_recent, v_notifs_recent);
    END IF;

    SELECT status INTO v_prev_status
    FROM public.system_health_checks WHERE check_name = 'notification_pipeline';

    INSERT INTO public.system_health_checks (check_name, status, detail, observed_at, failing_since)
    VALUES (
        'notification_pipeline', v_status, v_detail, now(),
        CASE WHEN v_status = 'fail'
             THEN COALESCE((SELECT failing_since FROM public.system_health_checks
                            WHERE check_name = 'notification_pipeline' AND status = 'fail'), now())
             ELSE NULL END
    )
    ON CONFLICT (check_name) DO UPDATE
    SET status = EXCLUDED.status,
        detail = EXCLUDED.detail,
        observed_at = EXCLUDED.observed_at,
        failing_since = EXCLUDED.failing_since;

    -- Surfaces in the Postgres error log, which is where this kind of outage
    -- actually gets noticed.
    IF v_status = 'fail' THEN
        RAISE WARNING '[health] notification_pipeline FAIL: %', v_detail;
    END IF;

    RETURN v_status;
END;
$$;

REVOKE ALL ON FUNCTION public.check_notification_pipeline() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Schedules
-- ---------------------------------------------------------------------------

SELECT cron.unschedule('prune-order-notifications')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prune-order-notifications');
SELECT cron.schedule('prune-order-notifications', '40 3 * * *',
                     $$SELECT public.prune_order_notifications(90);$$);

SELECT cron.unschedule('check-notification-pipeline')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'check-notification-pipeline');
SELECT cron.schedule('check-notification-pipeline', '*/15 * * * *',
                     $$SELECT public.check_notification_pipeline();$$);
