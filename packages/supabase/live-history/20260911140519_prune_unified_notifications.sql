-- Retention now targets the unified table as well. order_status_history is still
-- deliberately excluded: payroll and agent stats read it.
CREATE OR REPLACE FUNCTION public.prune_order_notifications(p_keep_days INTEGER DEFAULT 90)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_deleted INTEGER;
    v_total   INTEGER := 0;
BEGIN
    IF p_keep_days IS NULL OR p_keep_days < 7 THEN
        RAISE EXCEPTION 'refusing to prune with keep_days=%; minimum is 7', p_keep_days;
    END IF;

    -- Per-user state rows follow via ON DELETE CASCADE on both tables.
    DELETE FROM public.notifications
    WHERE created_at < now() - make_interval(days => p_keep_days);
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_total := v_total + v_deleted;

    DELETE FROM public.order_notifications
    WHERE created_at < now() - make_interval(days => p_keep_days);
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_total := v_total + v_deleted;

    DELETE FROM public.chat_notifications
    WHERE created_at < now() - make_interval(days => p_keep_days);
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_total := v_total + v_deleted;

    RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_order_notifications(INTEGER) FROM PUBLIC, anon, authenticated;

-- The canary must watch the table the feed now reads.
CREATE OR REPLACE FUNCTION public.check_notification_pipeline()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_orders_recent  INTEGER;
    v_notifs_recent  INTEGER;
    v_status         TEXT;
    v_detail         TEXT;
BEGIN
    SELECT count(*) INTO v_orders_recent
    FROM public.orders WHERE created_at > now() - interval '2 hours';

    SELECT count(*) INTO v_notifs_recent
    FROM public.notifications WHERE created_at > now() - interval '2 hours';

    IF v_orders_recent > 0 AND v_notifs_recent = 0 THEN
        v_status := 'fail';
        v_detail := format(
            '%s orders created in the last 2h but no notification written. Last notification: %s.',
            v_orders_recent, COALESCE((SELECT max(created_at)::text FROM public.notifications), 'never'));
    ELSIF v_orders_recent = 0 THEN
        v_status := 'ok';
        v_detail := 'No order activity in the last 2h — nothing expected.';
    ELSE
        v_status := 'ok';
        v_detail := format('%s orders, %s notifications in the last 2h.', v_orders_recent, v_notifs_recent);
    END IF;

    INSERT INTO public.system_health_checks (check_name, status, detail, observed_at, failing_since)
    VALUES (
        'notification_pipeline', v_status, v_detail, now(),
        CASE WHEN v_status = 'fail'
             THEN COALESCE((SELECT failing_since FROM public.system_health_checks
                            WHERE check_name = 'notification_pipeline' AND status = 'fail'), now())
             ELSE NULL END
    )
    ON CONFLICT (check_name) DO UPDATE
    SET status = EXCLUDED.status, detail = EXCLUDED.detail,
        observed_at = EXCLUDED.observed_at, failing_since = EXCLUDED.failing_since;

    IF v_status = 'fail' THEN
        RAISE WARNING '[health] notification_pipeline FAIL: %', v_detail;
    END IF;

    RETURN v_status;
END;
$$;

REVOKE ALL ON FUNCTION public.check_notification_pipeline() FROM PUBLIC, anon, authenticated;;
