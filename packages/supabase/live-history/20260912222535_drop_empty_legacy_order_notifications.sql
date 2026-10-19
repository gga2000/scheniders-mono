-- Retire the legacy order_notifications table.
--
-- It has been write-dead since order events began writing `notifications`
-- directly, the 90-day prune has since emptied it (0 rows), and it has no
-- triggers, no inbound foreign keys and no remaining references outside the
-- prune function itself. Everything it ever held was migrated into
-- `notifications` under the same ids.
--
-- `chat_notifications` is deliberately NOT touched: chat still writes it and the
-- mirror triggers keep the unified table in step. Retiring that side means
-- moving chat_send_message and the mention hook onto `notifications`, which is
-- its own change.

DROP TABLE IF EXISTS public.order_notifications;

-- The prune now has one order-side table to care about.
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

    -- Per-user state rows follow via ON DELETE CASCADE.
    DELETE FROM public.notifications
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

REVOKE ALL ON FUNCTION public.prune_order_notifications(INTEGER) FROM PUBLIC, anon, authenticated;;
