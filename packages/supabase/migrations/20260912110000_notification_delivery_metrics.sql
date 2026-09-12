-- G2 + G3: know whether notifications are actually arriving.
--
-- Until now there was no way to tell push worked beyond someone reporting that
-- it didn't — which is how zero subscriptions went unnoticed across 23 members.

CREATE TABLE IF NOT EXISTS public.notification_deliveries (
    id              BIGSERIAL PRIMARY KEY,
    notification_id UUID,
    tenant_id       UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    channel         TEXT NOT NULL CHECK (channel IN ('push', 'in_app', 'sound')),
    status          TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'pruned', 'clicked')),
    detail          TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_tenant_created
    ON public.notification_deliveries (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_notification
    ON public.notification_deliveries (notification_id);

ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;

-- Operational telemetry: readable by members of the tenant it concerns; only
-- the edge function (service role) writes it.
DROP POLICY IF EXISTS notification_deliveries_read ON public.notification_deliveries;
CREATE POLICY notification_deliveries_read
    ON public.notification_deliveries FOR SELECT
    USING (tenant_id IN (SELECT get_user_tenant_ids()));

REVOKE ALL ON public.notification_deliveries FROM anon;
REVOKE ALL ON public.notification_deliveries FROM authenticated;
GRANT SELECT ON public.notification_deliveries TO authenticated;
REVOKE ALL ON SEQUENCE public.notification_deliveries_id_seq FROM anon, authenticated;

-- Deliveries are pure telemetry; 30 days is plenty to spot a broken channel.
CREATE OR REPLACE FUNCTION public.prune_notification_deliveries(p_keep_days INTEGER DEFAULT 30)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_deleted INTEGER;
BEGIN
    DELETE FROM public.notification_deliveries
    WHERE created_at < now() - make_interval(days => GREATEST(COALESCE(p_keep_days, 30), 1));
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_notification_deliveries(INTEGER) FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule('prune-notification-deliveries')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prune-notification-deliveries');
SELECT cron.schedule('prune-notification-deliveries', '50 3 * * *',
                     $$SELECT public.prune_notification_deliveries(30);$$);

-- G3. Volume and reach per tenant per day — spot the tenant being buried in
-- noise before they mute everything, and the channel that stopped working.
CREATE OR REPLACE FUNCTION public.notification_stats(p_days INTEGER DEFAULT 7)
RETURNS TABLE (
    day            DATE,
    category       TEXT,
    notifications  BIGINT,
    push_sent      BIGINT,
    push_failed    BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_tenants UUID[];
BEGIN
    IF auth.uid() IS NULL THEN RETURN; END IF;
    SELECT array_agg(t) INTO v_tenants FROM public.get_user_tenant_ids() t;
    IF v_tenants IS NULL THEN RETURN; END IF;

    RETURN QUERY
    SELECT n.created_at::date AS day,
           n.category,
           count(*) AS notifications,
           count(d.id) FILTER (WHERE d.status = 'sent')   AS push_sent,
           count(d.id) FILTER (WHERE d.status = 'failed') AS push_failed
    FROM public.notifications n
    LEFT JOIN public.notification_deliveries d
           ON d.notification_id = n.id AND d.channel = 'push'
    WHERE n.tenant_id = ANY (v_tenants)
      AND n.created_at > now() - make_interval(days => GREATEST(COALESCE(p_days, 7), 1))
    GROUP BY 1, 2
    ORDER BY 1 DESC, 3 DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.notification_stats(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notification_stats(INTEGER) TO authenticated;
