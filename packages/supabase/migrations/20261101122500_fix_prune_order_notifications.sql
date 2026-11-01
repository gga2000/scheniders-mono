-- prune_order_notifications still deleted from public.chat_notifications,
-- which was dropped on 2026-09-16. Every daily cron run since then failed and
-- rolled back, so public.notifications was never pruned. Drop that statement.
CREATE OR REPLACE FUNCTION public.prune_order_notifications(p_keep_days integer DEFAULT 90)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_deleted INTEGER;
BEGIN
    IF p_keep_days IS NULL OR p_keep_days < 7 THEN
        RAISE EXCEPTION 'refusing to prune with keep_days=%; minimum is 7', p_keep_days;
    END IF;

    -- Per-user state rows follow via ON DELETE CASCADE.
    DELETE FROM public.notifications
    WHERE created_at < now() - make_interval(days => p_keep_days);
    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    RETURN v_deleted;
END;
$function$;
